import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemoryRuntime } from "../packages/memory-core/src/index.ts";
import {
  createSqliteHotMemoryClient,
  createSqliteHotMemoryProvider,
} from "../packages/hot-memory-sqlite/src/index.ts";

const createProject = () => ({
  id: "demo-project",
  rootPath: "/tmp/demo-project",
  host: "codex",
  vcsRoot: "/tmp/demo-project",
});

test("ambiguous short query expands with hot-memory anchor before cold recall", async () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-anchored-"));
  const hotClient = createSqliteHotMemoryClient({
    databasePath: join(directory, "hot-memory.db"),
  });
  const receivedQueries: string[] = [];
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    {
      searchFacts: async () => [],
      searchGists: async (_projectId, query) => {
        receivedQueries.push(query);
        return query.includes("SkillReducer")
          ? [
              {
                id: "fact-anchored",
                summary: "SkillReducer route A means paper deep read.",
                sourceUri: "projects://demo/skillreducer/route-a",
                score: 0.95,
              },
            ]
          : [];
      },
      promote: async () => {},
    },
    undefined,
    hotClient.createObserver(),
  );

  try {
    const project = createProject();
    await runtime.checkpoint({
      project,
      sessionId: "session-5",
      summary: null,
      activeTask: "SkillReducer 路线A 是论文精读版，路线B 是落地版",
      openLoops: [],
      recentDecisions: [],
      workingSet: [],
    });

    const payload = await runtime.buildBootstrap({
      project,
      mode: "warm",
      query: "先做线路A",
    });

    assert.equal(payload.diagnostics.recallQueryStrategy, "anchored");
    assert.equal(receivedQueries.length, 1);
    assert.match(receivedQueries[0] ?? "", /SkillReducer/);
    assert.equal(payload.capsule?.supportingFacts.length, 1);
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ambiguous short query is suppressed when no anchor is available", async () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-suppressed-"));
  const hotClient = createSqliteHotMemoryClient({
    databasePath: join(directory, "hot-memory.db"),
  });
  let searchCount = 0;
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    {
      searchFacts: async () => [],
      searchGists: async () => {
        searchCount += 1;
        return [];
      },
      promote: async () => {},
    },
    undefined,
    hotClient.createObserver(),
  );

  try {
    const project = createProject();
    await runtime.checkpoint({
      project,
      sessionId: "session-6",
      summary: "Automatic checkpoint from Codex wrapper",
      activeTask: null,
      openLoops: [],
      recentDecisions: [],
      workingSet: [],
    });

    const payload = await runtime.buildBootstrap({
      project,
      mode: "warm",
      query: "选A",
    });

    assert.equal(searchCount, 0);
    assert.equal(payload.diagnostics.recallQueryStrategy, "suppressed");
    assert.match(
      payload.diagnostics.degradeReasons.join(" "),
      /cold_recall_suppressed_ambiguous_query/,
    );
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("runtime-generated checkpoint summaries do not overwrite useful summaries", async () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-summary-"));
  const hotClient = createSqliteHotMemoryClient({
    databasePath: join(directory, "hot-memory.db"),
  });
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    null,
    undefined,
    hotClient.createObserver(),
  );

  try {
    const project = createProject();
    await runtime.checkpoint({
      project,
      sessionId: "session-7",
      summary: "Automatic checkpoint from Codex wrapper",
      activeTask: "Review SkillReducer routing anchors",
      openLoops: [],
      recentDecisions: [],
      workingSet: [],
    });

    const capsule = await hotClient.readProjectCapsule(project.id);
    assert.equal(capsule?.summary, "Current focus: Review SkillReducer routing anchors");
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("short-reference anchoring does not reuse stale capsule summary by itself", async () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-stale-summary-"));
  const hotClient = createSqliteHotMemoryClient({
    databasePath: join(directory, "hot-memory.db"),
  });
  let searchCount = 0;
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    {
      searchFacts: async () => [],
      searchGists: async () => {
        searchCount += 1;
        return [];
      },
      promote: async () => {},
    },
    undefined,
    hotClient.createObserver(),
  );

  try {
    const project = createProject();
    await runtime.checkpoint({
      project,
      sessionId: "session-8",
      summary: "上一轮已经把 KeepFlow 的核心背景解释完了。",
      activeTask: null,
      openLoops: [],
      recentDecisions: [],
      workingSet: [],
    });

    const payload = await runtime.buildBootstrap({
      project,
      mode: "warm",
      query: "这个",
    });

    assert.equal(searchCount, 0);
    assert.equal(payload.diagnostics.recallQueryStrategy, "suppressed");
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
