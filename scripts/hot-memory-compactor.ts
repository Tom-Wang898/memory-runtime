import type {
  ConstraintRecord,
  DecisionRecord,
  OpenLoop,
  ProjectCapsule,
  PromotionRecord,
  WorkingSetEntry,
} from "../packages/memory-core/src/index.ts";
import { sanitizeCheckpointSummary } from "../packages/memory-core/src/index.ts";
import {
  trimConstraints,
  trimDecisions,
  trimOpenLoops,
  trimWorkingSet,
} from "../packages/hot-memory-sqlite/src/serialization.ts";
import {
  createRuntimeServices,
  ensureMemoryPalaceAvailable,
} from "./config.ts";
import { writeContinuityCache } from "./continuity-cache.ts";
import { writePrimerCache } from "./primer-cache.ts";
import { runWithDatabaseRetry } from "./sqlite-retry.ts";

export interface CompactHotProjectOptions {
  readonly cwd: string;
  readonly host: string;
  readonly dryRun?: boolean;
  readonly maxOpenLoopAgeDays?: number;
  readonly maxWorkingSetAgeDays?: number;
  readonly maxDecisionAgeDays?: number;
  readonly updatePrimer?: boolean;
  readonly promoteStable?: boolean;
}

export interface CompactHotProjectResult {
  readonly ok: boolean;
  readonly projectId: string;
  readonly changed: boolean;
  readonly before: Readonly<Record<string, unknown>> | null;
  readonly after: Readonly<Record<string, unknown>> | null;
  readonly continuityPath: string | null;
  readonly primerPath: string | null;
  readonly promotion:
    | {
        readonly attempted: boolean;
        readonly promoted: boolean;
        readonly reason: string;
        readonly title?: string;
      }
    | null;
}

const OPEN_LOOP_SEVERITY_WEIGHT: Record<OpenLoop["severity"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const normalizeKey = (value: string): string =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

const parseTimestamp = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isFreshEnough = (
  updatedAt: string,
  maxAgeDays: number,
  nowMs: number,
): boolean => nowMs - parseTimestamp(updatedAt) <= maxAgeDays * 24 * 60 * 60 * 1000;

const dedupeConstraints = (
  constraints: readonly ConstraintRecord[],
): readonly ConstraintRecord[] => {
  const merged = new Map<string, ConstraintRecord>();
  for (const item of constraints) {
    const key = normalizeKey(item.summary);
    const current = merged.get(key);
    if (!current || parseTimestamp(item.updatedAt) >= parseTimestamp(current.updatedAt)) {
      merged.set(key, item);
    }
  }
  return trimConstraints([...merged.values()]);
};

export interface CompactAllHotProjectsOptions
  extends Omit<CompactHotProjectOptions, "cwd"> {
  readonly root?: string | null;
}

export interface CompactAllHotProjectsResult {
  readonly ok: boolean;
  readonly scanned: number;
  readonly matched: number;
  readonly results: readonly CompactHotProjectResult[];
}

const dedupeDecisions = (
  decisions: readonly DecisionRecord[],
  maxAgeDays: number,
  nowMs: number,
): readonly DecisionRecord[] => {
  const merged = new Map<string, DecisionRecord>();
  for (const item of decisions) {
    if (!isFreshEnough(item.updatedAt, maxAgeDays, nowMs)) {
      continue;
    }
    const key = normalizeKey(item.summary);
    const current = merged.get(key);
    if (!current || parseTimestamp(item.updatedAt) >= parseTimestamp(current.updatedAt)) {
      merged.set(key, item);
    }
  }
  return trimDecisions(
    [...merged.values()].sort(
      (left, right) => parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt),
    ),
  );
};

const dedupeOpenLoops = (
  openLoops: readonly OpenLoop[],
  maxAgeDays: number,
  nowMs: number,
): readonly OpenLoop[] => {
  const merged = new Map<string, OpenLoop>();
  for (const item of openLoops) {
    const shouldKeep =
      item.severity === "high" || isFreshEnough(item.updatedAt, maxAgeDays, nowMs);
    if (!shouldKeep) {
      continue;
    }
    const key = normalizeKey(item.summary);
    const current = merged.get(key);
    if (!current || parseTimestamp(item.updatedAt) >= parseTimestamp(current.updatedAt)) {
      merged.set(key, item);
    }
  }
  return trimOpenLoops(
    [...merged.values()].sort((left, right) => {
      const severityDelta =
        OPEN_LOOP_SEVERITY_WEIGHT[right.severity] -
        OPEN_LOOP_SEVERITY_WEIGHT[left.severity];
      if (severityDelta !== 0) {
        return severityDelta;
      }
      return parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt);
    }),
  );
};

const dedupeWorkingSet = (
  workingSet: readonly WorkingSetEntry[],
  maxAgeDays: number,
  nowMs: number,
): readonly WorkingSetEntry[] => {
  const merged = new Map<string, WorkingSetEntry>();
  for (const item of workingSet) {
    if (!isFreshEnough(item.updatedAt, maxAgeDays, nowMs)) {
      continue;
    }
    const key = `${item.kind}:${normalizeKey(item.value)}`;
    const current = merged.get(key);
    const shouldReplace =
      !current ||
      Number(item.weight ?? 0) > Number(current.weight ?? 0) ||
      parseTimestamp(item.updatedAt) >= parseTimestamp(current.updatedAt);
    if (shouldReplace) {
      merged.set(key, item);
    }
  }
  return trimWorkingSet(
    [...merged.values()].sort((left, right) => {
      const weightDelta = Number(right.weight ?? 0) - Number(left.weight ?? 0);
      if (weightDelta !== 0) {
        return weightDelta;
      }
      return parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt);
    }),
  );
};

const resolveSummary = (capsule: ProjectCapsule, nextStep: string | null): string => {
  const currentSummary = sanitizeCheckpointSummary(capsule.summary);
  if (currentSummary) {
    return currentSummary;
  }
  if (nextStep) {
    return `Next step: ${nextStep}`;
  }
  if (capsule.activeTask?.trim()) {
    return `Current focus: ${capsule.activeTask.trim()}`;
  }
  return `Hot memory capsule for ${capsule.project.id}`;
};

const buildCompactedCapsule = (
  capsule: ProjectCapsule,
  options: Required<
    Pick<
      CompactHotProjectOptions,
      "maxOpenLoopAgeDays" | "maxWorkingSetAgeDays" | "maxDecisionAgeDays"
    >
  >,
  nowMs: number,
): ProjectCapsule => {
  const constraints = dedupeConstraints(capsule.constraints);
  const recentDecisions = dedupeDecisions(
    capsule.recentDecisions,
    options.maxDecisionAgeDays,
    nowMs,
  );
  const openLoops = dedupeOpenLoops(
    capsule.openLoops,
    options.maxOpenLoopAgeDays,
    nowMs,
  );
  const workingSet = dedupeWorkingSet(
    capsule.workingSet,
    options.maxWorkingSetAgeDays,
    nowMs,
  );
  const nextStep =
    capsule.nextStep?.trim() ||
    openLoops[0]?.summary ||
    capsule.activeTask?.trim() ||
    null;

  return {
    ...capsule,
    summary: resolveSummary(capsule, nextStep),
    constraints,
    nextStep,
    openLoops,
    recentDecisions,
    workingSet,
    generatedAt: new Date(nowMs).toISOString(),
  };
};

const summarizeCapsule = (
  capsule: ProjectCapsule,
): Readonly<Record<string, unknown>> => ({
  summary: capsule.summary,
  activeTask: capsule.activeTask,
  nextStep: capsule.nextStep,
  constraintCount: capsule.constraints.length,
  openLoopCount: capsule.openLoops.length,
  decisionCount: capsule.recentDecisions.length,
  workingSetCount: capsule.workingSet.length,
});

const isCapsuleChanged = (before: ProjectCapsule, after: ProjectCapsule): boolean =>
  JSON.stringify({
    summary: before.summary,
    activeTask: before.activeTask,
    nextStep: before.nextStep,
    constraints: before.constraints,
    openLoops: before.openLoops,
    recentDecisions: before.recentDecisions,
    workingSet: before.workingSet,
  }) !==
  JSON.stringify({
    summary: after.summary,
    activeTask: after.activeTask,
    nextStep: after.nextStep,
    constraints: after.constraints,
    openLoops: after.openLoops,
    recentDecisions: after.recentDecisions,
    workingSet: after.workingSet,
  });

export const buildStablePromotionRecord = (
  capsule: ProjectCapsule,
): PromotionRecord | null => {
  const facts = [
    ...capsule.constraints.map((item) => `Constraint: ${item.summary}`),
    ...capsule.recentDecisions.map(
      (item) => `Decision: ${item.summary} | reason: ${item.reason}`,
    ),
    capsule.nextStep ? `Next step: ${capsule.nextStep}` : null,
  ]
    .filter(Boolean)
    .map((item) => String(item));

  if (facts.length < 2) {
    return null;
  }

  return {
    projectId: capsule.project.id,
    title: `${capsule.project.id}-continuity-stable`,
    summary: capsule.summary,
    facts,
    sourceSessionId: null,
  };
};

export const compactProjectCapsule = (
  capsule: ProjectCapsule,
  options: Required<
    Pick<
      CompactHotProjectOptions,
      "maxOpenLoopAgeDays" | "maxWorkingSetAgeDays" | "maxDecisionAgeDays"
    >
  >,
  nowMs = Date.now(),
): ProjectCapsule => buildCompactedCapsule(capsule, options, nowMs);

export const compactHotProject = async (
  options: CompactHotProjectOptions,
): Promise<CompactHotProjectResult> => {
  const {
    cwd,
    host,
    dryRun = false,
    maxOpenLoopAgeDays = 21,
    maxWorkingSetAgeDays = 7,
    maxDecisionAgeDays = 30,
    updatePrimer = false,
    promoteStable = false,
  } = options;

  if (updatePrimer || promoteStable) {
    await ensureMemoryPalaceAvailable();
  }

  const { project, hotClient, runtime } = createRuntimeServices(cwd, host);

  try {
    const capsule = await hotClient.readProjectCapsule(project.id);
    if (!capsule) {
      return {
        ok: true,
        projectId: project.id,
        changed: false,
        before: null,
        after: null,
        continuityPath: null,
        primerPath: null,
        promotion: null,
      };
    }

    const compacted = compactProjectCapsule(
      capsule,
      { maxOpenLoopAgeDays, maxWorkingSetAgeDays, maxDecisionAgeDays },
      Date.now(),
    );
    const changed = isCapsuleChanged(capsule, compacted);

    let continuityPath: string | null = null;
    let primerPath: string | null = null;
    let promotion: CompactHotProjectResult["promotion"] = null;

    if (!dryRun && changed) {
      await runWithDatabaseRetry(() => hotClient.replaceProjectCapsule(compacted));
    }

    if (!dryRun) {
      const continuityPayload = await runWithDatabaseRetry(() =>
        runtime.buildContinuity({
          project,
          mode: "warm",
          budget: { targetTokens: 160, hardLimitTokens: 220 },
        }),
      );
      continuityPath = writeContinuityCache(project, continuityPayload).path;

      if (updatePrimer) {
        const primerPayload = await runWithDatabaseRetry(() =>
          runtime.buildBootstrap({
            project,
            mode: "warm",
            query: null,
          }),
        );
        primerPath = writePrimerCache(project, primerPayload).path;
      }

      if (promoteStable) {
        const promotionRecord = buildStablePromotionRecord(compacted);
        if (promotionRecord) {
          await runtime.promote(promotionRecord);
          promotion = {
            attempted: true,
            promoted: true,
            reason: "stable_facts_promoted",
            title: promotionRecord.title,
          };
        } else {
          promotion = {
            attempted: true,
            promoted: false,
            reason: "insufficient_stable_facts",
          };
        }
      }
    }

    return {
      ok: true,
      projectId: project.id,
      changed,
      before: summarizeCapsule(capsule),
      after: summarizeCapsule(compacted),
      continuityPath,
      primerPath,
      promotion,
    };
  } finally {
    hotClient.close();
  }
};

export const compactAllHotProjects = async (
  options: CompactAllHotProjectsOptions,
): Promise<CompactAllHotProjectsResult> => {
  const {
    host,
    root = null,
    dryRun = false,
    maxOpenLoopAgeDays = 21,
    maxWorkingSetAgeDays = 7,
    maxDecisionAgeDays = 30,
    updatePrimer = false,
    promoteStable = false,
  } = options;

  const { hotClient } = createRuntimeServices(process.cwd(), host);
  try {
    const storedProjects = await hotClient.listProjects();
    const normalizedRoot = root ? String(root).trim() : null;
    const matchedProjects = storedProjects.filter((item) =>
      normalizedRoot ? item.rootPath.startsWith(normalizedRoot) : true,
    );

    const results: CompactHotProjectResult[] = [];
    for (const project of matchedProjects) {
      results.push(
        await compactHotProject({
          cwd: project.rootPath,
          host,
          dryRun,
          maxOpenLoopAgeDays,
          maxWorkingSetAgeDays,
          maxDecisionAgeDays,
          updatePrimer,
          promoteStable,
        }),
      );
    }

    return {
      ok: true,
      scanned: storedProjects.length,
      matched: matchedProjects.length,
      results,
    };
  } finally {
    hotClient.close();
  }
};
