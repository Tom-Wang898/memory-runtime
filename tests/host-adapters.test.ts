import test from "node:test";
import assert from "node:assert/strict";

import { MemoryRuntime } from "../packages/memory-core/src/index.ts";
import { createSqliteHotMemoryClient, createSqliteHotMemoryProvider } from "../packages/hot-memory-sqlite/src/index.ts";
import { createCodexHostAdapter, renderCodexBootstrap } from "../packages/host-codex/src/index.ts";
import { createClaudeHostAdapter, renderClaudeBootstrap } from "../packages/host-claude/src/index.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const createRuntime = () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-host-"));
  const hotClient = createSqliteHotMemoryClient({
    databasePath: join(directory, "hot-memory.db"),
  });
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    null,
    undefined,
    hotClient.createObserver(),
  );
  return { directory, hotClient, runtime };
};

test("codex and claude adapters render bootstrap envelopes", async () => {
  const { directory, hotClient, runtime } = createRuntime();
  try {
    await runtime.checkpoint({
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      sessionId: "session-3",
      summary: "Host rendering summary",
      activeTask: "Render bootstrap",
      openLoops: [],
      recentDecisions: [],
      workingSet: [],
    });

    const request = {
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      mode: "fast" as const,
    };
    const codexPayload = await createCodexHostAdapter(runtime).bootstrap(request);
    const claudePayload = await createClaudeHostAdapter(runtime).bootstrap(request);

    assert.match(renderCodexBootstrap(codexPayload), /Memory Runtime Bootstrap/);
    assert.match(renderClaudeBootstrap(claudePayload), /<memory_runtime_bootstrap>/);
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
