export interface SkillRecord {
  readonly path: string;
  readonly root: string;
  readonly dirName: string;
  readonly name: string;
  readonly description: string;
  readonly risk: string;
  readonly status: string;
  readonly entrypoint: boolean;
  readonly hasFrontmatter: boolean;
  readonly hasTriggers: boolean;
  readonly descriptionTokens: number;
  readonly bodyTokens: number;
  readonly referenceFileCount: number;
  readonly referenceTokens: number;
  readonly totalTokens: number;
  readonly referenceGapCount: number;
  readonly referenceGapPaths: readonly string[];
  readonly hostSpecificIssues: readonly string[];
  readonly bodyHash: string;
}

export type GovernanceHost = "codex" | "claude" | "gemini" | "universal";

export interface GovernanceProfile {
  readonly host: GovernanceHost;
  readonly defaultDescriptionThreshold: number;
  readonly entrypointDescriptionThreshold: number;
  readonly targetDescriptionThreshold: number;
  readonly targetEntrypointDescriptionThreshold: number;
}

export interface DuplicateGroup {
  readonly key: string;
  readonly count: number;
  readonly paths: readonly string[];
}

export interface CompatibilityIssue {
  readonly path: string;
  readonly issues: readonly string[];
}

export interface DescriptionBudgetOverflow {
  readonly path: string;
  readonly name: string;
  readonly descriptionTokens: number;
  readonly threshold: number;
}

export interface HeavySkill {
  readonly path: string;
  readonly name: string;
  readonly bodyTokens: number;
  readonly referenceTokens: number;
  readonly referenceFileCount: number;
  readonly totalTokens: number;
}

export interface ReferenceMetadataGap {
  readonly path: string;
  readonly name: string;
  readonly referenceGapCount: number;
  readonly referenceFileCount: number;
  readonly referenceGapPaths: readonly string[];
}

export interface SkillsAuditSummary {
  readonly skillCount: number;
  readonly descriptionBudgetOverflowCount: number;
  readonly heavySkillCount: number;
  readonly duplicateNameGroupCount: number;
  readonly duplicateBodyGroupCount: number;
  readonly compatibilityIssueCount: number;
  readonly referenceGapSkillCount: number;
}

export interface SkillsAuditReport {
  readonly generatedAt: string;
  readonly host: GovernanceHost;
  readonly requestedRoots: readonly string[];
  readonly discoveredRoots: readonly string[];
  readonly missingRoots: readonly string[];
  readonly summary: SkillsAuditSummary;
  readonly descriptionBudgetOverflows: readonly DescriptionBudgetOverflow[];
  readonly heavySkills: readonly HeavySkill[];
  readonly duplicateNameGroups: readonly DuplicateGroup[];
  readonly duplicateBodyGroups: readonly DuplicateGroup[];
  readonly compatibilityIssues: readonly CompatibilityIssue[];
  readonly referenceMetadataGaps: readonly ReferenceMetadataGap[];
}

export interface SkillsAuditOptions {
  readonly roots?: readonly string[];
  readonly limit?: number;
  readonly host?: GovernanceHost;
}

export interface SkillRootDiscovery {
  readonly requestedRoots: readonly string[];
  readonly discoveredRoots: readonly string[];
  readonly missingRoots: readonly string[];
}

export interface MutationOperation {
  readonly kind:
    | "description-trim"
    | "host-compat-rewrite"
    | "reference-metadata-inject"
    | "duplicate-quarantine";
  readonly detail: string;
}

export interface PlannedFileChange {
  readonly path: string;
  readonly operations: readonly MutationOperation[];
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly beforeContent: string;
  readonly afterContent: string;
}

export interface ManualReviewItem {
  readonly kind: "duplicate-name" | "duplicate-body";
  readonly key: string;
  readonly paths: readonly string[];
}

export interface DuplicateResolutionGroup {
  readonly kind: "duplicate-name" | "duplicate-body";
  readonly key: string;
  readonly paths: readonly string[];
  readonly recommendedKeepPath: string;
  readonly recommendedQuarantinePaths: readonly string[];
  readonly recommendationReason: string;
  readonly riskLevel: "low" | "medium" | "high";
  readonly riskReason: string;
  readonly pathDetails: readonly DuplicateResolutionPathDetail[];
}

export interface DuplicateResolutionPathDetail {
  readonly path: string;
  readonly root: string;
  readonly riskTag: string;
  readonly status: string;
  readonly isManaged: boolean;
  readonly entrypoint: boolean;
  readonly hostSpecificIssueCount: number;
  readonly descriptionTokens: number;
  readonly totalTokens: number;
}

export interface DuplicateResolutionReport {
  readonly generatedAt: string;
  readonly host: GovernanceHost;
  readonly requestedRoots: readonly string[];
  readonly discoveredRoots: readonly string[];
  readonly missingRoots: readonly string[];
  readonly groups: readonly DuplicateResolutionGroup[];
}

export interface DuplicateResolutionDecision {
  readonly kind: "duplicate-name" | "duplicate-body";
  readonly key: string;
  readonly action: "quarantine" | "skip";
  readonly keepPath: string;
  readonly quarantinePaths: readonly string[];
  readonly reason: string;
}

export interface DuplicateResolutionFile {
  readonly host: GovernanceHost;
  readonly generatedAt: string;
  readonly requestedRoots: readonly string[];
  readonly decisions: readonly DuplicateResolutionDecision[];
}

export interface DuplicateResolutionApplyResult {
  readonly changedFileCount: number;
  readonly snapshotPath: string;
  readonly appliedDecisions: readonly DuplicateResolutionDecision[];
  readonly skippedDecisions: readonly string[];
  readonly operationCounts: OperationCountSummary;
  readonly auditDelta: AuditDeltaSummary;
}

export interface SkillsApplyPlan {
  readonly createdAt: string;
  readonly host: GovernanceHost;
  readonly requestedRoots: readonly string[];
  readonly discoveredRoots: readonly string[];
  readonly missingRoots: readonly string[];
  readonly report: SkillsAuditReport;
  readonly fileChanges: readonly PlannedFileChange[];
  readonly manualReview: readonly ManualReviewItem[];
}

export interface SkillsSnapshotFile {
  readonly path: string;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly beforeContent: string;
  readonly operations: readonly MutationOperation[];
}

export interface SkillsSnapshot {
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly host: GovernanceHost;
  readonly roots: readonly string[];
  readonly files: readonly SkillsSnapshotFile[];
}

export interface SkillsApplyResult {
  readonly changedFileCount: number;
  readonly manualReviewCount: number;
  readonly snapshotPath: string;
  readonly plan: SkillsApplyPlan;
  readonly operationCounts: OperationCountSummary;
  readonly auditDelta: AuditDeltaSummary;
}

export interface SkillsApplyOptions extends SkillsAuditOptions {
  readonly snapshotPath?: string;
}

export interface SkillsRollbackResult {
  readonly restoredFileCount: number;
  readonly conflicts: readonly string[];
  readonly snapshotPath: string;
}

export interface SkillsBenchmarkResult {
  readonly host: GovernanceHost;
  readonly before: SkillsAuditReport;
  readonly after: SkillsAuditReport;
  readonly appliedChangeCount: number;
  readonly manualReviewCount: number;
  readonly deltas: {
    readonly descriptionBudgetOverflowDelta: number;
    readonly heavySkillDelta: number;
    readonly compatibilityIssueDelta: number;
    readonly referenceGapSkillDelta: number;
  };
}

export interface OperationCountSummary {
  readonly descriptionTrimCount: number;
  readonly hostCompatRewriteCount: number;
  readonly referenceMetadataInjectCount: number;
  readonly duplicateQuarantineCount: number;
}

export interface AuditDeltaSummary {
  readonly before: SkillsAuditSummary;
  readonly after: SkillsAuditSummary;
  readonly deltas: {
    readonly descriptionBudgetOverflowDelta: number;
    readonly heavySkillDelta: number;
    readonly compatibilityIssueDelta: number;
    readonly referenceGapSkillDelta: number;
    readonly duplicateNameGroupDelta: number;
    readonly duplicateBodyGroupDelta: number;
  };
}
