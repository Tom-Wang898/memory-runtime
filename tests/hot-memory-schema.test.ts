import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createSqliteHotMemoryClient } from "../packages/hot-memory-sqlite/src/index.ts";

const LEGACY_SCHEMA_SQL = `
  CREATE TABLE project_state (
    project_id TEXT PRIMARY KEY,
    root_path TEXT NOT NULL,
    host TEXT,
    vcs_root TEXT,
    summary TEXT NOT NULL,
    active_task TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE open_loops (
    project_id TEXT NOT NULL,
    loop_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    severity TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, loop_id)
  );

  CREATE TABLE recent_decisions (
    project_id TEXT NOT NULL,
    decision_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    reason TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    source_uri TEXT,
    PRIMARY KEY (project_id, decision_id)
  );

  CREATE TABLE working_set (
    project_id TEXT NOT NULL,
    entry_rank INTEGER NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    weight REAL,
    PRIMARY KEY (project_id, entry_rank)
  );

  CREATE TABLE runtime_metrics (
    metric_id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type TEXT NOT NULL,
    project_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE promotion_queue (
    job_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

test("sqlite hot memory migrates v1 schema and persists constraints plus next step", async () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-hot-schema-"));
  const databasePath = join(directory, "hot-memory.db");
  const legacyDatabase = new DatabaseSync(databasePath);

  try {
    legacyDatabase.exec(LEGACY_SCHEMA_SQL);
    legacyDatabase.exec("PRAGMA user_version = 1");
    legacyDatabase
      .prepare(
        "INSERT INTO project_state (project_id, root_path, host, vcs_root, summary, active_task, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "demo-project",
        "/tmp/demo-project",
        "codex",
        "/tmp/demo-project",
        "Legacy summary",
        "Legacy task",
        "2026-04-17T00:00:00.000Z",
      );
  } finally {
    legacyDatabase.close();
  }

  const hotClient = createSqliteHotMemoryClient({ databasePath });

  try {
    const migratedBeforeWrite = await hotClient.readProjectCapsule("demo-project");
    assert.equal(migratedBeforeWrite?.summary, "Legacy summary");
    assert.equal(migratedBeforeWrite?.nextStep, null);
    assert.deepEqual(migratedBeforeWrite?.constraints, []);

    await hotClient.writeCheckpoint({
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      sessionId: "session-migration",
      summary: "Migrated summary",
      activeTask: "Upgrade schema",
      nextStep: "Persist pinned constraints",
      constraints: [
        {
          id: "constraint-1",
          summary: "Keep codex native",
          priority: "critical",
          sourceKind: "user",
          updatedAt: "2026-04-17T00:01:00.000Z",
        },
      ],
      openLoops: [],
      recentDecisions: [],
      workingSet: [],
    });

    const migratedAfterWrite = await hotClient.readProjectCapsule("demo-project");
    assert.equal(migratedAfterWrite?.summary, "Migrated summary");
    assert.equal(migratedAfterWrite?.nextStep, "Persist pinned constraints");
    assert.deepEqual(
      migratedAfterWrite?.constraints.map((item) => item.summary),
      ["Keep codex native"],
    );

    hotClient.close();

    const reopened = new DatabaseSync(databasePath);
    try {
      const userVersionRow = reopened.prepare("PRAGMA user_version").get() as {
        readonly user_version: number;
      };
      assert.equal(userVersionRow.user_version, 2);

      const columns = reopened
        .prepare("PRAGMA table_info(project_state)")
        .all()
        .map((row) => String(row.name));
      assert.ok(columns.includes("next_step"));

      const constraintCountRow = reopened
        .prepare("SELECT COUNT(*) AS count FROM pinned_constraints WHERE project_id = ?")
        .get("demo-project") as { readonly count: number };
      assert.equal(constraintCountRow.count, 1);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
