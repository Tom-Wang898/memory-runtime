import {
  MemoryRuntime,
  type ProjectIdentity,
} from "../packages/memory-core/src/index.ts";
import {
  createSqliteHotMemoryClient,
  createSqliteHotMemoryProvider,
} from "../packages/hot-memory-sqlite/src/index.ts";
import {
  detectProjectIdentity,
  resolveHotDatabasePath,
  normalizeMode,
} from "./config.ts";
import {
  startStdioMcpServer,
  type McpToolDefinition,
} from "./mcp-stdio.ts";
import { buildCheckpointRecord } from "./project-context.ts";

interface ToolArguments {
  readonly cwd?: string;
  readonly projectHint?: string;
  readonly query?: string;
  readonly mode?: string;
  readonly sessionId?: string;
  readonly summary?: string;
  readonly activeTask?: string;
  readonly nextStep?: string;
  readonly constraints?: readonly unknown[];
  readonly decisions?: readonly unknown[];
  readonly openLoops?: readonly unknown[];
}

const SERVER_INFO = {
  name: "memory-hot",
  version: "0.1.0",
} as const;

const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: "memory_hot_state",
    description:
      "Inspect local hot memory for a project without touching cold memory or Docker.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        projectHint: { type: "string" },
        query: { type: "string" },
      },
      required: ["cwd"],
      additionalProperties: false,
    },
  },
  {
    name: "memory_hot_continuity",
    description:
      "Return compact local hot continuity for the current task. Never calls cold memory.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        projectHint: { type: "string" },
        query: { type: "string" },
        mode: { type: "string", enum: ["fast", "warm", "cold"] },
      },
      required: ["cwd"],
      additionalProperties: false,
    },
  },
  {
    name: "memory_hot_checkpoint",
    description:
      "Persist current task state into local hot memory without promoting to cold memory.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        projectHint: { type: "string" },
        query: { type: "string" },
        sessionId: { type: "string" },
        summary: { type: "string" },
        activeTask: { type: "string" },
        nextStep: { type: "string" },
        constraints: { type: "array", items: { type: "string" } },
        decisions: { type: "array", items: { type: "string" } },
        openLoops: { type: "array", items: { type: "string" } },
      },
      required: ["cwd"],
      additionalProperties: false,
    },
  },
];

const toStringValue = (value: unknown): string | undefined => {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
};

const toStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : [];

const resolveProject = (args: ToolArguments) =>
  detectProjectIdentity(args.cwd ?? process.cwd(), "codex", {
    projectHint: toStringValue(args.projectHint) ?? null,
    queryHint: toStringValue(args.query) ?? null,
  });

const withHotRuntime = async <T>(
  args: ToolArguments,
  callback: (
    runtime: MemoryRuntime,
    project: ProjectIdentity,
    hotClient: ReturnType<typeof createSqliteHotMemoryClient>,
  ) => Promise<T>,
): Promise<T> => {
  const project = resolveProject(args);
  const hotClient = createSqliteHotMemoryClient({
    databasePath: resolveHotDatabasePath(),
  });
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    null,
    undefined,
    hotClient.createObserver(),
  );
  try {
    return await callback(runtime, project, hotClient);
  } finally {
    hotClient.close();
  }
};

const handleHotState = async (args: ToolArguments): Promise<unknown> =>
  await withHotRuntime(args, async (_runtime, project, hotClient) => {
    const capsule = await hotClient.readProjectCapsule(project.id);
    return {
      project,
      hasCapsule: Boolean(capsule),
      summary: capsule?.summary ?? null,
      activeTask: capsule?.activeTask ?? null,
      nextStep: capsule?.nextStep ?? null,
      constraintCount: capsule?.constraints.length ?? 0,
      openLoopCount: capsule?.openLoops.length ?? 0,
      decisionCount: capsule?.recentDecisions.length ?? 0,
      workingSetCount: capsule?.workingSet.length ?? 0,
      generatedAt: capsule?.generatedAt ?? null,
    };
  });

const handleHotContinuity = async (args: ToolArguments): Promise<unknown> =>
  await withHotRuntime(args, async (runtime, project) => {
    const payload = await runtime.buildContinuity({
      project,
      mode: normalizeMode(toStringValue(args.mode)),
      query: toStringValue(args.query) ?? null,
      sessionId: null,
      budget: { targetTokens: 160, hardLimitTokens: 220 },
    });
    return {
      project: payload.project,
      continuitySummary: payload.continuitySummary,
      continuityPoints: payload.continuityPoints,
      fallbackNotes: payload.fallbackNotes,
      diagnostics: payload.diagnostics,
    };
  });

const handleHotCheckpoint = async (args: ToolArguments): Promise<unknown> =>
  await withHotRuntime(args, async (runtime, project) => {
    const record = buildCheckpointRecord({
      project,
      sessionId: toStringValue(args.sessionId) ?? null,
      summary: toStringValue(args.summary) ?? null,
      activeTask: toStringValue(args.activeTask) ?? null,
      nextStep: toStringValue(args.nextStep) ?? null,
      constraints: toStringArray(args.constraints),
      decisions: toStringArray(args.decisions),
      openLoops: toStringArray(args.openLoops),
    });
    await runtime.checkpoint(record);
    return { ok: true, projectId: project.id };
  });

const handleToolCall = async (
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> => {
  const handlers: Record<string, (input: ToolArguments) => Promise<unknown>> = {
    memory_hot_state: handleHotState,
    memory_hot_continuity: handleHotContinuity,
    memory_hot_checkpoint: handleHotCheckpoint,
  };
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`unknown_tool:${name}`);
  }
  return await handler(args as ToolArguments);
};

startStdioMcpServer({
  serverInfo: SERVER_INFO,
  tools: MCP_TOOLS,
  handleToolCall,
});
