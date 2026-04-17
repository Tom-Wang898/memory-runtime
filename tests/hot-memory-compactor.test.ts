import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProjectCapsule } from "../packages/memory-core/src/index.ts";
import {
  createSqliteHotMemoryClient,
} from "../packages/hot-memory-sqlite/src/index.ts";
import { createRuntimeServices } from "../scripts/config.ts";
import {
  buildStablePromotionRecord,
  compactAllHotProjects,
  compactHotProject,
  compactProjectCapsule,
} from "../scripts/hot-memory-compactor.ts";

const createCapsule = (
  project: ProjectCapsule["project"] = {
    id: "demo-project",
    rootPath: "/tmp/demo-project",
    host: "codex",
    vcsRoot: "/tmp/demo-project",
    memoryNamespace: "demo-project",
  },
): ProjectCapsule => ({
  project,
  summary: "Automatic checkpoint from wrapper",
  activeTask: "Clean stale memory",
  constraints: [
    {
      id: "constraint-1",
      summary: "Keep codex native",
      priority: "critical",
      sourceKind: "user",
      updatedAt: "2026-04-18T00:00:00.000Z",
    },
    {
      id: "constraint-2",
      summary: "Keep codex native",
      priority: "critical",
      sourceKind: "user",
      updatedAt: "2026-04-18T01:00:00.000Z",
    },
  ],
  nextStep: "",
  openLoops: [
    {
      id: "loop-old",
      summary: "Drop stale loop",
      severity: "medium",
      updatedAt: "2026-03-01T00:00:00.000Z",
    },
    {
      id: "loop-new",
      summary: "Keep fresh loop",
      severity: "high",
      updatedAt: "2026-04-18T01:00:00.000Z",
    },
  ],
  recentDecisions: [
    {
      id: "decision-old",
      summary: "Use compact continuity",
      reason: "token efficiency",
      updatedAt: "2026-04-18T00:00:00.000Z",
      sourceUri: null,
    },
    {
      id: "decision-new",
      summary: "Use compact continuity",
      reason: "token efficiency",
      updatedAt: "2026-04-18T02:00:00.000Z",
      sourceUri: null,
    },
  ],
  workingSet: [
    {
      kind: "file",
      label: "M",
      value: "old-file.ts",
      updatedAt: "2026-03-01T00:00:00.000Z",
    },
    {
      kind: "file",
      label: "M",
      value: "fresh-file.ts",
      updatedAt: "2026-04-18T02:30:00.000Z",
      weight: 2,
    },
  ],
  supportingFacts: [],
  budget: { targetTokens: 900, hardLimitTokens: 1400 },
  source: "hot",
  generatedAt: "2026-04-18T02:30:00.000Z",
});

test("compactProjectCapsule removes stale items and backfills next step", () => {
  const compacted = compactProjectCapsule(
    createCapsule(),
    {
      maxOpenLoopAgeDays: 21,
      maxWorkingSetAgeDays: 7,
      maxDecisionAgeDays: 30,
    },
    Date.parse("2026-04-18T03:00:00.000Z"),
  );

  assert.equal(compacted.constraints.length, 1);
  assert.equal(compacted.constraints[0]?.summary, "Keep codex native");
  assert.equal(compacted.openLoops.length, 1);
  assert.equal(compacted.openLoops[0]?.summary, "Keep fresh loop");
  assert.equal(compacted.recentDecisions.length, 1);
  assert.equal(compacted.recentDecisions[0]?.id, "decision-new");
  assert.equal(compacted.workingSet.length, 1);
  assert.equal(compacted.workingSet[0]?.value, "fresh-file.ts");
  assert.equal(compacted.nextStep, "Keep fresh loop");
  assert.equal(compacted.summary, "Next step: Keep fresh loop");
});

test("buildStablePromotionRecord requires enough stable facts", () => {
  const record = buildStablePromotionRecord(
    compactProjectCapsule(
      createCapsule(),
      {
        maxOpenLoopAgeDays: 21,
        maxWorkingSetAgeDays: 7,
        maxDecisionAgeDays: 30,
      },
      Date.parse("2026-04-18T03:00:00.000Z"),
    ),
  );

  assert.equal(record?.projectId, "demo-project");
  assert.match(record?.summary ?? "", /Next step:/);
  assert.ok((record?.facts.length ?? 0) >= 2);
});

test("compactHotProject rewrites hot state and continuity cache", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-compactor-"));
  const projectDir = join(sandboxRoot, "project");
  const hotDbPath = join(sandboxRoot, "hot-memory.db");
  const continuityDir = join(sandboxRoot, "continuity");
  const previousEnv = {
    MEMORY_RUNTIME_HOT_DB_PATH: process.env.MEMORY_RUNTIME_HOT_DB_PATH,
    MEMORY_RUNTIME_CONTINUITY_DIR: process.env.MEMORY_RUNTIME_CONTINUITY_DIR,
    MEMORY_RUNTIME_COLD_PROVIDER: process.env.MEMORY_RUNTIME_COLD_PROVIDER,
  };

  try {
    process.env.MEMORY_RUNTIME_HOT_DB_PATH = hotDbPath;
    process.env.MEMORY_RUNTIME_CONTINUITY_DIR = continuityDir;
    process.env.MEMORY_RUNTIME_COLD_PROVIDER = "none";

    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".memory-palace-project.json"),
      JSON.stringify({ project_slug: "compactor-demo", project_name: "Compactor Demo" }),
    );

    const runtimeServices = createRuntimeServices(projectDir, "codex");
    const project = runtimeServices.project;
    runtimeServices.hotClient.close();

    const hotClient = createSqliteHotMemoryClient({ databasePath: hotDbPath });
    try {
      await hotClient.replaceProjectCapsule(
        createCapsule({
          ...project,
          rootPath: projectDir,
          vcsRoot: null,
        }),
      );
    } finally {
      hotClient.close();
    }

    const result = await compactHotProject({
      cwd: projectDir,
      host: "codex",
      maxOpenLoopAgeDays: 21,
      maxWorkingSetAgeDays: 7,
      maxDecisionAgeDays: 30,
    });

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.ok(result.continuityPath);

    const updatedClient = createSqliteHotMemoryClient({ databasePath: hotDbPath });
    try {
      const compacted = await updatedClient.readProjectCapsule(project.id);
      assert.ok(compacted);
      assert.equal(compacted?.nextStep, "Keep fresh loop");
      assert.equal(compacted?.constraints.length, 1);
      assert.equal(compacted?.workingSet.length, 1);
    } finally {
      updatedClient.close();
    }

    const continuityContent = readFileSync(result.continuityPath!, "utf8");
    assert.match(continuityContent, /summary: Keep fresh loop/);
    assert.match(continuityContent, /Constraint: Keep codex native/);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});

test("compactAllHotProjects scans stored hot projects under a root", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-compactor-all-"));
  const projectDir = join(sandboxRoot, "project");
  const hotDbPath = join(sandboxRoot, "hot-memory.db");
  const previousEnv = {
    MEMORY_RUNTIME_HOT_DB_PATH: process.env.MEMORY_RUNTIME_HOT_DB_PATH,
    MEMORY_RUNTIME_COLD_PROVIDER: process.env.MEMORY_RUNTIME_COLD_PROVIDER,
  };

  try {
    process.env.MEMORY_RUNTIME_HOT_DB_PATH = hotDbPath;
    process.env.MEMORY_RUNTIME_COLD_PROVIDER = "none";
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".memory-palace-project.json"),
      JSON.stringify({ project_slug: "compactor-all-demo", project_name: "Compactor All Demo" }),
    );

    const runtimeServices = createRuntimeServices(projectDir, "codex");
    const project = runtimeServices.project;
    runtimeServices.hotClient.close();

    const hotClient = createSqliteHotMemoryClient({ databasePath: hotDbPath });
    try {
      await hotClient.replaceProjectCapsule(
        createCapsule({
          ...project,
          rootPath: projectDir,
          vcsRoot: null,
        }),
      );
    } finally {
      hotClient.close();
    }

    const result = await compactAllHotProjects({
      host: "codex",
      root: sandboxRoot,
      dryRun: true,
    });

    assert.equal(result.ok, true);
    assert.equal(result.scanned, 1);
    assert.equal(result.matched, 1);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0]?.projectId, project.id);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});
