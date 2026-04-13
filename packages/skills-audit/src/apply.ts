import { existsSync } from "node:fs";

import { auditSkills } from "./audit.ts";
import { hashText, readTextFile, writeTextFile } from "./file-utils.ts";
import { buildSkillsApplyPlan } from "./plan.ts";
import { buildAuditDelta, countOperations } from "./result-metrics.ts";
import {
  createSnapshot,
  resolveSnapshotPath,
  writeSnapshot,
} from "./snapshot.ts";
import type {
  SkillsApplyOptions,
  SkillsApplyResult,
  SkillsRollbackResult,
} from "./types.ts";
import { readSnapshot } from "./snapshot.ts";

const restoreSnapshotFile = (
  path: string,
  content: string,
): void => {
  writeTextFile(path, content);
};

export const applySkillsGovernance = (
  options: SkillsApplyOptions = {},
): SkillsApplyResult => {
  const plan = buildSkillsApplyPlan(options);
  if (plan.discoveredRoots.length === 0) {
    throw new Error("No skill roots found. Pass --root <path> or set MEMORY_RUNTIME_SKILL_ROOTS.");
  }
  const snapshotPath = resolveSnapshotPath(options.snapshotPath, plan.host);
  const snapshot = createSnapshot(plan);
  writeSnapshot(snapshot, snapshotPath);
  for (const change of plan.fileChanges) {
    writeTextFile(change.path, change.afterContent);
  }
  const afterReport = auditSkills({
    roots: plan.discoveredRoots,
    host: plan.host,
    limit: Number.MAX_SAFE_INTEGER,
  });
  return {
    changedFileCount: plan.fileChanges.length,
    manualReviewCount: plan.manualReview.length,
    snapshotPath,
    plan,
    operationCounts: countOperations(plan.fileChanges),
    auditDelta: buildAuditDelta(plan.report.summary, afterReport.summary),
  };
};

const validateRollback = (
  snapshotPath: string,
  force: boolean,
): { readonly conflicts: readonly string[]; readonly snapshot: ReturnType<typeof readSnapshot> } => {
  const snapshot = readSnapshot(snapshotPath);
  const conflicts = snapshot.files.flatMap((file) => {
    if (!existsSync(file.path)) {
      return [];
    }
    const currentHash = hashText(readTextFile(file.path));
    return currentHash !== file.afterHash && !force ? [file.path] : [];
  });
  return { conflicts, snapshot };
};

export const rollbackSkillsGovernance = ({
  snapshotPath,
  force = false,
}: {
  readonly snapshotPath: string;
  readonly force?: boolean;
}): SkillsRollbackResult => {
  const { conflicts, snapshot } = validateRollback(snapshotPath, force);
  if (conflicts.length > 0) {
    return {
      restoredFileCount: 0,
      conflicts,
      snapshotPath,
    };
  }
  for (const file of snapshot.files) {
    restoreSnapshotFile(file.path, file.beforeContent);
  }
  return {
    restoredFileCount: snapshot.files.length,
    conflicts: [],
    snapshotPath,
  };
};
