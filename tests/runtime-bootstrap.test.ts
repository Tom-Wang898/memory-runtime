import test from "node:test";
import assert from "node:assert/strict";

import { createFixtureColdProvider } from "../packages/cold-memory-fixture/src/index.ts";
import { MemoryRuntime } from "../packages/memory-core/src/index.ts";
import { createSqliteHotMemoryClient, createSqliteHotMemoryProvider } from "../packages/hot-memory-sqlite/src/index.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const createRuntime = () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-test-"));
  const hotClient = createSqliteHotMemoryClient({
    databasePath: join(directory, "hot-memory.db"),
  });
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    createFixtureColdProvider({
      facts: [
        {
          id: "fact-1",
          summary: "Codex wrapper bootstrap should remain additive.",
          sourceUri: "notes://projects/demo/promotions/wrapper",
          score: 0.9,
        },
      ],
    }),
    undefined,
    hotClient.createObserver(),
  );
  return { directory, hotClient, runtime };
};

test("runtime bootstrap merges hot capsule with fixture cold facts", async () => {
  const { directory, hotClient, runtime } = createRuntime();
  try {
    await runtime.checkpoint({
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      sessionId: "session-1",
      summary: "Demo project summary",
      activeTask: "Implement wrapper",
      openLoops: [],
      recentDecisions: [],
      workingSet: [],
    });

    const payload = await runtime.buildBootstrap({
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      mode: "warm",
      query: "wrapper",
    });

    assert.equal(payload.capsule?.summary, "Demo project summary");
    assert.equal(payload.capsule?.supportingFacts.length, 1);
    assert.equal(payload.diagnostics.coldRecallUsed, true);
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("high-risk bootstrap suppresses cold recall", async () => {
  const { directory, hotClient, runtime } = createRuntime();
  try {
    await runtime.checkpoint({
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      sessionId: "session-2",
      summary: "High risk summary",
      activeTask: "Guard migrations",
      openLoops: [],
      recentDecisions: [],
      workingSet: [],
    });

    const payload = await runtime.buildBootstrap({
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      mode: "warm",
      query: "Do not break the database migration",
    });

    assert.equal(payload.capsule?.supportingFacts.length, 0);
    assert.equal(payload.diagnostics.coldRecallAttempted, false);
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("checkpoint merge keeps recent loops and decisions instead of wiping state", async () => {
  const { directory, hotClient, runtime } = createRuntime();
  try {
    const project = {
      id: "demo-project",
      rootPath: "/tmp/demo-project",
      host: "codex",
      vcsRoot: "/tmp/demo-project",
    };
    await runtime.checkpoint({
      project,
      sessionId: "session-4",
      summary: "Merge summary",
      activeTask: "First pass",
      openLoops: [
        {
          id: "loop-1",
          summary: "Keep wrapper additive",
          severity: "high",
          updatedAt: "2026-04-12T01:00:00.000Z",
        },
      ],
      recentDecisions: [
        {
          id: "decision-1",
          summary: "Use hot sqlite first",
          reason: "stability",
          updatedAt: "2026-04-12T01:00:00.000Z",
          sourceUri: null,
        },
      ],
      workingSet: [],
    });
    await runtime.checkpoint({
      project,
      sessionId: "session-4",
      summary: null,
      activeTask: "Second pass",
      openLoops: [],
      recentDecisions: [],
      workingSet: [],
    });

    const capsule = await hotClient.readProjectCapsule(project.id);
    assert.equal(capsule?.openLoops.length, 1);
    assert.equal(capsule?.recentDecisions.length, 1);
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("hot client queues promotion jobs", async () => {
  const { directory, hotClient } = createRuntime();
  try {
    const job = await hotClient.enqueuePromotion({
      projectId: "demo-project",
      title: "Queued promotion",
      summary: "Queue this promotion",
      facts: ["Fact A"],
      sourceSessionId: null,
    });
    const jobs = await hotClient.readPendingPromotions("demo-project");
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.jobId, job.jobId);
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
