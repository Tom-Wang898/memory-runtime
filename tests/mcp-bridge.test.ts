import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  handleBridgeRequest,
  listMcpTools,
} from "../packages/mcp-bridge/src/index.ts";

const withEnv = async (
  values: Record<string, string | undefined>,
  callback: () => Promise<void> | void,
): Promise<void> => {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

test("listMcpTools exposes app-compatible memory tools", async () => {
  assert.deepEqual(
    listMcpTools().map((tool) => tool.name),
    [
      "memory_bootstrap",
      "memory_checkpoint",
      "memory_search",
      "memory_project_state",
    ],
  );
});

test("bridge handlers support checkpoint, bootstrap, search, and project state", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-mcp-bridge-"));
  const childRoot = join(sandboxRoot, "KeepFlow");
  const hotDbPath = join(sandboxRoot, "hot-memory.db");
  try {
    writeFileSync(join(sandboxRoot, "AGENTS.md"), "# workspace\n");
    mkdirSync(join(childRoot, "src"), { recursive: true });
    writeFileSync(
      join(childRoot, ".memory-palace-project.json"),
      JSON.stringify({
        project_slug: "bridge-demo",
        project_name: "KeepFlow",
      }),
    );
    writeFileSync(join(childRoot, "package.json"), JSON.stringify({ name: "keepflow" }));
    await withEnv(
      {
        MEMORY_RUNTIME_HOT_DB_PATH: hotDbPath,
        MEMORY_RUNTIME_COLD_PROVIDER: "none",
      },
      async () => {
        const checkpointResult = await handleBridgeRequest({
          tool: "memory_checkpoint",
          cwd: sandboxRoot,
          args: {
            projectHint: "KeepFlow",
            summary: "Bridge checkpoint summary",
            activeTask: "Verify MCP bridge",
            nextStep: "Add constraints bridge coverage",
            constraints: ["Keep codex native::critical::user"],
            decisions: ["Use MCP for app memory::consistency"],
            openLoops: ["Validate app path::medium"],
          },
        });
        assert.equal(
          (checkpointResult as { ok: boolean }).ok,
          true,
        );
        assert.match(
          String((checkpointResult as { projectId: string }).projectId),
          /^keepflow-/,
        );

        const bootstrap = await handleBridgeRequest({
          tool: "memory_bootstrap",
          cwd: sandboxRoot,
          args: {
            projectHint: "KeepFlow",
            mode: "warm",
            query: "Verify MCP bridge",
          },
        });
        assert.match(
          JSON.stringify(bootstrap),
          /Bridge checkpoint summary/,
        );
        assert.equal(
          (bootstrap as { backgroundSummary: string }).backgroundSummary,
          "Use MCP for app memory",
        );
        assert.deepEqual(
          (bootstrap as { backgroundPoints: readonly string[] }).backgroundPoints,
          ["Constraint: Keep codex native", "Use MCP for app memory"],
        );
        assert.deepEqual(
          (bootstrap as { currentFocus: readonly string[] }).currentFocus,
          [
            "Add constraints bridge coverage",
            "Validate app path",
            "Verify MCP bridge",
          ],
        );
        assert.deepEqual(
          (bootstrap as { recentProgress: readonly string[] }).recentProgress,
          ["Bridge checkpoint summary"],
        );

        const state = await handleBridgeRequest({
          tool: "memory_project_state",
          cwd: sandboxRoot,
          args: { projectHint: "KeepFlow" },
        });
        assert.match(JSON.stringify(state), /bridge-demo/);
        assert.match(JSON.stringify(state), /\"hasCapsule\":true/);
        assert.match(JSON.stringify(state), /\"constraintCount\":1/);
        assert.match(JSON.stringify(state), /\"nextStep\":\"Add constraints bridge coverage\"/);

        const search = await handleBridgeRequest({
          tool: "memory_search",
          cwd: sandboxRoot,
          args: { projectHint: "KeepFlow", query: "anything", limit: 3 },
        });
        assert.deepEqual(search, { query: "anything", hits: [] });
      },
    );
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});
