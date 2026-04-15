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

    assert.match(payload.capsule?.summary ?? "", /Demo project summary/);
    assert.match(
      payload.capsule?.summary ?? "",
      /Codex wrapper bootstrap should remain additive/,
    );
    assert.equal(payload.capsule?.supportingFacts.length, 1);
    assert.equal(payload.diagnostics.coldRecallUsed, true);
    assert.equal(payload.diagnostics.recallQueryStrategy, "direct");
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("runtime bootstrap injects project primer even without query", async () => {
  const { directory, hotClient, runtime } = createRuntime();
  try {
    await runtime.checkpoint({
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      sessionId: "session-primer",
      summary: "Demo project summary",
      activeTask: "Open session",
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
      query: null,
    });

    assert.match(payload.capsule?.summary ?? "", /Demo project summary/);
    assert.match(
      payload.capsule?.summary ?? "",
      /Codex wrapper bootstrap should remain additive/,
    );
    assert.ok((payload.capsule?.supportingFacts.length ?? 0) >= 1);
    assert.equal(
      payload.capsule?.supportingFacts[0]?.summary,
      "Codex wrapper bootstrap should remain additive.",
    );
    assert.equal(payload.diagnostics.coldRecallUsed, true);
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("runtime bootstrap backfills capsule from project primer when hot capsule is missing", async () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-primer-only-"));
  const hotClient = createSqliteHotMemoryClient({
    databasePath: join(directory, "hot-memory.db"),
  });
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    {
      readProjectPrimer: async () => [
        {
          id: "primer-only",
          summary: "Digest-only primer summary",
          sourceUri: "projects://demo-project/digest/current",
          score: 1,
        },
      ],
      searchFacts: async () => [],
      searchGists: async () => [],
      promote: async () => undefined,
    },
    undefined,
    hotClient.createObserver(),
  );
  try {
    const payload = await runtime.buildBootstrap({
      project: {
        id: "demo-project-hash",
        memoryNamespace: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      mode: "warm",
      query: "open project",
    });

    assert.equal(payload.capsule?.summary, "Digest-only primer summary");
    assert.equal(payload.capsule?.supportingFacts.length, 1);
    assert.equal(payload.fallbackNotes.length, 0);
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
    assert.match(payload.capsule?.summary ?? "", /Codex wrapper bootstrap should remain additive/);
    assert.equal(
      payload.backgroundSummary,
      "Codex wrapper bootstrap should remain additive.",
    );
    assert.deepEqual(
      payload.backgroundPoints,
      ["Codex wrapper bootstrap should remain additive."],
    );
    assert.equal(payload.diagnostics.coldRecallAttempted, true);
    assert.equal(payload.diagnostics.coldRecallUsed, true);
    assert.equal(payload.diagnostics.recallQueryStrategy, "none");
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("runtime bootstrap uses memory namespace for project primer lookup", async () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-namespace-"));
  const hotClient = createSqliteHotMemoryClient({
    databasePath: join(directory, "hot-memory.db"),
  });
  const primerProjectIds: string[] = [];
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    {
      readProjectPrimer: async (projectId) => {
        primerProjectIds.push(projectId);
        return [
          {
            id: "primer-1",
            summary: "Digest primer",
            sourceUri: `projects://${projectId}/digest/current`,
            score: 1,
          },
        ];
      },
      searchFacts: async () => [],
      searchGists: async () => [],
      promote: async () => undefined,
    },
    undefined,
    hotClient.createObserver(),
  );
  try {
    await runtime.checkpoint({
      project: {
        id: "demo-project-1234",
        memoryNamespace: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      sessionId: "session-namespace",
      summary: "Namespace summary",
      activeTask: "Use memory namespace",
      openLoops: [],
      recentDecisions: [],
      workingSet: [],
    });
    await runtime.buildBootstrap({
      project: {
        id: "demo-project-1234",
        memoryNamespace: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      mode: "warm",
      query: null,
    });
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }

  assert.deepEqual(primerProjectIds, ["demo-project"]);
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
    assert.equal(capsule?.summary, "Current focus: Second pass");
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
