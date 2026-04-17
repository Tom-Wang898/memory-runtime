import type {
  BootstrapDiagnostics,
  BootstrapPayload,
  CapsuleRequest,
  ColdMemoryProvider,
  ContinuityDiagnostics,
  ContinuityPayload,
  FactHit,
  HotMemoryProvider,
  ProjectCapsule,
  RecallQueryStrategy,
  RuntimeMetricRecord,
} from "./contracts.js";
import { buildScopedRecallQuery } from "./anchors.js";
import { estimateCapsuleTokens } from "./estimate.js";
import {
  inferBootstrapRiskLevel,
  shouldUseConservativeBackground,
} from "./heuristics.js";
import { DEFAULT_TOKEN_BUDGET, resolveTokenBudget } from "./policy.js";

export interface MemoryRuntimeConfig {
  readonly coldQueryTimeoutMs: number;
}

export interface MemoryRuntimeObserver {
  recordMetric(record: RuntimeMetricRecord): Promise<void>;
}

const resolveColdProjectId = (project: CapsuleRequest["project"]): string =>
  String(project.memoryNamespace ?? project.id);

const DEFAULT_RUNTIME_CONFIG: MemoryRuntimeConfig = {
  coldQueryTimeoutMs: 350,
};

const runWithTimeout = async <T>(
  timeoutMs: number,
  task: () => Promise<T>,
): Promise<T> =>
  await Promise.race([
    task(),
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("cold_query_timeout")), timeoutMs);
    }),
  ]);

const sliceForRisk = <T>(
  items: readonly T[],
  conservative: boolean,
  normalLimit: number,
  conservativeLimit: number,
): readonly T[] => items.slice(0, conservative ? conservativeLimit : normalLimit);

const mergeSupportingFacts = (
  capsule: ProjectCapsule,
  supportingFacts: readonly FactHit[],
): ProjectCapsule => ({
  ...capsule,
  supportingFacts,
  source: supportingFacts.length > 0 ? "hot+cold" : capsule.source,
});

const mergePrimerIntoSummary = (
  capsule: ProjectCapsule,
  primerFacts: readonly FactHit[],
): ProjectCapsule => {
  const primerSummary = primerFacts[0]?.summary?.trim();
  if (!primerSummary || capsule.summary.includes(primerSummary)) {
    return capsule;
  }
  return {
    ...capsule,
    summary: trimSummary(`${capsule.summary}\n${primerSummary}`, 220),
  };
};

const mergeFactHits = (
  primary: readonly FactHit[],
  secondary: readonly FactHit[],
): readonly FactHit[] => {
  const merged = new Map<string, FactHit>();
  for (const item of [...primary, ...secondary]) {
    const key = `${item.sourceUri}::${item.summary}`;
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  }
  return [...merged.values()];
};

const trimSummary = (summary: string, limit: number): string =>
  summary.length <= limit ? summary : `${summary.slice(0, Math.max(0, limit - 1)).trim()}…`;

const estimateTextTokens = (value: string): number =>
  Math.max(1, Math.ceil(value.trim().length / 4));

const uniqueNonEmpty = (items: readonly (string | null | undefined)[]): readonly string[] =>
  [...new Set(items.map((item) => String(item ?? "").trim()).filter(Boolean))];

const splitSummaryLines = (summary: string): readonly string[] =>
  summary
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeSummaryPoint = (line: string): string | null => {
  const normalized = line
    .replace(/^[-*]\s*/, "")
    .replace(/^\d+\.\s*/, "")
    .replace(/^项目热启动摘要[:：]\s*/, "")
    .replace(/^作用[:：]\s*/, "")
    .replace(/^项目概览[:：]\s*/, "")
    .replace(/^当前主题[:：]\s*/, "")
    .trim();
  if (!normalized || normalized.length < 4) {
    return null;
  }
  return normalized;
};

const extractSummaryPoints = (summary: string): readonly string[] =>
  uniqueNonEmpty(splitSummaryLines(summary).map(normalizeSummaryPoint)).slice(0, 4);

const buildBackgroundSummary = (
  capsule: ProjectCapsule | null,
  backgroundFacts: readonly FactHit[],
): string | null => {
  if (!capsule && backgroundFacts.length === 0) {
    return null;
  }
  const supportingSummary = backgroundFacts[0]?.summary?.trim();
  const decisionSummary = capsule?.recentDecisions[0]?.summary?.trim();
  const preferred = supportingSummary || decisionSummary || capsule?.summary || null;
  if (!preferred) {
    return null;
  }
  return trimSummary(preferred, 160);
};

const buildBackgroundPoints = (
  capsule: ProjectCapsule | null,
  backgroundFacts: readonly FactHit[],
): readonly string[] => {
  const explicitPoints = uniqueNonEmpty([
    ...backgroundFacts.map((item) => item.summary),
    ...(capsule?.constraints ?? []).slice(0, 2).map((item) => `Constraint: ${item.summary}`),
    ...(capsule?.recentDecisions ?? []).map((item) => item.summary),
  ]).slice(0, 4);
  if (explicitPoints.length > 0) {
    return explicitPoints;
  }
  if (!capsule) {
    return [];
  }
  return extractSummaryPoints(capsule.summary);
};

const buildCurrentFocus = (capsule: ProjectCapsule | null): readonly string[] => {
  if (!capsule) {
    return [];
  }
  return uniqueNonEmpty([
    capsule.nextStep,
    ...capsule.openLoops.map((item) => item.summary),
    capsule.activeTask,
  ]).slice(0, 4);
};

const buildRecentProgress = (capsule: ProjectCapsule | null): readonly string[] => {
  if (!capsule) {
    return [];
  }
  return uniqueNonEmpty([
    capsule.summary,
    ...capsule.workingSet.map((item) => item.label ? `${item.label}: ${item.value}` : item.value),
  ]).slice(0, 3);
};

const buildContinuitySummary = (capsule: ProjectCapsule | null): string | null => {
  if (!capsule) {
    return null;
  }
  return trimSummary(
    capsule.nextStep ??
      capsule.activeTask ??
      capsule.recentDecisions[0]?.summary ??
      capsule.summary,
    160,
  );
};

const buildContinuityPoints = (capsule: ProjectCapsule | null): readonly string[] => {
  if (!capsule) {
    return [];
  }

  const sections = [
    ...capsule.constraints.slice(0, 3).map((item) => `Constraint: ${item.summary}`),
    capsule.nextStep ? `Next: ${capsule.nextStep}` : null,
    ...capsule.recentDecisions
      .slice(0, 2)
      .map((item) => `Decision: ${item.summary} | reason: ${item.reason}`),
    ...capsule.openLoops.slice(0, 2).map((item) => `Loop: [${item.severity}] ${item.summary}`),
    ...capsule.workingSet
      .slice(0, 2)
      .map((item) => `Working set: ${item.kind} ${item.label} -> ${item.value}`),
  ];

  return uniqueNonEmpty(sections).slice(0, 8);
};

const trimContinuityPointsToBudget = (
  summary: string | null,
  points: readonly string[],
  hardLimitTokens: number,
): readonly string[] => {
  const current = [...points];
  while (
    estimateTextTokens(summary ?? "") +
      current.reduce((total, item) => total + estimateTextTokens(item), 0) >
    hardLimitTokens
  ) {
    if (current.length === 0) {
      break;
    }
    current.pop();
  }
  return current;
};

const createContinuityDiagnostics = (
  latencyMs: number,
  summary: string | null,
  points: readonly string[],
  capsule: ProjectCapsule | null,
): ContinuityDiagnostics => ({
  estimatedTokens:
    estimateTextTokens(summary ?? "") +
    points.reduce((total, item) => total + estimateTextTokens(item), 0),
  latencyMs,
  usedFallback: capsule === null,
});

const createPrimerBackfilledCapsule = (
  request: CapsuleRequest,
  supportingFacts: readonly FactHit[],
): ProjectCapsule | null => {
  const summary = supportingFacts[0]?.summary?.trim();
  const activeTask = String(request.query ?? "").trim();
  if (!summary) {
    return null;
  }
  return {
    project: request.project,
    summary,
    activeTask: activeTask || null,
    constraints: [],
    nextStep: null,
    openLoops: [],
    recentDecisions: [],
    workingSet: [],
    supportingFacts,
    budget: resolveTokenBudget(request.budget ?? DEFAULT_TOKEN_BUDGET),
    source: "hot+cold",
    generatedAt: new Date().toISOString(),
  };
};

const trimCapsuleToBudget = (
  capsule: ProjectCapsule,
  conservative: boolean,
): ProjectCapsule => {
  const budget = resolveTokenBudget(capsule.budget);
  let current = {
    ...capsule,
    openLoops: sliceForRisk(capsule.openLoops, conservative, 5, 2),
    recentDecisions: sliceForRisk(capsule.recentDecisions, conservative, 5, 2),
    workingSet: sliceForRisk(capsule.workingSet, conservative, 6, 3),
    supportingFacts: sliceForRisk(capsule.supportingFacts, conservative, 4, 0),
  };
  while (estimateCapsuleTokens(current) > budget.hardLimitTokens) {
    if (current.supportingFacts.length > 0) {
      current = { ...current, supportingFacts: current.supportingFacts.slice(0, -1) };
      continue;
    }
    if (current.workingSet.length > 0) {
      current = { ...current, workingSet: current.workingSet.slice(0, -1) };
      continue;
    }
    if (current.recentDecisions.length > 0) {
      current = { ...current, recentDecisions: current.recentDecisions.slice(0, -1) };
      continue;
    }
    if (current.openLoops.length > 0) {
      current = { ...current, openLoops: current.openLoops.slice(0, -1) };
      continue;
    }
    if (current.activeTask) {
      current = { ...current, activeTask: trimSummary(current.activeTask, 120) };
    }
    current = { ...current, summary: trimSummary(current.summary, 220) };
    break;
  }
  return current;
};

const createDiagnostics = (
  request: CapsuleRequest,
  degradeReasons: readonly string[],
  recallQueryStrategy: RecallQueryStrategy,
  coldRecallAttempted: boolean,
  coldRecallUsed: boolean,
  latencyMs: number,
  capsule: ProjectCapsule | null,
): BootstrapDiagnostics => ({
  modeApplied: request.mode,
  riskLevel: inferBootstrapRiskLevel(request),
  recallQueryStrategy,
  coldRecallAttempted,
  coldRecallUsed,
  usedFallback: capsule === null,
  degradeReasons,
  latencyMs,
  estimatedTokens: capsule ? estimateCapsuleTokens(capsule) : 0,
});

export class MemoryRuntime {
  private readonly config: MemoryRuntimeConfig;
  private readonly hotMemory: HotMemoryProvider;
  private readonly coldMemory: ColdMemoryProvider | null;
  private readonly observer: MemoryRuntimeObserver | null;

  constructor(
    hotMemory: HotMemoryProvider,
    coldMemory: ColdMemoryProvider | null = null,
    config: Partial<MemoryRuntimeConfig> = {},
    observer: MemoryRuntimeObserver | null = null,
  ) {
    this.hotMemory = hotMemory;
    this.coldMemory = coldMemory;
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
    this.observer = observer;
  }

  async buildBootstrap(request: CapsuleRequest): Promise<BootstrapPayload> {
    const startedAt = Date.now();
    const degradeReasons: string[] = [];
    const budget = resolveTokenBudget(request.budget ?? DEFAULT_TOKEN_BUDGET);
    const effectiveRequest = { ...request, budget };
    let capsule = await this.hotMemory.buildCapsule(effectiveRequest);
    let supportingFacts: readonly FactHit[] = [];
    let primerFacts: readonly FactHit[] = [];
    let recallQueryStrategy: RecallQueryStrategy = "none";
    const conservative = shouldUseConservativeBackground(effectiveRequest);
    const canReadProjectPrimer =
      Boolean(this.coldMemory) &&
      effectiveRequest.mode !== "fast";
    const canAttemptColdRecall =
      Boolean(this.coldMemory) &&
      Boolean(effectiveRequest.allowColdRecall ?? true) &&
      effectiveRequest.mode !== "fast" &&
      !conservative &&
      Boolean((effectiveRequest.query ?? "").trim());

    if (!capsule) {
      degradeReasons.push("hot_capsule_missing");
    }

    if (canReadProjectPrimer && this.coldMemory?.readProjectPrimer) {
      try {
        primerFacts = await runWithTimeout(this.config.coldQueryTimeoutMs, async () =>
          this.coldMemory!.readProjectPrimer!(
            resolveColdProjectId(effectiveRequest.project),
          ),
        );
      } catch (error) {
        degradeReasons.push(
          error instanceof Error ? error.message : "project_primer_failed",
        );
      }
    }

    if (capsule && canAttemptColdRecall && this.coldMemory) {
      const recallQuery = buildScopedRecallQuery(
        String(effectiveRequest.query ?? ""),
        capsule,
      );
      recallQueryStrategy = recallQuery.strategy;
      if (!recallQuery.query) {
        if (recallQuery.strategy === "suppressed") {
          degradeReasons.push("cold_recall_suppressed_ambiguous_query");
        }
      } else {
      try {
        const coldHits = await runWithTimeout(this.config.coldQueryTimeoutMs, async () =>
          this.coldMemory!.searchGists(
            resolveColdProjectId(effectiveRequest.project),
            recallQuery.query,
          ),
        );
        supportingFacts = coldHits.slice(0, 4);
      } catch (error) {
        degradeReasons.push(
          error instanceof Error ? error.message : "cold_recall_failed",
        );
      }
      }
    }

    supportingFacts = mergeFactHits(primerFacts, supportingFacts);
    const backgroundFacts = supportingFacts;

    if (!capsule && supportingFacts.length > 0) {
      capsule = createPrimerBackfilledCapsule(effectiveRequest, supportingFacts);
      degradeReasons.push("hot_capsule_backfilled_from_project_primer");
    }

    if (capsule) {
      capsule = mergePrimerIntoSummary(capsule, primerFacts);
      capsule = mergeSupportingFacts(capsule, supportingFacts);
      capsule = trimCapsuleToBudget(capsule, conservative);
    }

    const latencyMs = Date.now() - startedAt;
    const diagnostics = createDiagnostics(
      effectiveRequest,
      degradeReasons,
      recallQueryStrategy,
      canReadProjectPrimer || (canAttemptColdRecall && recallQueryStrategy !== "suppressed"),
      primerFacts.length > 0 || supportingFacts.length > 0,
      latencyMs,
      capsule,
    );
    await this.recordMetric({
      metricType: "bootstrap",
      projectId: effectiveRequest.project.id,
      payload: diagnostics,
      createdAt: new Date().toISOString(),
    });
    return {
      project: effectiveRequest.project,
      mode: effectiveRequest.mode,
      capsule,
      backgroundSummary: buildBackgroundSummary(capsule, backgroundFacts),
      backgroundPoints: buildBackgroundPoints(capsule, backgroundFacts),
      currentFocus: buildCurrentFocus(capsule),
      recentProgress: buildRecentProgress(capsule),
      fallbackNotes: capsule
        ? []
        : [
            `No hot capsule found for ${effectiveRequest.project.id}.`,
            "Continue with the raw user request and live repository context.",
          ],
      diagnostics,
    };
  }

  async buildContinuity(request: CapsuleRequest): Promise<ContinuityPayload> {
    const startedAt = Date.now();
    const budget = resolveTokenBudget(request.budget ?? DEFAULT_TOKEN_BUDGET);
    const effectiveRequest = { ...request, budget };
    const capsule = await this.hotMemory.buildCapsule(effectiveRequest);

    if (!capsule) {
      const latencyMs = Date.now() - startedAt;
      return {
        project: effectiveRequest.project,
        mode: effectiveRequest.mode,
        capsule: null,
        continuitySummary: null,
        continuityPoints: [],
        fallbackNotes: [
          `No hot continuity found for ${effectiveRequest.project.id}.`,
          "Continue with the raw user request and live repository context.",
        ],
        diagnostics: createContinuityDiagnostics(latencyMs, null, [], null),
      };
    }

    const continuitySummary = buildContinuitySummary(capsule);
    const continuityPoints = trimContinuityPointsToBudget(
      continuitySummary,
      buildContinuityPoints(capsule),
      Math.min(220, budget.hardLimitTokens),
    );
    const latencyMs = Date.now() - startedAt;

    await this.recordMetric({
      metricType: "continuity",
      projectId: effectiveRequest.project.id,
      payload: {
        estimatedTokens:
          estimateTextTokens(continuitySummary ?? "") +
          continuityPoints.reduce((total, item) => total + estimateTextTokens(item), 0),
        pointCount: continuityPoints.length,
      },
      createdAt: new Date().toISOString(),
    });

    return {
      project: effectiveRequest.project,
      mode: effectiveRequest.mode,
      capsule,
      continuitySummary,
      continuityPoints,
      fallbackNotes: [],
      diagnostics: createContinuityDiagnostics(
        latencyMs,
        continuitySummary,
        continuityPoints,
        capsule,
      ),
    };
  }

  async checkpoint(record: import("./contracts.js").CheckpointRecord): Promise<void> {
    await this.hotMemory.checkpoint(record);
    await this.recordMetric({
      metricType: "checkpoint",
      projectId: record.project.id,
      payload: {
        constraintCount: record.constraints?.length ?? 0,
        openLoopCount: record.openLoops.length,
        decisionCount: record.recentDecisions?.length ?? 0,
        workingSetCount: record.workingSet.length,
        hasNextStep: Boolean(record.nextStep),
      },
      createdAt: new Date().toISOString(),
    });
  }

  async promote(record: import("./contracts.js").PromotionRecord): Promise<void> {
    if (!this.coldMemory) {
      return;
    }
    await this.coldMemory.promote(record);
    await this.recordMetric({
      metricType: "promote",
      projectId: record.projectId,
      payload: { title: record.title, factCount: record.facts.length },
      createdAt: new Date().toISOString(),
    });
  }

  private async recordMetric(record: RuntimeMetricRecord): Promise<void> {
    if (!this.observer) {
      return;
    }
    await this.observer.recordMetric(record);
  }
}
