import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { HOT_MEMORY_SCHEMA_VERSION } from "./constants.js";

const HOT_MEMORY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS project_state (
    project_id TEXT PRIMARY KEY,
    root_path TEXT NOT NULL,
    host TEXT,
    vcs_root TEXT,
    summary TEXT NOT NULL,
    active_task TEXT,
    next_step TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pinned_constraints (
    project_id TEXT NOT NULL,
    constraint_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    priority TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, constraint_id),
    FOREIGN KEY (project_id) REFERENCES project_state(project_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS open_loops (
    project_id TEXT NOT NULL,
    loop_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    severity TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, loop_id),
    FOREIGN KEY (project_id) REFERENCES project_state(project_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS recent_decisions (
    project_id TEXT NOT NULL,
    decision_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    reason TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    source_uri TEXT,
    PRIMARY KEY (project_id, decision_id),
    FOREIGN KEY (project_id) REFERENCES project_state(project_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS working_set (
    project_id TEXT NOT NULL,
    entry_rank INTEGER NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    weight REAL,
    PRIMARY KEY (project_id, entry_rank),
    FOREIGN KEY (project_id) REFERENCES project_state(project_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS runtime_metrics (
    metric_id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type TEXT NOT NULL,
    project_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS promotion_queue (
    job_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const applyPragmas = (database: DatabaseSync): void => {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA busy_timeout = 1000");
};

const applySchema = (database: DatabaseSync): void => {
  database.exec(HOT_MEMORY_SCHEMA_SQL);
};

const readUserVersion = (database: DatabaseSync): number => {
  const row = database.prepare("PRAGMA user_version").get() as
    | { readonly user_version?: number }
    | undefined;
  return Number(row?.user_version ?? 0);
};

const tableHasColumn = (
  database: DatabaseSync,
  tableName: string,
  columnName: string,
): boolean =>
  database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((row) => String(row.name) === columnName);

const migrateToSchemaVersion2 = (database: DatabaseSync): void => {
  if (!tableHasColumn(database, "project_state", "next_step")) {
    database.exec("ALTER TABLE project_state ADD COLUMN next_step TEXT");
  }
};

const migrateSchema = (database: DatabaseSync, currentVersion: number): void => {
  if (currentVersion < 2) {
    migrateToSchemaVersion2(database);
  }
};

export const createSqliteDatabase = (databasePath: string): DatabaseSync => {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  applyPragmas(database);
  const currentVersion = readUserVersion(database);
  applySchema(database);
  migrateSchema(database, currentVersion);
  database.exec(`PRAGMA user_version = ${HOT_MEMORY_SCHEMA_VERSION}`);
  return database;
};
