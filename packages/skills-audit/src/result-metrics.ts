import type {
  AuditDeltaSummary,
  OperationCountSummary,
  PlannedFileChange,
  SkillsAuditSummary,
} from "./types.ts";

const EMPTY_OPERATION_COUNTS: OperationCountSummary = {
  descriptionTrimCount: 0,
  hostCompatRewriteCount: 0,
  referenceMetadataInjectCount: 0,
  duplicateQuarantineCount: 0,
};

export const countOperations = (
  fileChanges: readonly PlannedFileChange[],
): OperationCountSummary =>
  fileChanges.reduce<OperationCountSummary>((counts, change) => {
    const kinds = new Set(change.operations.map((operation) => operation.kind));
    for (const kind of kinds) {
      if (kind === "description-trim") {
        counts.descriptionTrimCount += 1;
      }
      if (kind === "host-compat-rewrite") {
        counts.hostCompatRewriteCount += 1;
      }
      if (kind === "reference-metadata-inject") {
        counts.referenceMetadataInjectCount += 1;
      }
      if (kind === "duplicate-quarantine") {
        counts.duplicateQuarantineCount += 1;
      }
    }
    return counts;
  }, { ...EMPTY_OPERATION_COUNTS });

export const buildAuditDelta = (
  before: SkillsAuditSummary,
  after: SkillsAuditSummary,
): AuditDeltaSummary => ({
  before,
  after,
  deltas: {
    descriptionBudgetOverflowDelta:
      after.descriptionBudgetOverflowCount - before.descriptionBudgetOverflowCount,
    heavySkillDelta: after.heavySkillCount - before.heavySkillCount,
    compatibilityIssueDelta:
      after.compatibilityIssueCount - before.compatibilityIssueCount,
    referenceGapSkillDelta:
      after.referenceGapSkillCount - before.referenceGapSkillCount,
    duplicateNameGroupDelta:
      after.duplicateNameGroupCount - before.duplicateNameGroupCount,
    duplicateBodyGroupDelta:
      after.duplicateBodyGroupCount - before.duplicateBodyGroupCount,
  },
});
