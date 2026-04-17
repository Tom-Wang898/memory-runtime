import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decideContextRoute } from "../packages/memory-core/src/index.ts";

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = dirname(dirname(TEST_FILE_PATH));

const runHmctl = (
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): unknown =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        "--experimental-strip-types",
        "--import",
        "./scripts/register-ts-loader.mjs",
        "./scripts/hmctl.ts",
        ...args,
      ],
      {
        cwd: REPO_ROOT,
        env,
        encoding: "utf8",
      },
    ),
  );

test("decideContextRoute chooses primer for missing query", () => {
  assert.deepEqual(decideContextRoute(null), {
    route: "primer",
    reason: "no_query",
    normalizedQuery: null,
  });
});

test("decideContextRoute chooses continuity for continuation-style query", () => {
  assert.deepEqual(decideContextRoute("继续"), {
    route: "continuity",
    reason: "continuation_query",
    normalizedQuery: "继续",
  });
});

test("decideContextRoute chooses bootstrap for deep-history query", () => {
  assert.deepEqual(decideContextRoute("先说你知道的项目背景"), {
    route: "bootstrap",
    reason: "deep_history_query",
    normalizedQuery: "先说你知道的项目背景",
  });
});

test("decideContextRoute chooses bootstrap for explicit topic-shift query", () => {
  assert.deepEqual(
    decideContextRoute("先回到文档书写那里，文档的标题可能需要修改"),
    {
      route: "bootstrap",
      reason: "topic_shift_query",
      normalizedQuery: "先回到文档书写那里，文档的标题可能需要修改",
    },
  );
});

test("hmctl context auto-routes between primer, continuity, and bootstrap", () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-context-route-"));
  const projectRoot = join(sandboxRoot, "project");
  const hotDbPath = join(sandboxRoot, "hot-memory.db");
  const continuityDir = join(sandboxRoot, "continuity");
  const env = {
    ...process.env,
    MEMORY_RUNTIME_HOT_DB_PATH: hotDbPath,
    MEMORY_RUNTIME_CONTINUITY_DIR: continuityDir,
    MEMORY_RUNTIME_COLD_PROVIDER: "none",
  };

  try {
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(
      join(projectRoot, ".memory-palace-project.json"),
      JSON.stringify({ project_slug: "context-route-demo", project_name: "Context Route Demo" }),
    );

    runHmctl(
      [
        "checkpoint",
        "--cwd",
        projectRoot,
        "--summary",
        "Route summary",
        "--active-task",
        "Build routed context",
        "--next-step",
        "Use continuity route",
        "--constraint",
        "Keep codex native::critical::user",
        "--decision",
        "Route continuation queries to continuity::token",
        "--open-loop",
        "Verify context route output::medium",
        "--json",
      ],
      env,
    );

    const primerResult = runHmctl(
      ["context", "--cwd", projectRoot, "--json"],
      env,
    ) as { ok: boolean; source: string; path: string };
    assert.equal(primerResult.ok, true);
    assert.equal(primerResult.source, "fresh");
    assert.match(primerResult.path, /primers/);

    const continuityResult = runHmctl(
      ["context", "--cwd", projectRoot, "--query", "继续", "--json"],
      env,
    ) as { ok: boolean; payload: { continuitySummary: string } };
    assert.equal(continuityResult.ok, true);
    assert.equal(continuityResult.payload.continuitySummary, "Use continuity route");

    const bootstrapResult = runHmctl(
      ["context", "--cwd", projectRoot, "--query", "先说你知道的项目背景", "--json"],
      env,
    ) as { project: { id: string }; diagnostics: { modeApplied: string } };
    assert.match(bootstrapResult.project.id, /^project-/);
    assert.equal(bootstrapResult.diagnostics.modeApplied, "warm");

    const topicShiftBootstrap = runHmctl(
      [
        "context",
        "--cwd",
        projectRoot,
        "--query",
        "先回到文档书写那里，文档的标题可能需要修改",
        "--json",
      ],
      env,
    ) as { project: { id: string }; diagnostics: { modeApplied: string } };
    assert.match(topicShiftBootstrap.project.id, /^project-/);
    assert.equal(topicShiftBootstrap.diagnostics.modeApplied, "warm");
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});
