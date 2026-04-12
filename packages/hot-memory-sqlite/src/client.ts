import type { DatabaseSync } from "node:sqlite";

import type {
  CapsuleRequest,
  CheckpointRecord,
  HotMemoryProvider,
  MemoryRuntimeObserver,
  PromotionJobRecord,
  PromotionRecord,
  ProjectCapsule,
  RuntimeMetricRecord,
} from "@memory-runtime/memory-core";

import { createSqliteRuntimeObserver } from "./observer.js";
import {
  buildStoredProjectCapsule,
  enqueuePromotionJob,
  readPromotionJobs,
  readRuntimeMetrics,
  readStoredProjectCapsule,
  updatePromotionJobStatus,
  writeCheckpointRecord,
} from "./repository.js";
import { createSqliteDatabase } from "./schema.js";

export interface SqliteHotMemoryClient {
  close(): void;
  readProjectCapsule(projectId: string): Promise<ProjectCapsule | null>;
  writeCheckpoint(record: CheckpointRecord): Promise<void>;
  buildProjectCapsule(input: CapsuleRequest): Promise<ProjectCapsule | null>;
  createObserver(): MemoryRuntimeObserver;
  readRuntimeMetrics(projectId: string, limit?: number): Promise<readonly RuntimeMetricRecord[]>;
  enqueuePromotion(record: PromotionRecord): Promise<PromotionJobRecord>;
  readPendingPromotions(projectId: string): Promise<readonly PromotionJobRecord[]>;
  markPromotionRunning(jobId: string): Promise<void>;
  markPromotionDone(jobId: string): Promise<void>;
  markPromotionFailed(jobId: string, error: string): Promise<void>;
}

export interface SqliteHotMemoryProviderConfig {
  readonly databasePath: string;
}

const createClientMethods = (database: DatabaseSync): SqliteHotMemoryClient => ({
  close: () => database.close(),
  readProjectCapsule: async (projectId) =>
    readStoredProjectCapsule(database, projectId),
  writeCheckpoint: async (record) => writeCheckpointRecord(database, record),
  buildProjectCapsule: async (input) => buildStoredProjectCapsule(database, input),
  createObserver: () => createSqliteRuntimeObserver(database),
  readRuntimeMetrics: async (projectId, limit) =>
    readRuntimeMetrics(database, projectId, limit),
  enqueuePromotion: async (record) => {
    const job: PromotionJobRecord = {
      jobId: crypto.randomUUID(),
      projectId: record.projectId,
      payload: record,
      status: "pending",
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    enqueuePromotionJob(database, job);
    return job;
  },
  readPendingPromotions: async (projectId) =>
    readPromotionJobs(database, projectId, ["pending", "failed"]),
  markPromotionRunning: async (jobId) =>
    updatePromotionJobStatus(database, jobId, "running", null),
  markPromotionDone: async (jobId) =>
    updatePromotionJobStatus(database, jobId, "done", null),
  markPromotionFailed: async (jobId, error) =>
    updatePromotionJobStatus(database, jobId, "failed", error),
});

export const createSqliteHotMemoryClient = (
  config: SqliteHotMemoryProviderConfig,
): SqliteHotMemoryClient => createClientMethods(createSqliteDatabase(config.databasePath));

export const createSqliteHotMemoryProvider = (
  client: SqliteHotMemoryClient,
): HotMemoryProvider => ({
  getProjectCapsule: (projectId) => client.readProjectCapsule(projectId),
  buildCapsule: (input) => client.buildProjectCapsule(input),
  checkpoint: (record) => client.writeCheckpoint(record),
});

export const createSqliteHotMemoryProviderFromConfig = (
  config: SqliteHotMemoryProviderConfig,
): HotMemoryProvider =>
  createSqliteHotMemoryProvider(createSqliteHotMemoryClient(config));
