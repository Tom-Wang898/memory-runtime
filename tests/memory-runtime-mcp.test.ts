import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
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

const readSingleResponse = async (child: ReturnType<typeof spawn>): Promise<JsonRpcResponse> => {
  return await new Promise((resolve, reject) => {
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
};

test("memory-runtime MCP server handles initialize, tools/list, and tools/call", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-mcp-server-"));
  const childRoot = join(sandboxRoot, "KeepFlow");
  const hotDbPath = join(sandboxRoot, "hot-memory.db");
  const child = spawn(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--experimental-strip-types",
      "--import",
      "./scripts/register-ts-loader.mjs",
      "./scripts/memory-runtime-mcp.ts",
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
    writeFileSync(join(sandboxRoot, "AGENTS.md"), "# workspace\n");
    mkdirSync(join(childRoot, "src"), { recursive: true });
    writeFileSync(
      join(childRoot, ".memory-palace-project.json"),
      JSON.stringify({ project_slug: "mcp-server-demo", project_name: "KeepFlow" }),
    );
    writeFileSync(join(childRoot, "package.json"), JSON.stringify({ name: "keepflow" }));

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
    assert.match(JSON.stringify(initialized.result), /memory-runtime/);

    child.stdin.write(
      encodeMessage({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }),
    );

    child.stdin.write(
      encodeMessage({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      }),
    );
    const tools = await readSingleResponse(child);
    assert.equal(tools.id, 2);
    assert.match(JSON.stringify(tools.result), /memory_bootstrap/);

    child.stdin.write(
      encodeMessage({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "memory_bootstrap",
          arguments: {
            cwd: sandboxRoot,
            projectHint: "KeepFlow",
            mode: "warm",
            query: "What is already known?",
          },
        },
      }),
    );
    const bootstrap = await readSingleResponse(child);
    assert.equal(bootstrap.id, 3);
    assert.match(JSON.stringify(bootstrap.result), /backgroundSummary/);
    assert.match(JSON.stringify(bootstrap.result), /backgroundPoints/);
  } finally {
    child.kill("SIGTERM");
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});
