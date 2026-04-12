import type {
  FactHit,
  OpenLoop,
  ProjectCapsule,
  WorkingSetEntry,
} from "./contracts.js";

const estimateTextTokens = (value: string): number =>
  Math.max(1, Math.ceil(value.trim().length / 4));

const estimateOpenLoopTokens = (item: OpenLoop): number =>
  estimateTextTokens(`${item.severity} ${item.summary}`);

const estimateWorkingSetTokens = (item: WorkingSetEntry): number =>
  estimateTextTokens(`${item.kind} ${item.label} ${item.value}`);

const estimateFactTokens = (item: FactHit): number =>
  estimateTextTokens(`${item.summary} ${item.sourceUri}`);

export const estimateCapsuleTokens = (capsule: ProjectCapsule): number => {
  const summaryTokens = estimateTextTokens(capsule.summary);
  const taskTokens = estimateTextTokens(capsule.activeTask ?? "");
  const openLoopTokens = capsule.openLoops.reduce(
    (total, item) => total + estimateOpenLoopTokens(item),
    0,
  );
  const decisionTokens = capsule.recentDecisions.reduce(
    (total, item) => total + estimateTextTokens(`${item.summary} ${item.reason}`),
    0,
  );
  const workingSetTokens = capsule.workingSet.reduce(
    (total, item) => total + estimateWorkingSetTokens(item),
    0,
  );
  const factTokens = capsule.supportingFacts.reduce(
    (total, item) => total + estimateFactTokens(item),
    0,
  );
  return summaryTokens + taskTokens + openLoopTokens + decisionTokens + workingSetTokens + factTokens;
};
