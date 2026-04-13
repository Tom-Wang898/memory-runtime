import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HMCTL_PATH = join(PROJECT_ROOT, "bin", "hmctl");
const KNOWN_SUBCOMMANDS = new Set(["mcp", "extensions", "extension", "skills", "skill", "hooks", "hook"]);
const PASSTHROUGH_FLAGS = new Set(["-h", "--help", "-v", "--version", "-l", "--list-extensions", "--list-sessions"]);
const OPTIONS_WITH_VALUES = new Set([
  "-m",
  "--model",
  "-p",
  "--prompt",
  "-i",
  "--prompt-interactive",
  "--approval-mode",
  "--policy",
  "-e",
  "--extensions",
  "-r",
  "--resume",
  "--delete-session",
  "--include-directories",
  "-o",
  "--output-format",
]);

const findFirstPositional = (args) => {
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current.startsWith("-")) {
      return { index, value: current };
    }
    if (OPTIONS_WITH_VALUES.has(current)) {
      index += 1;
    }
  }
  return { index: -1, value: null };
};

const readBootstrap = (cwd, query) =>
  execFileSync(
    HMCTL_PATH,
    ["bootstrap", "--cwd", cwd, "--host", "gemini", "--mode", "warm", ...(query ? ["--query", query] : [])],
    { encoding: "utf8" },
  ).trim();

const buildPrompt = (bootstrap, originalPrompt) =>
  [bootstrap.trim(), originalPrompt?.trim()].filter(Boolean).join("\n\n");

const replaceOptionValue = (args, keys, nextValue) => {
  const clone = [...args];
  for (let index = 0; index < clone.length; index += 1) {
    if (!keys.has(clone[index])) {
      continue;
    }
    if (index + 1 < clone.length) {
      clone[index + 1] = nextValue;
      return clone;
    }
  }
  return null;
};

const runCheckpoint = (cwd, activeTask) => {
  spawnSync(
    HMCTL_PATH,
    [
      "checkpoint",
      "--cwd",
      cwd,
      ...(activeTask ? ["--active-task", activeTask] : []),
    ],
    { stdio: "ignore" },
  );
};

const main = () => {
  if (process.env.MEMORY_RUNTIME_DISABLE === "1") {
    const passthrough = spawnSync("gemini", process.argv.slice(2), { stdio: "inherit" });
    process.exit(passthrough.status ?? 0);
  }

  const args = process.argv.slice(2);
  if (args.some((value) => PASSTHROUGH_FLAGS.has(value))) {
    const passthrough = spawnSync("gemini", args, { stdio: "inherit" });
    process.exit(passthrough.status ?? 0);
  }

  const firstPositional = findFirstPositional(args);
  if (firstPositional.value && KNOWN_SUBCOMMANDS.has(firstPositional.value)) {
    const passthrough = spawnSync("gemini", args, { stdio: "inherit" });
    process.exit(passthrough.status ?? 0);
  }

  const cwd = process.cwd();
  const promptKeys = new Set(["-p", "--prompt", "-i", "--prompt-interactive"]);
  const explicitPromptArgs = replaceOptionValue(args, promptKeys, "__MEMORY_RUNTIME_PLACEHOLDER__");
  const originalPrompt =
    explicitPromptArgs !== null
      ? args[args.findIndex((value) => promptKeys.has(value)) + 1]
      : firstPositional.value;
  const bootstrap = readBootstrap(cwd, originalPrompt);
  const mergedPrompt = buildPrompt(bootstrap, originalPrompt);

  let finalArgs;
  if (explicitPromptArgs !== null) {
    finalArgs = replaceOptionValue(args, promptKeys, mergedPrompt);
  } else if (firstPositional.index >= 0) {
    finalArgs = [
      ...args.slice(0, firstPositional.index),
      "--prompt-interactive",
      mergedPrompt,
      ...args.slice(firstPositional.index + 1),
    ];
  } else {
    finalArgs = ["--prompt-interactive", bootstrap, ...args];
  }

  const result = spawnSync("gemini", finalArgs, { stdio: "inherit" });
  runCheckpoint(cwd, originalPrompt);
  process.exit(result.status ?? 0);
};

main();
