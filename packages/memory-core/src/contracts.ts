export const CAPSULE_SECTION_KEYS = [
  "active_task",
  "open_loops",
  "recent_decisions",
  "working_set",
  "project_capsule",
] as const;

export type CapsuleSectionKey = typeof CAPSULE_SECTION_KEYS[number];
export type BootstrapMode = "fast" | "warm" | "cold";
export type CapsuleSource = "hot" | "hot+cold";
export type OpenLoopSeverity = "low" | "medium" | "high";
export type WorkingSetKind = "file" | "command" | "error" | "note";
export type BootstrapRiskLevel = "normal" | "high";
export type RecallQueryStrategy = "none" | "direct" | "anchored" | "suppressed";

export interface ProjectIdentity {
  readonly id: string;
  readonly memoryNamespace?: string | null;
  readonly rootPath: string;
  readonly host: string | null;
  readonly vcsRoot: string | null;
}

export interface TokenBudget {
  readonly targetTokens: number;
  readonly hardLimitTokens: number;
}

export interface WorkingSetEntry {
  readonly kind: WorkingSetKind;
  readonly label: string;
  readonly value: string;
  readonly updatedAt: string;
  readonly weight?: number;
}

export interface DecisionRecord {
  readonly id: string;
  readonly summary: string;
  readonly reason: string;
  readonly updatedAt: string;
  readonly sourceUri: string | null;
}

export interface OpenLoop {
  readonly id: string;
  readonly summary: string;
  readonly severity: OpenLoopSeverity;
  readonly updatedAt: string;
}

export interface ProjectCapsule {
  readonly project: ProjectIdentity;
  readonly summary: string;
  readonly activeTask: string | null;
  readonly openLoops: readonly OpenLoop[];
  readonly recentDecisions: readonly DecisionRecord[];
  readonly workingSet: readonly WorkingSetEntry[];
  readonly supportingFacts: readonly FactHit[];
  readonly budget: TokenBudget;
  readonly source: CapsuleSource;
  readonly generatedAt: string;
}

export interface CapsuleRequest {
  readonly project: ProjectIdentity;
  readonly mode: BootstrapMode;
  readonly query?: string | null;
  readonly sessionId?: string | null;
  readonly riskLevel?: BootstrapRiskLevel;
  readonly allowColdRecall?: boolean;
  readonly budget?: Partial<TokenBudget>;
}

export interface BootstrapDiagnostics {
  readonly modeApplied: BootstrapMode;
  readonly riskLevel: BootstrapRiskLevel;
  readonly recallQueryStrategy: RecallQueryStrategy;
  readonly coldRecallAttempted: boolean;
  readonly coldRecallUsed: boolean;
  readonly usedFallback: boolean;
  readonly degradeReasons: readonly string[];
  readonly latencyMs: number;
  readonly estimatedTokens: number;
}

export interface BootstrapPayload {
  readonly project: ProjectIdentity;
  readonly mode: BootstrapMode;
  readonly capsule: ProjectCapsule | null;
  readonly fallbackNotes: readonly string[];
  readonly diagnostics: BootstrapDiagnostics;
}

export interface FactHit {
  readonly id: string;
  readonly summary: string;
  readonly sourceUri: string;
  readonly score: number;
}

export interface PromotionRecord {
  readonly projectId: string;
  readonly title: string;
  readonly summary: string;
  readonly facts: readonly string[];
  readonly sourceSessionId: string | null;
}

export interface CheckpointRecord {
  readonly project: ProjectIdentity;
  readonly sessionId: string | null;
  readonly summary?: string | null;
  readonly activeTask: string | null;
  readonly openLoops: readonly OpenLoop[];
  readonly recentDecisions?: readonly DecisionRecord[];
  readonly workingSet: readonly WorkingSetEntry[];
}

export interface RuntimeMetricRecord {
  readonly metricType: string;
  readonly projectId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface PromotionJobRecord {
  readonly jobId: string;
  readonly projectId: string;
  readonly payload: PromotionRecord;
  readonly status: "pending" | "running" | "done" | "failed";
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
