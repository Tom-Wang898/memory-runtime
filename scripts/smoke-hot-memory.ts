import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createSqliteHotMemoryClient } from "../packages/hot-memory-sqlite/src/index.ts";
import type {
  CheckpointRecord,
  ProjectCapsule,
} from "../packages/memory-core/src/index.ts";

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const createCheckpointRecord = (): CheckpointRecord => ({
  project: {
    id: "demo-project",
    rootPath: "/tmp/demo-project",
    host: "codex",
    vcsRoot: "/tmp/demo-project",
  },
  sessionId: "session-1",
  summary: "CLI memory runtime smoke test project",
  activeTask: "Implement SQLite-backed hot memory",
  openLoops: [
    {
      id: "loop-1",
      summary: "Hook cold adapter in phase 3",
      severity: "medium",
      updatedAt: "2026-04-12T00:10:00.000Z",
    },
  ],
  recentDecisions: [
    {
      id: "decision-1",
      summary: "Use node:sqlite before third-party drivers",
      reason: "Keep the first milestone dependency-light",
      updatedAt: "2026-04-12T00:09:00.000Z",
      sourceUri: null,
    },
  ],
  workingSet: [
    {
      kind: "file",
      label: "hot client",
      value: "packages/hot-memory-sqlite/src/client.ts",
      updatedAt: "2026-04-12T00:08:00.000Z",
    },
  ],
});

const assertCapsule = (capsule: ProjectCapsule | null): void => {
  assert(capsule, "capsule should exist after checkpoint");
  assert(
    capsule?.summary === "CLI memory runtime smoke test project",
    "capsule summary should match checkpoint summary",
  );
  assert(
    capsule?.recentDecisions[0]?.summary ===
      "Use node:sqlite before third-party drivers",
    "recent decision should be persisted",
  );
  assert(
    capsule?.workingSet[0]?.value ===
      "packages/hot-memory-sqlite/src/client.ts",
    "working set should be persisted",
  );
};

const createClient = () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-"));
  const client = createSqliteHotMemoryClient({
    databasePath: join(directory, "hot-memory.db"),
  });
  return { client, directory };
};

const run = async (): Promise<void> => {
  const { client, directory } = createClient();
  try {
    await client.writeCheckpoint(createCheckpointRecord());
    assertCapsule(await client.readProjectCapsule("demo-project"));
    console.log("Hot memory smoke test passed.");
  } finally {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
