import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

interface JsonRpcResponse {
  readonly id?: string | number | null;
  readonly result?: unknown;
  readonly error?: { code: number; message: string };
}

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = dirname(dirname(TEST_FILE_PATH));

const encodeMessage = (payload: unknown): string => {
  const body = JSON.stringify(payload);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
};

const readSingleResponse = async (
  child: ReturnType<typeof spawn>,
): Promise<JsonRpcResponse> =>
  await new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const separatorIndex = buffer.indexOf("\r\n\r\n");
      if (separatorIndex < 0) {
        return;
      }
      const header = buffer.slice(0, separatorIndex).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        reject(new Error("missing_content_length"));
        return;
      }
      const length = Number(match[1]);
      const start = separatorIndex + 4;
      const end = start + length;
      if (buffer.length < end) {
        return;
      }
      child.stdout.off("data", onData);
      resolve(JSON.parse(buffer.slice(start, end).toString("utf8")) as JsonRpcResponse);
    };
    child.stdout.on("data", onData);
    child.once("error", reject);
    child.once("exit", (code) => {
      reject(new Error(`server_exited:${code ?? -1}`));
    });
  });

const callTool = async (
  child: ReturnType<typeof spawn>,
  id: number,
  name: string,
  args: Record<string, unknown>,
): Promise<JsonRpcResponse> => {
  child.stdin.write(
    encodeMessage({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  );
  return await readSingleResponse(child);
};

test("memory-hot MCP exposes hot-only tools and never lists cold bootstrap/search", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-hot-mcp-"));
  const projectRoot = join(sandboxRoot, "HotProject");
  const hotDbPath = join(sandboxRoot, "hot-memory.db");
  const child = spawn(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--experimental-strip-types",
      "--import",
      "./scripts/register-ts-loader.mjs",
      "./scripts/memory-hot-mcp.ts",
    ],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        MEMORY_RUNTIME_HOT_DB_PATH: hotDbPath,
        MEMORY_RUNTIME_COLD_PROVIDER: "none",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  try {
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".memory-palace-project.json"),
      JSON.stringify({ project_slug: "hot-project", project_name: "Hot Project" }),
    );

    child.stdin.write(
      encodeMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      }),
    );
    const initialized = await readSingleResponse(child);
    assert.equal(initialized.id, 1);
    assert.match(JSON.stringify(initialized.result), /memory-hot/);

    child.stdin.write(
      encodeMessage({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }),
    );

    child.stdin.write(
      encodeMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    );
    const tools = await readSingleResponse(child);
    const toolText = JSON.stringify(tools.result);
    assert.match(toolText, /memory_hot_state/);
    assert.match(toolText, /memory_hot_continuity/);
    assert.match(toolText, /memory_hot_checkpoint/);
    assert.doesNotMatch(toolText, /memory_bootstrap/);
    assert.doesNotMatch(toolText, /memory_search/);

    const checkpoint = await callTool(child, 3, "memory_hot_checkpoint", {
      cwd: projectRoot,
      summary: "Hot MCP checkpoint summary",
      activeTask: "Validate hot MCP",
      nextStep: "Use hot MCP from Codex",
      decisions: ["Keep cold recall out of hot MCP::startup safety"],
      openLoops: ["Enable config after test::medium"],
    });
    assert.equal(checkpoint.id, 3);
    assert.match(JSON.stringify(checkpoint.result), /\"ok\":true/);

    const continuity = await callTool(child, 4, "memory_hot_continuity", {
      cwd: projectRoot,
      mode: "warm",
      query: "continue",
    });
    assert.equal(continuity.id, 4);
    assert.match(JSON.stringify(continuity.result), /Use hot MCP from Codex/);
    assert.doesNotMatch(JSON.stringify(continuity.result), /supportingFacts/);

    const state = await callTool(child, 5, "memory_hot_state", {
      cwd: projectRoot,
    });
    assert.equal(state.id, 5);
    assert.match(JSON.stringify(state.result), /\"hasCapsule\":true/);
    assert.match(JSON.stringify(state.result), /Validate hot MCP/);
  } finally {
    child.kill("SIGTERM");
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});
