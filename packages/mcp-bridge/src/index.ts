import { createRuntimeServices } from "../../../scripts/config.ts";

interface BridgeRequest {
  readonly tool: string;
  readonly cwd?: string;
  readonly args?: Record<string, unknown>;
}

const toString = (value: unknown): string | undefined => {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
};

const handleBootstrap = async (request: BridgeRequest) => {
  const cwd = request.cwd ?? process.cwd();
  const { project, hotClient, runtime } = createRuntimeServices(cwd, "bridge");
  try {
    return await runtime.buildBootstrap({
      project,
      mode:
        request.args?.mode === "warm" || request.args?.mode === "cold"
          ? (request.args.mode as "warm" | "cold")
          : "fast",
      query: toString(request.args?.query) ?? null,
      allowColdRecall: request.args?.allowColdRecall !== false,
    });
  } finally {
    hotClient.close();
  }
};

const handleInspect = async (request: BridgeRequest) => {
  const cwd = request.cwd ?? process.cwd();
  const { project, hotClient } = createRuntimeServices(cwd, "bridge");
  try {
    return await hotClient.readProjectCapsule(project.id);
  } finally {
    hotClient.close();
  }
};

const handlePromote = async (request: BridgeRequest) => {
  const cwd = request.cwd ?? process.cwd();
  const { project, hotClient, runtime } = createRuntimeServices(cwd, "bridge");
  try {
    const capsule = await hotClient.readProjectCapsule(project.id);
    if (!capsule) {
      return { ok: false, reason: "capsule_missing" };
    }
    await runtime.promote({
      projectId: project.id,
      title: toString(request.args?.title) ?? `${project.id}-promotion`,
      summary: capsule.summary,
      facts: capsule.supportingFacts.map((item) => item.summary),
      sourceSessionId: null,
    });
    return { ok: true };
  } finally {
    hotClient.close();
  }
};

const handlers: Record<string, (request: BridgeRequest) => Promise<unknown>> = {
  bootstrap_project: handleBootstrap,
  inspect_project: handleInspect,
  promote_project: handlePromote,
};

export const handleBridgeRequest = async (
  request: BridgeRequest,
): Promise<unknown> => {
  const handler = handlers[request.tool];
  if (!handler) {
    return { ok: false, reason: `unknown_tool:${request.tool}` };
  }
  return handler(request);
};
