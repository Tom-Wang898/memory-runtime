import { DEFAULT_REPORT_LIMIT, HEAVY_SKILL_TOKEN_THRESHOLD } from "./constants.ts";
import { getDescriptionThreshold, getGovernanceProfile } from "./profile.ts";
import type {
  CompatibilityIssue,
  DescriptionBudgetOverflow,
  DuplicateGroup,
  GovernanceHost,
  HeavySkill,
  ReferenceMetadataGap,
  SkillRecord,
  SkillsAuditReport,
} from "./types.ts";

const toSortedGroups = (
  records: readonly SkillRecord[],
  keySelector: (record: SkillRecord) => string,
): readonly DuplicateGroup[] => {
  const groups = new Map<string, string[]>();
  for (const record of records) {
    const key = keySelector(record);
    const paths = groups.get(key) ?? [];
    paths.push(record.path);
    groups.set(key, paths);
  }
  return [...groups.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([key, paths]) => ({ key, count: paths.length, paths: paths.sort() }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
};

const selectDescriptionBudgetOverflows = (
  records: readonly SkillRecord[],
  host: GovernanceHost,
): readonly DescriptionBudgetOverflow[] => {
  const profile = getGovernanceProfile(host);
  return records
    .filter((record) => record.descriptionTokens > getDescriptionThreshold(record, profile))
    .map((record) => ({
      path: record.path,
      name: record.name,
      descriptionTokens: record.descriptionTokens,
      threshold: getDescriptionThreshold(record, profile),
    }))
    .sort((left, right) => right.descriptionTokens - left.descriptionTokens);
};

const selectHeavySkills = (records: readonly SkillRecord[]): readonly HeavySkill[] =>
  records
    .filter((record) => record.totalTokens > HEAVY_SKILL_TOKEN_THRESHOLD)
    .map((record) => ({
      path: record.path,
      name: record.name,
      bodyTokens: record.bodyTokens,
      referenceTokens: record.referenceTokens,
      referenceFileCount: record.referenceFileCount,
      totalTokens: record.totalTokens,
    }))
    .sort((left, right) => right.totalTokens - left.totalTokens);

const selectCompatibilityIssues = (
  records: readonly SkillRecord[],
): readonly CompatibilityIssue[] =>
  records
    .filter((record) => record.hostSpecificIssues.length > 0)
    .map((record) => ({ path: record.path, issues: record.hostSpecificIssues }))
    .sort((left, right) => left.path.localeCompare(right.path));

const selectReferenceMetadataGaps = (
  records: readonly SkillRecord[],
): readonly ReferenceMetadataGap[] =>
  records
    .filter((record) => record.referenceGapCount > 0)
    .map((record) => ({
      path: record.path,
      name: record.name,
      referenceGapCount: record.referenceGapCount,
      referenceFileCount: record.referenceFileCount,
      referenceGapPaths: record.referenceGapPaths,
    }))
    .sort((left, right) => right.referenceGapCount - left.referenceGapCount);

const limitItems = <TItem>(
  items: readonly TItem[],
  limit: number,
): readonly TItem[] => items.slice(0, limit);

const renderSection = (
  title: string,
  lines: readonly string[],
): readonly string[] => ["", `## ${title}`, "", ...(lines.length > 0 ? lines : ["- none"])];

const buildSummary = ({
  records,
  descriptionBudgetOverflows,
  heavySkills,
  duplicateNameGroups,
  duplicateBodyGroups,
  compatibilityIssues,
  referenceMetadataGaps,
}: {
  readonly records: readonly SkillRecord[];
  readonly descriptionBudgetOverflows: readonly DescriptionBudgetOverflow[];
  readonly heavySkills: readonly HeavySkill[];
  readonly duplicateNameGroups: readonly DuplicateGroup[];
  readonly duplicateBodyGroups: readonly DuplicateGroup[];
  readonly compatibilityIssues: readonly CompatibilityIssue[];
  readonly referenceMetadataGaps: readonly ReferenceMetadataGap[];
}) => ({
  skillCount: records.length,
  descriptionBudgetOverflowCount: descriptionBudgetOverflows.length,
  heavySkillCount: heavySkills.length,
  duplicateNameGroupCount: duplicateNameGroups.length,
  duplicateBodyGroupCount: duplicateBodyGroups.length,
  compatibilityIssueCount: compatibilityIssues.length,
  referenceGapSkillCount: referenceMetadataGaps.length,
});

const buildLimitedSections = ({
  descriptionBudgetOverflows,
  heavySkills,
  duplicateNameGroups,
  duplicateBodyGroups,
  compatibilityIssues,
  referenceMetadataGaps,
  limit,
}: {
  readonly descriptionBudgetOverflows: readonly DescriptionBudgetOverflow[];
  readonly heavySkills: readonly HeavySkill[];
  readonly duplicateNameGroups: readonly DuplicateGroup[];
  readonly duplicateBodyGroups: readonly DuplicateGroup[];
  readonly compatibilityIssues: readonly CompatibilityIssue[];
  readonly referenceMetadataGaps: readonly ReferenceMetadataGap[];
  readonly limit: number;
}) => ({
  descriptionBudgetOverflows: limitItems(descriptionBudgetOverflows, limit),
  heavySkills: limitItems(heavySkills, limit),
  duplicateNameGroups: limitItems(duplicateNameGroups, limit),
  duplicateBodyGroups: limitItems(duplicateBodyGroups, limit),
  compatibilityIssues: limitItems(compatibilityIssues, limit),
  referenceMetadataGaps: limitItems(referenceMetadataGaps, limit),
});

const buildOverviewLines = (report: SkillsAuditReport): readonly string[] => [
  "# Skills Audit",
  "",
  `- generated at: \`${report.generatedAt}\``,
  `- host profile: \`${report.host}\``,
  `- requested roots: \`${report.requestedRoots.length}\``,
  `- discovered roots: \`${report.discoveredRoots.length}\``,
  `- skills scanned: \`${report.summary.skillCount}\``,
  `- description budget overflows: \`${report.summary.descriptionBudgetOverflowCount}\``,
  `- heavy skills: \`${report.summary.heavySkillCount}\``,
  `- duplicate names: \`${report.summary.duplicateNameGroupCount}\``,
  `- duplicate bodies: \`${report.summary.duplicateBodyGroupCount}\``,
  `- compatibility issues: \`${report.summary.compatibilityIssueCount}\``,
  `- reference metadata gaps: \`${report.summary.referenceGapSkillCount}\``,
];

const buildSectionLines = (report: SkillsAuditReport): readonly string[] => [
  ...renderSection(
    "Description Budget Overflows",
    report.descriptionBudgetOverflows.map(
      (item) =>
        `- \`${item.descriptionTokens}\` tok / limit \`${item.threshold}\`: \`${item.path}\``,
    ),
  ),
  ...renderSection(
    "Heavy Skills",
    report.heavySkills.map(
      (item) =>
        `- \`${item.totalTokens}\` tok (\`body=${item.bodyTokens}\`, \`refs=${item.referenceTokens}\`, \`ref_files=${item.referenceFileCount}\`): \`${item.path}\``,
    ),
  ),
  ...renderSection(
    "Duplicate Name Groups",
    report.duplicateNameGroups.map(
      (item) => `- \`${item.key}\` x${item.count}: \`${item.paths.join("`, `")}\``,
    ),
  ),
  ...renderSection(
    "Duplicate Body Groups",
    report.duplicateBodyGroups.map(
      (item) => `- \`${item.key.slice(0, 12)}\` x${item.count}: \`${item.paths.join("`, `")}\``,
    ),
  ),
  ...renderSection(
    "Compatibility Issues",
    report.compatibilityIssues.map(
      (item) => `- \`${item.issues.join(", ")}\`: \`${item.path}\``,
    ),
  ),
  ...renderSection(
    "Reference Metadata Gaps",
    report.referenceMetadataGaps.map(
      (item) =>
        `- \`${item.referenceGapCount}\` / \`${item.referenceFileCount}\`: \`${item.path}\``,
    ),
  ),
];

const buildMissingRootLines = (report: SkillsAuditReport): readonly string[] =>
  report.missingRoots.length > 0
    ? ["", "## Missing Roots", "", ...report.missingRoots.map((root) => `- \`${root}\``)]
    : [];

export const buildSkillsAuditReport = ({
  host,
  records,
  requestedRoots,
  discoveredRoots,
  missingRoots,
  limit = DEFAULT_REPORT_LIMIT,
}: {
  readonly host: GovernanceHost;
  readonly records: readonly SkillRecord[];
  readonly requestedRoots: readonly string[];
  readonly discoveredRoots: readonly string[];
  readonly missingRoots: readonly string[];
  readonly limit?: number;
}): SkillsAuditReport => {
  const activeRecords = records.filter((record) => record.status !== "quarantined");
  const descriptionBudgetOverflows = selectDescriptionBudgetOverflows(activeRecords, host);
  const heavySkills = selectHeavySkills(activeRecords);
  const duplicateNameGroups = toSortedGroups(activeRecords, (record) => record.name.toLowerCase());
  const duplicateBodyGroups = toSortedGroups(activeRecords, (record) => record.bodyHash);
  const compatibilityIssues = selectCompatibilityIssues(activeRecords);
  const referenceMetadataGaps = selectReferenceMetadataGaps(activeRecords);
  const summary = buildSummary({
    records,
    descriptionBudgetOverflows,
    heavySkills,
    duplicateNameGroups,
    duplicateBodyGroups,
    compatibilityIssues,
    referenceMetadataGaps,
  });
  const sections = buildLimitedSections({
    descriptionBudgetOverflows,
    heavySkills,
    duplicateNameGroups,
    duplicateBodyGroups,
    compatibilityIssues,
    referenceMetadataGaps,
    limit,
  });
  return {
    generatedAt: new Date().toISOString(),
    host,
    requestedRoots,
    discoveredRoots,
    missingRoots,
    summary,
    ...sections,
  };
};

export const renderSkillsAuditMarkdown = (
  report: SkillsAuditReport,
): string =>
  `${[
    ...buildOverviewLines(report),
    ...buildSectionLines(report),
    ...buildMissingRootLines(report),
  ].join("\n")}\n`;
