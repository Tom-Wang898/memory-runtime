import type {
  BootstrapPayload,
  CapsuleRequest,
  HostAdapter,
  MemoryRuntime,
} from "@memory-runtime/memory-core";

const createFallbackNotes = (request: CapsuleRequest): readonly string[] => [
  `No bootstrap capsule found for ${request.project.id}.`,
  "Proceed with the raw user request and local project context.",
];

export const createClaudeHostAdapter = (
  runtime: MemoryRuntime,
): HostAdapter => ({
  bootstrap: async (input) => {
    const payload = await runtime.buildBootstrap(input);
    return payload.capsule
      ? payload
      : { ...payload, fallbackNotes: createFallbackNotes(input) };
  },
  checkpoint: async (record) => runtime.checkpoint(record),
});

export const renderClaudeBootstrap = (payload: BootstrapPayload): string => {
  if (!payload.capsule) {
    return payload.fallbackNotes.join("\n");
  }
  return [
    "<memory_runtime_bootstrap>",
    `project=${payload.project.id}`,
    `summary=${payload.capsule.summary}`,
    payload.capsule.activeTask
      ? `active_task=${payload.capsule.activeTask}`
      : "",
    payload.capsule.nextStep
      ? `next_step=${payload.capsule.nextStep}`
      : "",
    `constraints=${payload.capsule.constraints.map((item) => item.summary).join(" | ")}`,
    `open_loops=${payload.capsule.openLoops.map((item) => item.summary).join(" | ")}`,
    `decisions=${payload.capsule.recentDecisions.map((item) => item.summary).join(" | ")}`,
    `facts=${payload.capsule.supportingFacts.map((item) => item.summary).join(" | ")}`,
    "</memory_runtime_bootstrap>",
  ]
    .filter(Boolean)
    .join("\n");
};
