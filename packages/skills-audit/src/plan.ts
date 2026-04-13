import { applyCompatibilityRewrite } from "./compatibility.ts";
import { applyDescriptionTrim } from "./description.ts";
import { discoverSkillRoots } from "./discovery.ts";
import { readTextFile, hashText } from "./file-utils.ts";
import { getGovernanceProfile, resolveGovernanceHost } from "./profile.ts";
import { injectReferenceMetadata } from "./reference-metadata.ts";
import { buildSkillsAuditReport } from "./report.ts";
import { scanSkillRoots } from "./scan.ts";
import type {
  ManualReviewItem,
  PlannedFileChange,
  SkillRecord,
  SkillsAuditReport,
  SkillsApplyPlan,
  SkillsApplyOptions,
} from "./types.ts";

const planSkillChange = (
  record: SkillRecord,
  host: ReturnType<typeof getGovernanceProfile>,
): PlannedFileChange | null => {
  const beforeContent = readTextFile(record.path);
  let nextContent = beforeContent;
  const operations = [];
  const compatibility = applyCompatibilityRewrite(nextContent);
  nextContent = compatibility.content;
  if (compatibility.operation) {
    operations.push(compatibility.operation);
  }
  const description = applyDescriptionTrim({
    record,
    profile: host,
    content: nextContent,
  });
  nextContent = description.content;
  if (description.operation) {
    operations.push(description.operation);
  }
  if (operations.length === 0 || nextContent === beforeContent) {
    return null;
  }
  return {
    path: record.path,
    operations,
    beforeHash: hashText(beforeContent),
    afterHash: hashText(nextContent),
    beforeContent,
    afterContent: nextContent,
  };
};

const planReferenceChanges = (
  record: SkillRecord,
): readonly PlannedFileChange[] =>
  record.referenceGapPaths.flatMap((filePath) => {
    const beforeContent = readTextFile(filePath);
    const result = injectReferenceMetadata({
      filePath,
      skillName: record.name,
      content: beforeContent,
    });
    if (!result.operation || result.content === beforeContent) {
      return [];
    }
    return [
      {
        path: filePath,
        operations: [result.operation],
        beforeHash: hashText(beforeContent),
        afterHash: hashText(result.content),
        beforeContent,
        afterContent: result.content,
      },
    ];
  });

const buildManualReview = (
  report: SkillsAuditReport,
): readonly ManualReviewItem[] =>
  report.duplicateNameGroups
    .map((group) => ({
      kind: "duplicate-name" as const,
      key: group.key,
      paths: group.paths,
    }))
    .concat(
      report.duplicateBodyGroups.map((group) => ({
        kind: "duplicate-body" as const,
        key: group.key,
        paths: group.paths,
      })),
    );

export const buildSkillsApplyPlan = (
  options: SkillsApplyOptions = {},
): SkillsApplyPlan => {
  const hostName = resolveGovernanceHost(options.host);
  const host = getGovernanceProfile(hostName);
  const roots = discoverSkillRoots(options.roots);
  const records = scanSkillRoots(roots.discoveredRoots);
  const report = buildSkillsAuditReport({
    host: hostName,
    records,
    requestedRoots: roots.requestedRoots,
    discoveredRoots: roots.discoveredRoots,
    missingRoots: roots.missingRoots,
    limit: options.limit,
  });
  const reviewReport = buildSkillsAuditReport({
    host: hostName,
    records,
    requestedRoots: roots.requestedRoots,
    discoveredRoots: roots.discoveredRoots,
    missingRoots: roots.missingRoots,
    limit: Number.MAX_SAFE_INTEGER,
  });
  const fileChanges = records
    .flatMap((record) => {
      const plannedSkillChange = planSkillChange(record, host);
      const plannedReferenceChanges = planReferenceChanges(record);
      return plannedSkillChange
        ? [plannedSkillChange].concat(plannedReferenceChanges)
        : plannedReferenceChanges;
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    createdAt: new Date().toISOString(),
    host: hostName,
    requestedRoots: roots.requestedRoots,
    discoveredRoots: roots.discoveredRoots,
    missingRoots: roots.missingRoots,
    report,
    fileChanges,
    manualReview: buildManualReview(reviewReport),
  };
};
