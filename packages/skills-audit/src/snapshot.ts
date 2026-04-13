import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";

import type {
  GovernanceHost,
  PlannedFileChange,
  SkillsApplyPlan,
  SkillsSnapshot,
} from "./types.ts";

const SNAPSHOT_DIRECTORY = join(
  homedir(),
  ".memory-runtime",
  "skill-governance",
  "snapshots",
);

const buildSnapshotName = (host: SkillsSnapshot["host"]): string =>
  `${new Date().toISOString().replaceAll(":", "-")}-${host}.json`;

export const resolveSnapshotPath = (
  snapshotPath: string | undefined,
  host: SkillsSnapshot["host"],
): string =>
  snapshotPath
    ? resolvePath(snapshotPath)
    : resolvePath(SNAPSHOT_DIRECTORY, buildSnapshotName(host));

export const createSnapshot = (
  plan: SkillsApplyPlan,
): SkillsSnapshot => ({
  schemaVersion: 1,
  createdAt: plan.createdAt,
  host: plan.host,
  roots: plan.discoveredRoots,
  files: plan.fileChanges.map((change) => ({
    path: change.path,
    beforeHash: change.beforeHash,
    afterHash: change.afterHash,
    beforeContent: change.beforeContent,
    operations: change.operations,
  })),
});

export const createSnapshotFromChanges = ({
  createdAt,
  host,
  roots,
  fileChanges,
}: {
  readonly createdAt: string;
  readonly host: GovernanceHost;
  readonly roots: readonly string[];
  readonly fileChanges: readonly PlannedFileChange[];
}): SkillsSnapshot => ({
  schemaVersion: 1,
  createdAt,
  host,
  roots,
  files: fileChanges.map((change) => ({
    path: change.path,
    beforeHash: change.beforeHash,
    afterHash: change.afterHash,
    beforeContent: change.beforeContent,
    operations: change.operations,
  })),
});

export const writeSnapshot = (
  snapshot: SkillsSnapshot,
  snapshotPath: string,
): void => {
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(
    snapshotPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );
};

export const readSnapshot = (
  snapshotPath: string,
): SkillsSnapshot =>
  JSON.parse(readFileSync(snapshotPath, "utf8")) as SkillsSnapshot;
