import assert from "node:assert/strict";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = dirname(dirname(TEST_FILE_PATH));
const HOME_DIRECTORY = homedir();

const runHmctl = (args: readonly string[]): string =>
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
      encoding: "utf8",
    },
  );

const createCodexProfileSource = (sourceRoot: string): void => {
  const files = [
    "scripts/project_identity.py",
    "scripts/project_memory_bootstrap.py",
    "scripts/project_memory_context.py",
    "scripts/project_memory_optimize.py",
    "scripts/record_project_memory.py",
    "docs/project-memory-prompts.md",
    "docs/memory-palace-usage.md",
    "integrations/claude-rules-fused/local-rules/base/codex-workflow.md",
  ];
  for (const relativePath of files) {
    const filePath = join(sourceRoot, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `content for ${relativePath}\n`);
  }
  writeFileSync(
    join(sourceRoot, "docs", "memory-palace-usage.md"),
    `Paths: ${HOME_DIRECTORY}/Documents/codex and ${HOME_DIRECTORY}/.codex\n`,
  );
};

test("hmctl public-export lists built-in profiles", async () => {
  const output = runHmctl(["public-export", "--list-profiles"]);
  const parsed = JSON.parse(output) as Array<{ name: string }>;
  assert.deepEqual(
    parsed.map((item) => item.name),
    ["codex-project-memory", "memory-palace-project-tools"],
  );
});

test("hmctl public-export writes sanitized staging output", async () => {
  const sandboxRoot = join(tmpdir(), `memory-runtime-hmctl-export-${Date.now()}`);
  const sourceRoot = join(sandboxRoot, "codex");
  const outputRoot = join(sandboxRoot, "export");
  try {
    createCodexProfileSource(sourceRoot);
    const output = runHmctl([
      "public-export",
      "--profile",
      "codex-project-memory",
      "--source",
      sourceRoot,
      "--output",
      outputRoot,
    ]);
    const report = JSON.parse(output) as { manifestPath: string };
    const exportedDoc = readFileSync(
      join(outputRoot, "docs", "memory-palace-usage.md"),
      "utf8",
    );
    assert.match(exportedDoc, /\$\{CODEX_REPO_ROOT\}/);
    assert.match(exportedDoc, /\$\{HOME\}\/\.codex/);
    assert.doesNotMatch(exportedDoc, new RegExp(HOME_DIRECTORY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const manifestContent = readFileSync(report.manifestPath, "utf8");
    assert.match(manifestContent, /codex-project-memory/);
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});
