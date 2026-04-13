import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  exportPublicProfile,
  getPublicExportProfile,
  listPublicExportProfiles,
} from "../scripts/public-export.ts";

const createProfileSource = (
  sourceRoot: string,
  profileName: string,
  overrides: Record<string, string> = {},
): void => {
  const profile = getPublicExportProfile(profileName);
  for (const relativePath of profile.files) {
    const filePath = join(sourceRoot, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(
      filePath,
      overrides[relativePath] ?? `safe content for ${relativePath}\n`,
    );
  }
};

test("listPublicExportProfiles returns supported export profiles", async () => {
  const profiles = listPublicExportProfiles();
  assert.deepEqual(
    profiles.map((profile) => profile.name),
    ["codex-project-memory", "memory-palace-project-tools"],
  );
});

test("exportPublicProfile copies allowlisted files and redacts private paths", async () => {
  const sandboxRoot = join(tmpdir(), `memory-runtime-public-export-${Date.now()}`);
  const sourceRoot = join(sandboxRoot, "codex");
  const outputRoot = join(sandboxRoot, "export");
  const homeDirectory = "/Users/alice";
  try {
    createProfileSource(sourceRoot, "codex-project-memory", {
      "docs/memory-palace-usage.md": [
        "Use /Users/alice/Documents/codex for the rules repo.",
        "Codex settings live in /Users/alice/.codex.",
        "Cold memory root is /Users/alice/Documents/Memory-Palace.",
      ].join("\n"),
    });

    const report = exportPublicProfile({
      profileName: "codex-project-memory",
      sourceRoot,
      outputRoot,
      homeDirectory,
    });

    const exportedDocPath = join(outputRoot, "docs", "memory-palace-usage.md");
    assert.equal(report.exportedFiles.length, 8);
    assert.ok(existsSync(exportedDocPath));
    const exportedContent = readFileSync(exportedDocPath, "utf8");
    assert.match(exportedContent, /\$\{CODEX_REPO_ROOT\}/);
    assert.match(exportedContent, /\$\{HOME\}\/\.codex/);
    assert.match(exportedContent, /\$\{MEMORY_PALACE_ROOT\}/);
    assert.doesNotMatch(exportedContent, /\/Users\/alice/);
    assert.ok(report.manifestPath);
    const manifestContent = readFileSync(report.manifestPath ?? "", "utf8");
    assert.doesNotMatch(manifestContent, /\/Users\/alice/);
    assert.match(manifestContent, /PUBLIC_EXPORT_MANIFEST|placeholderRoot|CODEX_REPO_ROOT/);
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});

test("exportPublicProfile rejects unresolved private absolute paths", async () => {
  const sandboxRoot = join(tmpdir(), `memory-runtime-public-export-fail-${Date.now()}`);
  const sourceRoot = join(sandboxRoot, "codex");
  const outputRoot = join(sandboxRoot, "export");
  try {
    createProfileSource(sourceRoot, "codex-project-memory", {
      "scripts/project_memory_context.py":
        "BROKEN_PATH = '/Users/bob/private/checkpoint.db'\n",
    });

    assert.throws(
      () =>
        exportPublicProfile({
          profileName: "codex-project-memory",
          sourceRoot,
          outputRoot,
          homeDirectory: "/Users/alice",
        }),
      /private absolute path marker/i,
    );
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});
