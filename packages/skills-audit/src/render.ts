import type {
  DuplicateResolutionApplyResult,
  DuplicateResolutionFile,
  DuplicateResolutionReport,
  SkillsApplyPlan,
  SkillsApplyResult,
  SkillsBenchmarkResult,
  SkillsRollbackResult,
} from "./types.ts";

const renderList = (
  title: string,
  items: readonly string[],
): readonly string[] => ["", `## ${title}`, "", ...(items.length > 0 ? items : ["- none"])];

const renderOperationCounts = (
  counts: {
    readonly descriptionTrimCount: number;
    readonly hostCompatRewriteCount: number;
    readonly referenceMetadataInjectCount: number;
    readonly duplicateQuarantineCount: number;
  },
): readonly string[] => [
  `- description trims: \`${counts.descriptionTrimCount}\``,
  `- host compatibility rewrites: \`${counts.hostCompatRewriteCount}\``,
  `- reference metadata injects: \`${counts.referenceMetadataInjectCount}\``,
  `- duplicate quarantines: \`${counts.duplicateQuarantineCount}\``,
];

const renderAuditDelta = (
  delta: {
    readonly deltas: {
      readonly descriptionBudgetOverflowDelta: number;
      readonly heavySkillDelta: number;
      readonly compatibilityIssueDelta: number;
      readonly referenceGapSkillDelta: number;
      readonly duplicateNameGroupDelta: number;
      readonly duplicateBodyGroupDelta: number;
    };
  },
): readonly string[] => [
  `- description overflow delta: \`${delta.deltas.descriptionBudgetOverflowDelta}\``,
  `- heavy skill delta: \`${delta.deltas.heavySkillDelta}\``,
  `- compatibility issue delta: \`${delta.deltas.compatibilityIssueDelta}\``,
  `- reference gap delta: \`${delta.deltas.referenceGapSkillDelta}\``,
  `- duplicate-name delta: \`${delta.deltas.duplicateNameGroupDelta}\``,
  `- duplicate-body delta: \`${delta.deltas.duplicateBodyGroupDelta}\``,
];

export const renderSkillsApplyPlanMarkdown = (
  plan: SkillsApplyPlan,
): string =>
  `${[
    "# Skills Apply Plan",
    "",
    `- host profile: \`${plan.host}\``,
    `- discovered roots: \`${plan.discoveredRoots.length}\``,
    `- planned file changes: \`${plan.fileChanges.length}\``,
    `- manual review groups: \`${plan.manualReview.length}\``,
    ...renderList(
      "Planned File Changes",
      plan.fileChanges.map(
        (change) =>
          `- \`${change.path}\`: \`${change.operations.map((item) => item.kind).join(", ")}\``,
      ),
    ),
    ...renderList(
      "Manual Review",
      plan.manualReview.map(
        (item) => `- \`${item.kind}\` / \`${item.key}\`: \`${item.paths.join("`, `")}\``,
      ),
    ),
  ].join("\n")}\n`;

export const renderSkillsApplyResultMarkdown = (
  result: SkillsApplyResult,
): string =>
  `${[
    "# Skills Apply Result",
    "",
    `- changed files: \`${result.changedFileCount}\``,
    `- manual review groups: \`${result.manualReviewCount}\``,
    `- snapshot: \`${result.snapshotPath}\``,
    ...renderList("Operation Counts", renderOperationCounts(result.operationCounts)),
    ...renderList("Audit Delta", renderAuditDelta(result.auditDelta)),
  ].join("\n")}\n`;

export const renderSkillsRollbackMarkdown = (
  result: SkillsRollbackResult,
): string =>
  `${[
    "# Skills Rollback Result",
    "",
    `- restored files: \`${result.restoredFileCount}\``,
    `- conflicts: \`${result.conflicts.length}\``,
    `- snapshot: \`${result.snapshotPath}\``,
    ...renderList("Conflicts", result.conflicts.map((path) => `- \`${path}\``)),
  ].join("\n")}\n`;

export const renderSkillsBenchmarkMarkdown = (
  result: SkillsBenchmarkResult,
): string =>
  `${[
    "# Skills Benchmark",
    "",
    `- host profile: \`${result.host}\``,
    `- applied changes: \`${result.appliedChangeCount}\``,
    `- manual review groups: \`${result.manualReviewCount}\``,
    `- description overflow delta: \`${result.deltas.descriptionBudgetOverflowDelta}\``,
    `- heavy skill delta: \`${result.deltas.heavySkillDelta}\``,
    `- compatibility issue delta: \`${result.deltas.compatibilityIssueDelta}\``,
    `- reference gap delta: \`${result.deltas.referenceGapSkillDelta}\``,
  ].join("\n")}\n`;

export const renderDuplicateResolutionMarkdown = (
  report: DuplicateResolutionReport,
): string =>
  `${[
    "# Duplicate Resolution Report",
    "",
    `- host profile: \`${report.host}\``,
    `- discovered roots: \`${report.discoveredRoots.length}\``,
    `- duplicate groups: \`${report.groups.length}\``,
    ...renderList(
      "Groups",
      report.groups.map(
        (group) =>
          [
            `- [${group.riskLevel}] \`${group.kind}\` / \`${group.key}\`: keep \`${group.recommendedKeepPath}\`, quarantine \`${group.recommendedQuarantinePaths.join("`, `")}\`, reason: ${group.recommendationReason}, risk: ${group.riskReason}`,
            ...group.pathDetails.map(
              (detail) =>
                `  path=\`${detail.path}\` status=\`${detail.status}\` risk=\`${detail.riskTag}\` managed=\`${detail.isManaged}\` entrypoint=\`${detail.entrypoint}\` hostIssues=\`${detail.hostSpecificIssueCount}\` descTok=\`${detail.descriptionTokens}\` totalTok=\`${detail.totalTokens}\``,
            ),
          ].join("\n"),
      ),
    ),
  ].join("\n")}\n`;

export const renderDuplicateResolutionFileMarkdown = (
  file: DuplicateResolutionFile,
): string =>
  `${[
    "# Duplicate Resolution Template",
    "",
    `- host profile: \`${file.host}\``,
    `- decisions: \`${file.decisions.length}\``,
    ...renderList(
      "Decisions",
      file.decisions.map(
        (decision) =>
          `- \`${decision.kind}\` / \`${decision.key}\`: action=\`${decision.action}\`, keep \`${decision.keepPath}\`, quarantine \`${decision.quarantinePaths.join("`, `")}\`, reason: ${decision.reason}`,
      ),
    ),
  ].join("\n")}\n`;

export const renderDuplicateResolutionApplyMarkdown = (
  result: DuplicateResolutionApplyResult,
): string =>
  `${[
    "# Duplicate Resolution Apply Result",
    "",
    `- changed files: \`${result.changedFileCount}\``,
    `- applied decisions: \`${result.appliedDecisions.length}\``,
    `- skipped decisions: \`${result.skippedDecisions.length}\``,
    `- snapshot: \`${result.snapshotPath}\``,
    ...renderList("Operation Counts", renderOperationCounts(result.operationCounts)),
    ...renderList("Audit Delta", renderAuditDelta(result.auditDelta)),
    ...renderList(
      "Skipped Decisions",
      result.skippedDecisions.map((item) => `- \`${item}\``),
    ),
  ].join("\n")}\n`;
