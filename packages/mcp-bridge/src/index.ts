import { createRuntimeServices } from "../../../scripts/config.ts";
import { buildCheckpointRecord } from "../../../scripts/project-context.ts";
import type { FactHit } from "../../memory-core/src/index.ts";

interface BridgeRequest {
  readonly tool: string;
  readonly cwd?: string;
  readonly args?: Record<string, unknown>;
}

interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: "memory_bootstrap",
    description:
      "Build a compact project primer for the current workspace using hot and cold memory.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        projectHint: { type: "string" },
        query: { type: "string" },
        mode: { type: "string", enum: ["fast", "warm", "cold"] },
        allowColdRecall: { type: "boolean" },
      },
      required: ["cwd"],
      additionalProperties: false,
    },
  },
  {
    name: "memory_checkpoint",
    description:
      "Persist the latest task summary, decisions, and open loops for the current workspace.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        projectHint: { type: "string" },
        sessionId: { type: "string" },
        summary: { type: "string" },
        activeTask: { type: "string" },
        decisions: { type: "array", items: { type: "string" } },
        openLoops: { type: "array", items: { type: "string" } },
      },
      required: ["cwd"],
      additionalProperties: false,
    },
  },
  {
    name: "memory_search",
    description:
      "Search project memory with a strict result limit for use inside app sessions.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        projectHint: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["cwd", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "memory_project_state",
    description:
      "Inspect current project memory availability, recent capsule state, and primer presence.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        projectHint: { type: "string" },
      },
      required: ["cwd"],
      additionalProperties: false,
    },
  },
];

const toString = (value: unknown): string | undefined => {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
};

const toStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : [];

const toPositiveLimit = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), 8);
};

const buildProjectResolutionHints = (
  args: Record<string, unknown> | undefined,
) => ({
  projectHint: toString(args?.projectHint) ?? null,
  queryHint: [
    toString(args?.query),
    toString(args?.activeTask),
    toString(args?.summary),
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || null,
});

const dedupeFactHits = (items: readonly FactHit[]): readonly FactHit[] => {
  const unique = new Map<string, FactHit>();
  for (const item of items) {
    const key = `${item.sourceUri}::${item.summary}`;
    if (!unique.has(key)) {
      unique.set(key, item);
    }
  }
  return [...unique.values()];
};

const handleBootstrap = async (request: BridgeRequest) => {
  const cwd = request.cwd ?? process.cwd();
  const query = toString(request.args?.query) ?? null;
  const { project, hotClient, runtime } = createRuntimeServices(
    cwd,
    "app",
    buildProjectResolutionHints(request.args),
  );
  try {
    const payload = await runtime.buildBootstrap({
      project,
      mode:
        request.args?.mode === "warm" || request.args?.mode === "cold"
          ? request.args.mode
          : "fast",
      query,
      allowColdRecall: request.args?.allowColdRecall !== false,
    });
    return {
      project: payload.project,
      mode: payload.mode,
      backgroundSummary: payload.backgroundSummary ?? payload.capsule?.summary ?? null,
      backgroundPoints: payload.backgroundPoints ?? [],
      currentFocus: payload.currentFocus ?? [],
      recentProgress: payload.recentProgress ?? [],
      capsule: payload.capsule,
      fallbackNotes: payload.fallbackNotes,
      diagnostics: payload.diagnostics,
    };
  } finally {
    hotClient.close();
  }
};

const handleCheckpoint = async (request: BridgeRequest) => {
  const cwd = request.cwd ?? process.cwd();
  const { project, hotClient, runtime } = createRuntimeServices(
    cwd,
    "app",
    buildProjectResolutionHints(request.args),
  );
  try {
    const record = buildCheckpointRecord({
      project,
      sessionId: toString(request.args?.sessionId) ?? null,
      summary: toString(request.args?.summary) ?? null,
      activeTask: toString(request.args?.activeTask) ?? null,
      decisions: toStringArray(request.args?.decisions),
      openLoops: toStringArray(request.args?.openLoops),
    });
    await runtime.checkpoint(record);
    return { ok: true, projectId: project.id };
  } finally {
    hotClient.close();
  }
};

const handleSearch = async (request: BridgeRequest) => {
  const cwd = request.cwd ?? process.cwd();
  const query = toString(request.args?.query);
  const { project, hotClient, coldProvider } = createRuntimeServices(
    cwd,
    "app",
    buildProjectResolutionHints(request.args),
  );
  try {
    if (!query || !coldProvider) {
      return { query: query ?? "", hits: [] };
    }
    const projectId = String(project.memoryNamespace ?? project.id);
    const [gistHits, factHits] = await Promise.all([
      coldProvider.searchGists(projectId, query),
      coldProvider.searchFacts(projectId, query),
    ]);
    const hits = dedupeFactHits([...gistHits, ...factHits]).slice(
      0,
      toPositiveLimit(request.args?.limit, 4),
    );
    return { query, hits };
  } finally {
    hotClient.close();
  }
};

const handleProjectState = async (request: BridgeRequest) => {
  const cwd = request.cwd ?? process.cwd();
  const { project, hotClient, coldProvider } = createRuntimeServices(
    cwd,
    "app",
    buildProjectResolutionHints(request.args),
  );
  try {
    const capsule = await hotClient.readProjectCapsule(project.id);
    const primer =
      coldProvider?.readProjectPrimer
        ? await coldProvider.readProjectPrimer(String(project.memoryNamespace ?? project.id))
        : [];
    return {
      project,
      hasCapsule: capsule !== null,
      hasPrimer: primer.length > 0,
      primerCount: primer.length,
      capsuleSummary: capsule?.summary ?? null,
      activeTask: capsule?.activeTask ?? null,
      openLoopCount: capsule?.openLoops.length ?? 0,
      decisionCount: capsule?.recentDecisions.length ?? 0,
      workingSetCount: capsule?.workingSet.length ?? 0,
    };
  } finally {
    hotClient.close();
  }
};

const handleInspect = async (request: BridgeRequest) => {
  const cwd = request.cwd ?? process.cwd();
  const { project, hotClient } = createRuntimeServices(
    cwd,
    "bridge",
    buildProjectResolutionHints(request.args),
  );
  try {
    return await hotClient.readProjectCapsule(project.id);
  } finally {
    hotClient.close();
  }
};

const handlePromote = async (request: BridgeRequest) => {
  const cwd = request.cwd ?? process.cwd();
  const { project, hotClient, runtime } = createRuntimeServices(
    cwd,
    "bridge",
    buildProjectResolutionHints(request.args),
  );
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
  memory_bootstrap: handleBootstrap,
  memory_checkpoint: handleCheckpoint,
  memory_search: handleSearch,
  memory_project_state: handleProjectState,
};

export const listMcpTools = (): readonly McpToolDefinition[] => MCP_TOOLS;

export const handleBridgeRequest = async (
  request: BridgeRequest,
): Promise<unknown> => {
  const handler = handlers[request.tool];
  if (!handler) {
    return { ok: false, reason: `unknown_tool:${request.tool}` };
  }
  return handler(request);
};
