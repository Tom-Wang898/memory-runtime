import type {
  CapsuleRequest,
  CheckpointRecord,
  DecisionRecord,
  OpenLoop,
  ProjectCapsule,
  ProjectIdentity,
  WorkingSetEntry,
} from "@memory-runtime/memory-core";
import { resolveTokenBudget } from "@memory-runtime/memory-core";

import {
  MAX_OPEN_LOOPS,
  MAX_RECENT_DECISIONS,
  MAX_WORKING_SET,
} from "./constants.js";

interface ProjectStateRow {
  readonly project_id: string;
  readonly root_path: string;
  readonly host: string | null;
  readonly vcs_root: string | null;
  readonly summary: string;
  readonly active_task: string | null;
  readonly updated_at: string;
}

const fallbackSummary = (projectId: string): string =>
  `Hot memory capsule for ${projectId}`;

export const trimOpenLoops = (
  openLoops: readonly OpenLoop[],
): readonly OpenLoop[] => openLoops.slice(0, MAX_OPEN_LOOPS);

export const trimDecisions = (
  decisions: readonly DecisionRecord[],
): readonly DecisionRecord[] => decisions.slice(0, MAX_RECENT_DECISIONS);

export const trimWorkingSet = (
  workingSet: readonly WorkingSetEntry[],
): readonly WorkingSetEntry[] => workingSet.slice(0, MAX_WORKING_SET);

export const resolveCheckpointSummary = (
  record: CheckpointRecord,
  currentSummary: string | null,
): string => {
  if (record.summary?.trim()) {
    return record.summary.trim();
  }
  if (currentSummary?.trim()) {
    return currentSummary.trim();
  }
  if (record.activeTask?.trim()) {
    return `Current focus: ${record.activeTask.trim()}`;
  }
  return fallbackSummary(record.project.id);
};

export const toProjectIdentity = (row: ProjectStateRow): ProjectIdentity => ({
  id: row.project_id,
  rootPath: row.root_path,
  host: row.host,
  vcsRoot: row.vcs_root,
});

export const toProjectCapsule = (
  row: ProjectStateRow,
  openLoops: readonly OpenLoop[],
  recentDecisions: readonly DecisionRecord[],
  workingSet: readonly WorkingSetEntry[],
): ProjectCapsule => ({
  project: toProjectIdentity(row),
  summary: row.summary,
  activeTask: row.active_task,
  openLoops,
  recentDecisions,
  workingSet,
  supportingFacts: [],
  budget: resolveTokenBudget(undefined),
  source: "hot",
  generatedAt: row.updated_at,
});

export const overrideCapsuleRequest = (
  capsule: ProjectCapsule,
  request: CapsuleRequest,
): ProjectCapsule => ({
  ...capsule,
  project: request.project,
  budget: resolveTokenBudget(request.budget),
});
