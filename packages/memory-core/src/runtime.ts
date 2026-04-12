import type {
  BootstrapDiagnostics,
  BootstrapPayload,
  CapsuleRequest,
  ColdMemoryProvider,
  FactHit,
  HotMemoryProvider,
  ProjectCapsule,
  RuntimeMetricRecord,
} from "./contracts.js";
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

const trimSummary = (summary: string, limit: number): string =>
  summary.length <= limit ? summary : `${summary.slice(0, Math.max(0, limit - 1)).trim()}…`;

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
    current = { ...current, summary: trimSummary(current.summary, 220) };
    break;
  }
  return current;
};

const createDiagnostics = (
  request: CapsuleRequest,
  degradeReasons: readonly string[],
  coldRecallAttempted: boolean,
  coldRecallUsed: boolean,
  latencyMs: number,
  capsule: ProjectCapsule | null,
): BootstrapDiagnostics => ({
  modeApplied: request.mode,
  riskLevel: inferBootstrapRiskLevel(request),
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
    const conservative = shouldUseConservativeBackground(effectiveRequest);
    const shouldRecallCold =
      Boolean(this.coldMemory) &&
      Boolean(effectiveRequest.allowColdRecall ?? true) &&
      effectiveRequest.mode !== "fast" &&
      !conservative &&
      Boolean((effectiveRequest.query ?? "").trim());

    if (!capsule) {
      degradeReasons.push("hot_capsule_missing");
    }

    if (capsule && shouldRecallCold && this.coldMemory) {
      try {
        const coldHits = await runWithTimeout(this.config.coldQueryTimeoutMs, async () =>
          this.coldMemory!.searchGists(
            effectiveRequest.project.id,
            String(effectiveRequest.query ?? ""),
          ),
        );
        supportingFacts = coldHits.slice(0, 4);
      } catch (error) {
        degradeReasons.push(
          error instanceof Error ? error.message : "cold_recall_failed",
        );
      }
    }

    if (capsule) {
      capsule = mergeSupportingFacts(capsule, supportingFacts);
      capsule = trimCapsuleToBudget(capsule, conservative);
    }

    const latencyMs = Date.now() - startedAt;
    const diagnostics = createDiagnostics(
      effectiveRequest,
      degradeReasons,
      shouldRecallCold,
      supportingFacts.length > 0,
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
      fallbackNotes: capsule
        ? []
        : [
            `No hot capsule found for ${effectiveRequest.project.id}.`,
            "Continue with the raw user request and live repository context.",
          ],
      diagnostics,
    };
  }

  async checkpoint(record: import("./contracts.js").CheckpointRecord): Promise<void> {
    await this.hotMemory.checkpoint(record);
    await this.recordMetric({
      metricType: "checkpoint",
      projectId: record.project.id,
      payload: {
        openLoopCount: record.openLoops.length,
        decisionCount: record.recentDecisions?.length ?? 0,
        workingSetCount: record.workingSet.length,
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
