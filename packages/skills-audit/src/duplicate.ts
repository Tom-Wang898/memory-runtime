import { readFileSync } from "node:fs";

import { auditSkills } from "./audit.ts";
import { discoverSkillRoots } from "./discovery.ts";
import {
  assessDuplicateRisk,
  compareDuplicateGroups,
} from "./duplicate-risk.ts";
import { hashText, readTextFile, writeTextFile } from "./file-utils.ts";
import { parseFrontmatter, updateFrontmatterField } from "./frontmatter.ts";
import { resolveGovernanceHost } from "./profile.ts";
import { buildAuditDelta, countOperations } from "./result-metrics.ts";
import {
  createSnapshotFromChanges,
  resolveSnapshotPath,
  writeSnapshot,
} from "./snapshot.ts";
import { scanSkillRoots } from "./scan.ts";
import type {
  DuplicateGroup,
  DuplicateResolutionApplyResult,
  DuplicateResolutionDecision,
  DuplicateResolutionFile,
  DuplicateResolutionGroup,
  DuplicateResolutionReport,
  PlannedFileChange,
  SkillRecord,
} from "./types.ts";

const sortPreferredPath = (left: string, right: string): number => {
  const leftManaged = left.includes("/skillio-managed/");
  const rightManaged = right.includes("/skillio-managed/");
  if (leftManaged !== rightManaged) {
    return leftManaged ? 1 : -1;
  }
  return left.length - right.length || left.localeCompare(right);
};

const resolveRecommendedKeepPath = (
  paths: readonly string[],
): string => [...paths].sort(sortPreferredPath)[0] ?? "";

const buildRecommendationReason = (
  keepPath: string,
  quarantinePaths: readonly string[],
): string => {
  if (quarantinePaths.some((path) => path.includes("/skillio-managed/"))) {
    return `Prefer ${keepPath} because it avoids quarantining the primary non-managed skill entry.`;
  }
  return `Prefer ${keepPath} as the canonical surviving path for this duplicate group.`;
};

const toResolutionGroup = (
  group: DuplicateGroup,
  kind: DuplicateResolutionGroup["kind"],
  recordByPath: ReadonlyMap<string, SkillRecord>,
): DuplicateResolutionGroup => {
  const recommendedKeepPath = resolveRecommendedKeepPath(group.paths);
  const pathDetails = group.paths.map((path) => {
    const record = recordByPath.get(path);
    return {
      path,
      root: record?.root ?? "",
      riskTag: record?.risk ?? "unknown",
      status: record?.status ?? "unknown",
      isManaged: path.includes("/skillio-managed/"),
      entrypoint: record?.entrypoint ?? false,
      hostSpecificIssueCount: record?.hostSpecificIssues.length ?? 0,
      descriptionTokens: record?.descriptionTokens ?? 0,
      totalTokens: record?.totalTokens ?? 0,
    };
  });
  const risk = assessDuplicateRisk(pathDetails);
  return {
    kind,
    key: group.key,
    paths: group.paths,
    recommendedKeepPath,
    recommendedQuarantinePaths: group.paths.filter(
      (path) => path !== recommendedKeepPath,
    ),
    recommendationReason: buildRecommendationReason(
      recommendedKeepPath,
      group.paths.filter((path) => path !== recommendedKeepPath),
    ),
    riskLevel: risk.riskLevel,
    riskReason: risk.riskReason,
    pathDetails,
  };
};

const findGroup = (
  groups: readonly DuplicateResolutionGroup[],
  decision: DuplicateResolutionDecision,
): DuplicateResolutionGroup | undefined =>
  groups.find(
    (group) => group.kind === decision.kind && group.key === decision.key,
  );

const buildDecisionNote = (
  existingContent: string,
  decision: DuplicateResolutionDecision,
): string => {
  const existingNotes = parseFrontmatter(existingContent).values.get("notes")?.trim() ?? "";
  const nextNote = `${decision.kind}:${decision.key} -> ${decision.keepPath} (${decision.reason})`;
  if (!existingNotes) {
    return nextNote;
  }
  return existingNotes.includes(nextNote)
    ? existingNotes
    : `${existingNotes} | ${nextNote}`;
};

const buildQuarantineContent = (
  content: string,
  decision: DuplicateResolutionDecision,
): string => {
  let nextContent = updateFrontmatterField(content, "status", "quarantined");
  nextContent = updateFrontmatterField(nextContent, "replaced_by", decision.keepPath);
  nextContent = updateFrontmatterField(
    nextContent,
    "notes",
    buildDecisionNote(content, decision),
  );
  return nextContent;
};

const createDuplicateQuarantineChange = ({
  path,
  decision,
  previousChange,
}: {
  readonly path: string;
  readonly decision: DuplicateResolutionDecision;
  readonly previousChange: PlannedFileChange | undefined;
}): PlannedFileChange | null => {
  const beforeContent = previousChange?.beforeContent ?? readTextFile(path);
  const inputContent = previousChange?.afterContent ?? beforeContent;
  const afterContent = buildQuarantineContent(inputContent, decision);
  if (inputContent === afterContent) {
    return null;
  }
  return {
    path,
    operations: (previousChange?.operations ?? []).concat({
      kind: "duplicate-quarantine",
      detail: `${decision.kind}:${decision.key} keep ${decision.keepPath}; ${decision.reason}`,
    }),
    beforeHash: hashText(beforeContent),
    afterHash: hashText(afterContent),
    beforeContent,
    afterContent,
  };
};

export const buildDuplicateResolutionReport = ({
  roots,
  host,
}: {
  readonly roots?: readonly string[];
  readonly host?: string;
} = {}): DuplicateResolutionReport => {
  const rootsInfo = discoverSkillRoots(roots);
  const records = scanSkillRoots(rootsInfo.discoveredRoots);
  const activeRecords = records.filter((record) => record.status !== "quarantined");
  const recordByPath = new Map(records.map((record) => [record.path, record] as const));
  const byName = new Map<string, string[]>();
  const byBody = new Map<string, string[]>();
  for (const record of activeRecords) {
    const nameKey = record.name.toLowerCase();
    byName.set(nameKey, (byName.get(nameKey) ?? []).concat(record.path));
    byBody.set(record.bodyHash, (byBody.get(record.bodyHash) ?? []).concat(record.path));
  }
  const groups = [...byName.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([key, paths]) =>
      toResolutionGroup(
        { key, count: paths.length, paths: paths.sort() },
        "duplicate-name",
        recordByPath,
      ),
    )
    .concat(
      [...byBody.entries()]
        .filter(([, paths]) => paths.length > 1)
        .map(([key, paths]) =>
          toResolutionGroup(
            { key, count: paths.length, paths: paths.sort() },
            "duplicate-body",
            recordByPath,
          ),
        ),
    )
    .sort(compareDuplicateGroups);
  return {
    generatedAt: new Date().toISOString(),
    host: resolveGovernanceHost(host),
    requestedRoots: rootsInfo.requestedRoots,
    discoveredRoots: rootsInfo.discoveredRoots,
    missingRoots: rootsInfo.missingRoots,
    groups,
  };
};

export const buildDuplicateResolutionFile = ({
  roots,
  host,
}: {
  readonly roots?: readonly string[];
  readonly host?: string;
} = {}): DuplicateResolutionFile => {
  const report = buildDuplicateResolutionReport({ roots, host });
  return {
    host: report.host,
    generatedAt: report.generatedAt,
    requestedRoots: report.requestedRoots,
    decisions: report.groups.map((group) => ({
      kind: group.kind,
      key: group.key,
      action: "quarantine",
      keepPath: group.recommendedKeepPath,
      quarantinePaths: group.recommendedQuarantinePaths,
      reason: group.recommendationReason,
    })),
  };
};

export const readDuplicateResolutionFile = (
  decisionFilePath: string,
): DuplicateResolutionFile =>
  JSON.parse(readFileSync(decisionFilePath, "utf8")) as DuplicateResolutionFile;

export const applyDuplicateResolutionFile = ({
  decisionFilePath,
  snapshotPath,
}: {
  readonly decisionFilePath: string;
  readonly snapshotPath?: string;
}): DuplicateResolutionApplyResult => {
  const decisionFile = readDuplicateResolutionFile(decisionFilePath);
  const beforeAudit = auditSkills({
    roots: decisionFile.requestedRoots,
    host: decisionFile.host,
    limit: Number.MAX_SAFE_INTEGER,
  });
  const report = buildDuplicateResolutionReport({
    roots: decisionFile.requestedRoots,
    host: decisionFile.host,
  });
  const skippedDecisions: string[] = [];
  const fileChangesByPath = new Map<string, PlannedFileChange>();
  for (const decision of decisionFile.decisions) {
    if (decision.action === "skip") {
      skippedDecisions.push(`${decision.kind}:${decision.key}:skipped-by-decision`);
      continue;
    }
    const group = findGroup(report.groups, decision);
    if (!group) {
      skippedDecisions.push(`${decision.kind}:${decision.key}:group-not-found`);
      continue;
    }
    if (!group.paths.includes(decision.keepPath)) {
      skippedDecisions.push(`${decision.kind}:${decision.key}:keep-path-not-found`);
      continue;
    }
    for (const path of decision.quarantinePaths) {
      if (!group.paths.includes(path) || path === decision.keepPath) {
        skippedDecisions.push(`${decision.kind}:${decision.key}:invalid-quarantine:${path}`);
        continue;
      }
      const change = createDuplicateQuarantineChange({
        path,
        decision,
        previousChange: fileChangesByPath.get(path),
      });
      if (change) {
        fileChangesByPath.set(path, change);
      }
    }
  }
  const fileChanges = [...fileChangesByPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const createdAt = new Date().toISOString();
  const resolvedSnapshotPath = resolveSnapshotPath(snapshotPath, report.host);
  writeSnapshot(
    createSnapshotFromChanges({
      createdAt,
      host: report.host,
      roots: report.discoveredRoots,
      fileChanges,
    }),
    resolvedSnapshotPath,
  );
  for (const change of fileChanges) {
    writeTextFile(change.path, change.afterContent);
  }
  const afterAudit = auditSkills({
    roots: report.discoveredRoots,
    host: report.host,
    limit: Number.MAX_SAFE_INTEGER,
  });
  return {
    changedFileCount: fileChanges.length,
    snapshotPath: resolvedSnapshotPath,
    appliedDecisions: decisionFile.decisions,
    skippedDecisions,
    operationCounts: countOperations(fileChanges),
    auditDelta: buildAuditDelta(beforeAudit.summary, afterAudit.summary),
  };
};
