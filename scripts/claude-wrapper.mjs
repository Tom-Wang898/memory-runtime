import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HMCTL_PATH = process.env.MEMORY_RUNTIME_HMCTL_PATH ?? join(PROJECT_ROOT, "bin", "hmctl");
const KNOWN_SUBCOMMANDS = new Set([
  "agents",
  "auth",
  "doctor",
  "install",
  "mcp",
  "plugin",
  "plugins",
  "setup-token",
  "update",
  "upgrade",
]);
const PASSTHROUGH_FLAGS = new Set(["-h", "--help", "-v", "--version"]);
const OPTIONS_WITH_VALUES = new Set([
  "--add-dir",
  "--agent",
  "--agents",
  "--allowedTools",
  "--allowed-tools",
  "--append-system-prompt",
  "--betas",
  "-d",
  "--debug",
  "--debug-file",
  "--disallowedTools",
  "--disallowed-tools",
  "--effort",
  "--fallback-model",
  "--file",
  "--from-pr",
  "--json-schema",
  "--max-budget-usd",
  "--mcp-config",
  "--model",
  "-n",
  "--name",
  "--output-format",
  "--input-format",
  "--permission-mode",
  "--plugin-dir",
  "-r",
  "--resume",
  "--session-id",
  "--setting-sources",
  "--settings",
  "--system-prompt",
  "--tmux",
  "--tools",
  "-w",
  "--worktree",
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
    ["bootstrap", "--cwd", cwd, "--host", "claude", "--mode", "warm", ...(query ? ["--query", query] : [])],
    { encoding: "utf8" },
  ).trim();

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
    const passthrough = spawnSync("claude", process.argv.slice(2), { stdio: "inherit" });
    process.exit(passthrough.status ?? 0);
  }

  const args = process.argv.slice(2);
  if (args.some((value) => PASSTHROUGH_FLAGS.has(value))) {
    const passthrough = spawnSync("claude", args, { stdio: "inherit" });
    process.exit(passthrough.status ?? 0);
  }

  const firstPositional = findFirstPositional(args);
  if (firstPositional.value && KNOWN_SUBCOMMANDS.has(firstPositional.value)) {
    const passthrough = spawnSync("claude", args, { stdio: "inherit" });
    process.exit(passthrough.status ?? 0);
  }

  const cwd = process.cwd();
  const activeTask = firstPositional.value;
  const bootstrap = readBootstrap(cwd, activeTask);
  const finalArgs = ["--append-system-prompt", bootstrap, ...args];
  const result = spawnSync("claude", finalArgs, { stdio: "inherit" });
  runCheckpoint(cwd, activeTask);
  process.exit(result.status ?? 0);
};

main();
