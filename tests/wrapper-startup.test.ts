import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = dirname(dirname(TEST_FILE_PATH));

const createExecutable = (path: string, content: string): void => {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
};

const readLines = (path: string): readonly string[] =>
  existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\0")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

const buildFakeCommands = (sandboxRoot: string, commandName: string) => {
  const binRoot = join(sandboxRoot, "bin");
  const hmctlLogPath = join(sandboxRoot, "hmctl.log");
  const commandArgsPath = join(sandboxRoot, `${commandName}.args`);
  mkdirSync(binRoot, { recursive: true });

  createExecutable(
    join(binRoot, commandName),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `: > "${commandArgsPath}"`,
      "for arg in \"$@\"; do",
      `  printf '%s\\0' \"$arg\" >> "${commandArgsPath}"`,
      "done",
    ].join("\n"),
  );

  createExecutable(
    join(sandboxRoot, "fake-hmctl"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `printf '%s\\n' \"$*\" >> "${hmctlLogPath}"`,
      "if [[ \"${1:-}\" == \"bootstrap\" ]]; then",
      "  printf 'FAKE_BOOTSTRAP\\n'",
      "fi",
    ].join("\n"),
  );

  return {
    binRoot,
    commandArgsPath,
    hmctlPath: join(sandboxRoot, "fake-hmctl"),
    hmctlLogPath,
  };
};

const runWrapper = (
  scriptName: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): void => {
  execFileSync(process.execPath, [join(REPO_ROOT, "scripts", scriptName), ...args], {
    cwd: REPO_ROOT,
    env,
    stdio: "ignore",
  });
};

test("codex wrapper does not bootstrap an empty interactive launch", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-codex-wrapper-"));
  try {
    const fake = buildFakeCommands(sandboxRoot, "codex");
    runWrapper("codex-wrapper.mjs", [], {
      ...process.env,
      PATH: `${fake.binRoot}:${process.env.PATH ?? ""}`,
      MEMORY_RUNTIME_HMCTL_PATH: fake.hmctlPath,
    });

    assert.deepEqual(readLines(fake.commandArgsPath), []);
    assert.equal(
      readLines(fake.hmctlLogPath).some((line) => line.startsWith("bootstrap")),
      false,
    );
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});

test("codex wrapper injects bootstrap when an inline prompt exists", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-codex-prompt-"));
  try {
    const fake = buildFakeCommands(sandboxRoot, "codex");
    runWrapper("codex-wrapper.mjs", ["fix startup noise"], {
      ...process.env,
      PATH: `${fake.binRoot}:${process.env.PATH ?? ""}`,
      MEMORY_RUNTIME_HMCTL_PATH: fake.hmctlPath,
    });

    const args = readLines(fake.commandArgsPath);
    assert.equal(args.length, 1);
    assert.match(args[0] ?? "", /FAKE_BOOTSTRAP/);
    assert.match(args[0] ?? "", /fix startup noise/);
    assert.equal(
      readLines(fake.hmctlLogPath).some((line) => line.startsWith("bootstrap")),
      true,
    );
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});

test("gemini wrapper does not synthesize a prompt on empty launch", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-gemini-wrapper-"));
  try {
    const fake = buildFakeCommands(sandboxRoot, "gemini");
    runWrapper("gemini-wrapper.mjs", [], {
      ...process.env,
      PATH: `${fake.binRoot}:${process.env.PATH ?? ""}`,
      MEMORY_RUNTIME_HMCTL_PATH: fake.hmctlPath,
    });

    assert.deepEqual(readLines(fake.commandArgsPath), []);
    assert.equal(
      readLines(fake.hmctlLogPath).some((line) => line.startsWith("bootstrap")),
      false,
    );
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});

test("gemini wrapper injects merged prompt when a prompt exists", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-gemini-prompt-"));
  try {
    const fake = buildFakeCommands(sandboxRoot, "gemini");
    runWrapper("gemini-wrapper.mjs", ["trace the memory runtime"], {
      ...process.env,
      PATH: `${fake.binRoot}:${process.env.PATH ?? ""}`,
      MEMORY_RUNTIME_HMCTL_PATH: fake.hmctlPath,
    });

    const args = readLines(fake.commandArgsPath);
    assert.equal(args[0], "--prompt-interactive");
    assert.match(args[1] ?? "", /FAKE_BOOTSTRAP/);
    assert.match(args[1] ?? "", /trace the memory runtime/);
    assert.equal(
      readLines(fake.hmctlLogPath).some((line) => line.startsWith("bootstrap")),
      true,
    );
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});
