import type {
  BootstrapPayload,
  CapsuleRequest,
  DecisionRecord,
  HostAdapter,
  MemoryRuntime,
  OpenLoop,
  WorkingSetEntry,
} from "@memory-runtime/memory-core";

const renderList = (title: string, items: readonly string[]): string => {
  if (items.length === 0) {
    return "";
  }
  const lines = items.map((item) => `- ${item}`).join("\n");
  return `## ${title}\n${lines}\n`;
};

const renderDecisions = (items: readonly DecisionRecord[]): string[] =>
  items.map((item) => `${item.summary} | reason: ${item.reason}`);

const renderOpenLoops = (items: readonly OpenLoop[]): string[] =>
  items.map((item) => `[${item.severity}] ${item.summary}`);

const renderWorkingSet = (items: readonly WorkingSetEntry[]): string[] =>
  items.map((item) => `${item.kind}: ${item.label} -> ${item.value}`);

const createFallbackNotes = (request: CapsuleRequest): readonly string[] => [
  `No hot capsule found for ${request.project.id}.`,
  "Continue with the raw user request and live repository context.",
];

export const createCodexHostAdapter = (
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

export const renderCodexBootstrap = (payload: BootstrapPayload): string => {
  if (!payload.capsule) {
    return payload.fallbackNotes.join("\n");
  }

  const sections = [
    `# Memory Runtime Bootstrap`,
    `project: ${payload.project.id}`,
    `mode: ${payload.mode}`,
    `summary: ${payload.capsule.summary}`,
    payload.capsule.activeTask ? `active_task: ${payload.capsule.activeTask}` : "",
    renderList("Open Loops", renderOpenLoops(payload.capsule.openLoops)),
    renderList("Recent Decisions", renderDecisions(payload.capsule.recentDecisions)),
    renderList("Working Set", renderWorkingSet(payload.capsule.workingSet)),
    renderList(
      "Supporting Facts",
      payload.capsule.supportingFacts.map(
        (item) => `${item.summary} | source: ${item.sourceUri}`,
      ),
    ),
    payload.fallbackNotes.join("\n"),
  ];

  return sections.filter(Boolean).join("\n\n").trim();
};
