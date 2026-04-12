import readline from "node:readline";

import { handleBridgeRequest } from "../packages/mcp-bridge/src/index.ts";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  try {
    const payload = JSON.parse(trimmed) as { tool: string };
    const result = await handleBridgeRequest(payload);
    process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
  }
});
