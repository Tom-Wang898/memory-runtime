import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createSqliteHotMemoryClient } from "../packages/hot-memory-sqlite/src/index.ts";
import { handleBridgeRequest } from "../packages/mcp-bridge/src/index.ts";
import { detectProjectIdentity } from "../scripts/config.ts";

test("bridge returns bootstrap payload", async () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-bridge-"));
  const originalEnv = process.env.MEMORY_RUNTIME_HOT_DB_PATH;
  process.env.MEMORY_RUNTIME_HOT_DB_PATH = join(directory, "hot-memory.db");
  const client = createSqliteHotMemoryClient({
    databasePath: process.env.MEMORY_RUNTIME_HOT_DB_PATH,
  });
  const project = detectProjectIdentity(directory, "bridge");

  try {
    await client.writeCheckpoint({
      project,
      sessionId: "bridge-session",
      summary: "Bridge project summary",
      activeTask: "Inspect bridge output",
      openLoops: [],
      recentDecisions: [],
      workingSet: [],
    });

    const result = (await handleBridgeRequest({
      tool: "bootstrap_project",
      cwd: directory,
      args: { mode: "fast" },
    })) as { capsule?: { summary?: string } };

    assert.equal(result.capsule?.summary, "Bridge project summary");
  } finally {
    client.close();
    if (originalEnv) {
      process.env.MEMORY_RUNTIME_HOT_DB_PATH = originalEnv;
    } else {
      delete process.env.MEMORY_RUNTIME_HOT_DB_PATH;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
