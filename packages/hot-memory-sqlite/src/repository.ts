import type { DatabaseSync } from "node:sqlite";

import type {
  CapsuleRequest,
  CheckpointRecord,
  ConstraintRecord,
  DecisionRecord,
  OpenLoop,
  PromotionJobRecord,
  PromotionRecord,
  ProjectCapsule,
  RuntimeMetricRecord,
  WorkingSetEntry,
} from "@memory-runtime/memory-core";

export interface StoredProjectRecord {
  readonly projectId: string;
  readonly rootPath: string;
  readonly updatedAt: string;
}

import {
  overrideCapsuleRequest,
  resolveCheckpointSummary,
  sortConstraints,
  toProjectCapsule,
  trimConstraints,
  trimDecisions,
  trimOpenLoops,
  trimWorkingSet,
} from "./serialization.js";

const normalizeKey = (value: string): string => value.trim().toLowerCase();

const sortByUpdatedAtDesc = <T extends { readonly updatedAt: string }>(
  items: readonly T[],
): readonly T[] =>
  [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const mergeOpenLoops = (
  current: readonly OpenLoop[],
  incoming: readonly OpenLoop[],
): readonly OpenLoop[] => {
  if (incoming.length === 0) {
    return current;
  }
  const merged = new Map<string, OpenLoop>();
  for (const item of [...current, ...incoming]) {
    merged.set(normalizeKey(item.summary), item);
  }
  return trimOpenLoops(sortByUpdatedAtDesc([...merged.values()]));
};

const mergeRecentDecisions = (
  current: readonly DecisionRecord[],
  incoming: readonly DecisionRecord[],
): readonly DecisionRecord[] => {
  if (incoming.length === 0) {
    return current;
  }
  const merged = new Map<string, DecisionRecord>();
  for (const item of [...current, ...incoming]) {
    merged.set(normalizeKey(item.summary), item);
  }
  return trimDecisions(sortByUpdatedAtDesc([...merged.values()]));
};

const mergeConstraints = (
  current: readonly ConstraintRecord[],
  incoming: readonly ConstraintRecord[],
): readonly ConstraintRecord[] => {
  if (incoming.length === 0) {
    return current;
  }
  const merged = new Map<string, ConstraintRecord>();
  for (const item of sortConstraints([...current, ...incoming])) {
    const key = normalizeKey(item.summary);
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  }
  return trimConstraints([...merged.values()]);
};

const mergeWorkingSet = (
  current: readonly WorkingSetEntry[],
  incoming: readonly WorkingSetEntry[],
): readonly WorkingSetEntry[] => {
  if (incoming.length === 0) {
    return current;
  }
  const merged = new Map<string, WorkingSetEntry>();
  for (const item of [...current, ...incoming]) {
    merged.set(`${item.kind}:${normalizeKey(item.value)}`, item);
  }
  return trimWorkingSet(sortByUpdatedAtDesc([...merged.values()]));
};

const projectStateStatement = (database: DatabaseSync) =>
  database.prepare(`
    INSERT INTO project_state (
      project_id, root_path, host, vcs_root, summary, active_task, next_step, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      root_path = excluded.root_path,
      host = excluded.host,
      vcs_root = excluded.vcs_root,
      summary = excluded.summary,
      active_task = excluded.active_task,
      next_step = excluded.next_step,
      updated_at = excluded.updated_at
  `);

const readProjectState = (database: DatabaseSync, projectId: string) =>
  database
    .prepare("SELECT * FROM project_state WHERE project_id = ?")
    .get(projectId) as Record<string, string | null> | undefined;

const readOpenLoops = (database: DatabaseSync, projectId: string): OpenLoop[] =>
  database
    .prepare(
      "SELECT loop_id, summary, severity, updated_at FROM open_loops WHERE project_id = ? ORDER BY updated_at DESC",
    )
    .all(projectId)
    .map((row) => ({
      id: String(row.loop_id),
      summary: String(row.summary),
      severity: row.severity as OpenLoop["severity"],
      updatedAt: String(row.updated_at),
    }));

const readConstraints = (
  database: DatabaseSync,
  projectId: string,
): readonly ConstraintRecord[] =>
  sortConstraints(
    database
      .prepare(
        "SELECT constraint_id, summary, priority, source_kind, updated_at FROM pinned_constraints WHERE project_id = ?",
      )
      .all(projectId)
      .map((row) => ({
        id: String(row.constraint_id),
        summary: String(row.summary),
        priority: row.priority as ConstraintRecord["priority"],
        sourceKind: row.source_kind as ConstraintRecord["sourceKind"],
        updatedAt: String(row.updated_at),
      })),
  );

const readRecentDecisions = (
  database: DatabaseSync,
  projectId: string,
): DecisionRecord[] =>
  database
    .prepare(
      "SELECT decision_id, summary, reason, updated_at, source_uri FROM recent_decisions WHERE project_id = ? ORDER BY updated_at DESC",
    )
    .all(projectId)
    .map((row) => ({
      id: String(row.decision_id),
      summary: String(row.summary),
      reason: String(row.reason),
      updatedAt: String(row.updated_at),
      sourceUri: row.source_uri ? String(row.source_uri) : null,
    }));

const readWorkingSet = (
  database: DatabaseSync,
  projectId: string,
): WorkingSetEntry[] =>
  database
    .prepare(
      "SELECT kind, label, value, updated_at, weight FROM working_set WHERE project_id = ? ORDER BY entry_rank ASC",
    )
    .all(projectId)
    .map((row) => ({
      kind: row.kind as WorkingSetEntry["kind"],
      label: String(row.label),
      value: String(row.value),
      updatedAt: String(row.updated_at),
      weight:
        typeof row.weight === "number" ? Number(row.weight) : undefined,
    }));

const replaceOpenLoops = (
  database: DatabaseSync,
  projectId: string,
  openLoops: readonly OpenLoop[],
): void => {
  database.prepare("DELETE FROM open_loops WHERE project_id = ?").run(projectId);
  const statement = database.prepare(
    "INSERT INTO open_loops (project_id, loop_id, summary, severity, updated_at) VALUES (?, ?, ?, ?, ?)",
  );
  for (const openLoop of trimOpenLoops(openLoops)) {
    statement.run(
      projectId,
      openLoop.id,
      openLoop.summary,
      openLoop.severity,
      openLoop.updatedAt,
    );
  }
};

const replaceConstraints = (
  database: DatabaseSync,
  projectId: string,
  constraints: readonly ConstraintRecord[],
): void => {
  database
    .prepare("DELETE FROM pinned_constraints WHERE project_id = ?")
    .run(projectId);
  const statement = database.prepare(
    "INSERT INTO pinned_constraints (project_id, constraint_id, summary, priority, source_kind, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const constraint of trimConstraints(constraints)) {
    statement.run(
      projectId,
      constraint.id,
      constraint.summary,
      constraint.priority,
      constraint.sourceKind,
      constraint.updatedAt,
    );
  }
};

const replaceRecentDecisions = (
  database: DatabaseSync,
  projectId: string,
  recentDecisions: readonly DecisionRecord[],
): void => {
  database
    .prepare("DELETE FROM recent_decisions WHERE project_id = ?")
    .run(projectId);
  const statement = database.prepare(
    "INSERT INTO recent_decisions (project_id, decision_id, summary, reason, updated_at, source_uri) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const decision of trimDecisions(recentDecisions)) {
    statement.run(
      projectId,
      decision.id,
      decision.summary,
      decision.reason,
      decision.updatedAt,
      decision.sourceUri,
    );
  }
};

const replaceWorkingSet = (
  database: DatabaseSync,
  projectId: string,
  workingSet: readonly WorkingSetEntry[],
): void => {
  database.prepare("DELETE FROM working_set WHERE project_id = ?").run(projectId);
  const statement = database.prepare(
    "INSERT INTO working_set (project_id, entry_rank, kind, label, value, updated_at, weight) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  trimWorkingSet(workingSet).forEach((entry, index) => {
    statement.run(
      projectId,
      index,
      entry.kind,
      entry.label,
      entry.value,
      entry.updatedAt,
      entry.weight ?? null,
    );
  });
};

const writeProjectState = (
  database: DatabaseSync,
  record: CheckpointRecord,
  updatedAt: string,
): void => {
  const current = readProjectState(database, record.project.id);
  const summary = resolveCheckpointSummary(
    record,
    current?.summary ? String(current.summary) : null,
  );
  projectStateStatement(database).run(
    record.project.id,
    record.project.rootPath,
    record.project.host,
    record.project.vcsRoot,
    summary,
    record.activeTask,
    record.nextStep ?? null,
    updatedAt,
  );
};

const writeCapsuleState = (
  database: DatabaseSync,
  capsule: ProjectCapsule,
  updatedAt: string,
): void => {
  projectStateStatement(database).run(
    capsule.project.id,
    capsule.project.rootPath,
    capsule.project.host,
    capsule.project.vcsRoot,
    capsule.summary,
    capsule.activeTask,
    capsule.nextStep ?? null,
    updatedAt,
  );
};

export const readStoredProjectCapsule = (
  database: DatabaseSync,
  projectId: string,
): ProjectCapsule | null => {
  const projectState = readProjectState(database, projectId);
  if (!projectState) {
    return null;
  }
  return toProjectCapsule(
    {
      project_id: String(projectState.project_id),
      root_path: String(projectState.root_path),
      host: projectState.host ? String(projectState.host) : null,
      vcs_root: projectState.vcs_root ? String(projectState.vcs_root) : null,
      summary: String(projectState.summary),
      active_task: projectState.active_task
        ? String(projectState.active_task)
        : null,
      next_step: projectState.next_step ? String(projectState.next_step) : null,
      updated_at: String(projectState.updated_at),
    },
    readConstraints(database, projectId),
    readOpenLoops(database, projectId),
    readRecentDecisions(database, projectId),
    readWorkingSet(database, projectId),
  );
};

export const buildStoredProjectCapsule = (
  database: DatabaseSync,
  request: CapsuleRequest,
): ProjectCapsule | null => {
  const capsule = readStoredProjectCapsule(database, request.project.id);
  return capsule ? overrideCapsuleRequest(capsule, request) : null;
};

export const writeCheckpointRecord = (
  database: DatabaseSync,
  record: CheckpointRecord,
): void => {
  const updatedAt = new Date().toISOString();
  const currentConstraints = readConstraints(database, record.project.id);
  const currentOpenLoops = readOpenLoops(database, record.project.id);
  const currentDecisions = readRecentDecisions(database, record.project.id);
  const currentWorkingSet = readWorkingSet(database, record.project.id);
  database.exec("BEGIN");
  try {
    writeProjectState(database, record, updatedAt);
    if (record.constraints) {
      replaceConstraints(
        database,
        record.project.id,
        mergeConstraints(currentConstraints, record.constraints),
      );
    }
    replaceOpenLoops(
      database,
      record.project.id,
      mergeOpenLoops(currentOpenLoops, record.openLoops),
    );
    replaceWorkingSet(
      database,
      record.project.id,
      mergeWorkingSet(currentWorkingSet, record.workingSet),
    );
    if (record.recentDecisions) {
      replaceRecentDecisions(
        database,
        record.project.id,
        mergeRecentDecisions(currentDecisions, record.recentDecisions),
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};

export const replaceStoredProjectCapsule = (
  database: DatabaseSync,
  capsule: ProjectCapsule,
): void => {
  const updatedAt = new Date().toISOString();
  database.exec("BEGIN");
  try {
    writeCapsuleState(database, capsule, updatedAt);
    replaceConstraints(database, capsule.project.id, capsule.constraints);
    replaceOpenLoops(database, capsule.project.id, capsule.openLoops);
    replaceRecentDecisions(database, capsule.project.id, capsule.recentDecisions);
    replaceWorkingSet(database, capsule.project.id, capsule.workingSet);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};

export const readRuntimeMetrics = (
  database: DatabaseSync,
  projectId: string,
  limit = 20,
): readonly RuntimeMetricRecord[] =>
  database
    .prepare(
      "SELECT metric_type, project_id, payload_json, created_at FROM runtime_metrics WHERE project_id = ? ORDER BY metric_id DESC LIMIT ?",
    )
    .all(projectId, limit)
    .map((row) => ({
      metricType: String(row.metric_type),
      projectId: String(row.project_id),
      payload: JSON.parse(String(row.payload_json)),
      createdAt: String(row.created_at),
    }));

export const listStoredProjects = (
  database: DatabaseSync,
): readonly StoredProjectRecord[] =>
  database
    .prepare(
      "SELECT project_id, root_path, updated_at FROM project_state ORDER BY updated_at DESC",
    )
    .all()
    .map((row) => ({
      projectId: String(row.project_id),
      rootPath: String(row.root_path),
      updatedAt: String(row.updated_at),
    }));

export const enqueuePromotionJob = (
  database: DatabaseSync,
  job: PromotionJobRecord,
): void => {
  database
    .prepare(
      "INSERT INTO promotion_queue (job_id, project_id, payload_json, status, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      job.jobId,
      job.projectId,
      JSON.stringify(job.payload),
      job.status,
      job.lastError,
      job.createdAt,
      job.updatedAt,
    );
};

export const readPromotionJobs = (
  database: DatabaseSync,
  projectId: string,
  statuses: readonly PromotionJobRecord["status"][],
): readonly PromotionJobRecord[] => {
  const placeholders = statuses.map(() => "?").join(", ");
  return database
    .prepare(
      `SELECT job_id, project_id, payload_json, status, last_error, created_at, updated_at FROM promotion_queue WHERE project_id = ? AND status IN (${placeholders}) ORDER BY created_at ASC`,
    )
    .all(projectId, ...statuses)
    .map((row) => ({
      jobId: String(row.job_id),
      projectId: String(row.project_id),
      payload: JSON.parse(String(row.payload_json)) as PromotionRecord,
      status: row.status as PromotionJobRecord["status"],
      lastError: row.last_error ? String(row.last_error) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
};

export const updatePromotionJobStatus = (
  database: DatabaseSync,
  jobId: string,
  status: PromotionJobRecord["status"],
  lastError: string | null,
): void => {
  database
    .prepare(
      "UPDATE promotion_queue SET status = ?, last_error = ?, updated_at = ? WHERE job_id = ?",
    )
    .run(status, lastError, new Date().toISOString(), jobId);
};
