import test from "node:test";
import assert from "node:assert/strict";

import { MemoryRuntime } from "../packages/memory-core/src/index.ts";
import {
  createSqliteHotMemoryClient,
  createSqliteHotMemoryProvider,
} from "../packages/hot-memory-sqlite/src/index.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const createRuntime = () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-continuity-"));
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

test("buildContinuity prioritizes next step and pinned constraints", async () => {
  const { directory, hotClient, runtime } = createRuntime();
  try {
    await runtime.checkpoint({
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      sessionId: "continuity-session",
      summary: "Current focus: keep continuity compact",
      activeTask: "Implement continuity routing",
      nextStep: "Add hmctl continuity command",
      constraints: [
        {
          id: "constraint-1",
          summary: "Keep codex native",
          priority: "critical",
          sourceKind: "user",
          updatedAt: "2026-04-18T00:00:00.000Z",
        },
      ],
      openLoops: [
        {
          id: "loop-1",
          summary: "Validate continuity budget",
          severity: "medium",
          updatedAt: "2026-04-18T00:01:00.000Z",
        },
      ],
      recentDecisions: [
        {
          id: "decision-1",
          summary: "Use structured continuity points",
          reason: "token efficiency",
          updatedAt: "2026-04-18T00:02:00.000Z",
          sourceUri: null,
        },
      ],
      workingSet: [
        {
          kind: "file",
          label: "M",
          value: "scripts/hmctl.ts",
          updatedAt: "2026-04-18T00:03:00.000Z",
        },
      ],
    });

    const payload = await runtime.buildContinuity({
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      mode: "warm",
      budget: { targetTokens: 160, hardLimitTokens: 220 },
    });

    assert.equal(payload.continuitySummary, "Add hmctl continuity command");
    assert.doesNotMatch(payload.continuityPoints.join("\n"), /Next: Add hmctl continuity command/);
    assert.match(payload.continuityPoints.join("\n"), /Constraint: Keep codex native/);
    assert.match(payload.continuityPoints.join("\n"), /Decision: Use structured continuity points/);
    assert.match(payload.continuityPoints.join("\n"), /Loop: \[medium\] Validate continuity budget/);
    assert.ok(payload.diagnostics.estimatedTokens <= 220);
    assert.deepEqual(payload.fallbackNotes, []);
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("buildContinuity fails open when only stale summary exists", async () => {
  const { directory, hotClient, runtime } = createRuntime();
  try {
    await runtime.checkpoint({
      project: {
        id: "stale-summary-project",
        rootPath: "/tmp/stale-summary-project",
        host: "codex",
        vcsRoot: "/tmp/stale-summary-project",
      },
      sessionId: "continuity-session-stale",
      summary: "上一轮已经把文档标题怎么改解释完了。",
      activeTask: null,
      nextStep: null,
      constraints: [],
      openLoops: [],
      recentDecisions: [
        {
          id: "decision-stale-1",
          summary: "标题文案已经讨论过了",
          reason: "already_explained",
          updatedAt: "2026-04-18T00:04:00.000Z",
          sourceUri: null,
        },
      ],
      workingSet: [],
    });

    const payload = await runtime.buildContinuity({
      project: {
        id: "stale-summary-project",
        rootPath: "/tmp/stale-summary-project",
        host: "codex",
        vcsRoot: "/tmp/stale-summary-project",
      },
      mode: "warm",
      budget: { targetTokens: 160, hardLimitTokens: 220 },
    });

    assert.equal(payload.continuitySummary, null);
    assert.deepEqual(payload.continuityPoints, []);
    assert.equal(payload.diagnostics.usedFallback, true);
    assert.match(payload.fallbackNotes.join("\n"), /latest user message/);
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("buildContinuity fails open when no hot capsule exists", async () => {
  const { directory, hotClient, runtime } = createRuntime();
  try {
    const payload = await runtime.buildContinuity({
      project: {
        id: "missing-project",
        rootPath: "/tmp/missing-project",
        host: "codex",
        vcsRoot: "/tmp/missing-project",
      },
      mode: "warm",
      budget: { targetTokens: 160, hardLimitTokens: 220 },
    });

    assert.equal(payload.capsule, null);
    assert.equal(payload.continuitySummary, null);
    assert.ok(payload.fallbackNotes.length > 0);
    assert.equal(payload.diagnostics.usedFallback, true);
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
