import type { DatabaseSync } from "node:sqlite";

import type { MemoryRuntimeObserver, RuntimeMetricRecord } from "@memory-runtime/memory-core";

const insertMetric = (database: DatabaseSync, record: RuntimeMetricRecord): void => {
  database
    .prepare(
      "INSERT INTO runtime_metrics (metric_type, project_id, payload_json, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(
      record.metricType,
      record.projectId,
      JSON.stringify(record.payload),
      record.createdAt,
    );
};

export const createSqliteRuntimeObserver = (
  database: DatabaseSync,
): MemoryRuntimeObserver => ({
  recordMetric: async (record) => {
    insertMetric(database, record);
  },
});
