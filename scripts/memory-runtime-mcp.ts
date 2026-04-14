import { stdin, stdout } from "node:process";

import {
  handleBridgeRequest,
  listMcpTools,
} from "../packages/mcp-bridge/src/index.ts";

interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id?: string | number | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

interface McpToolCallArguments {
  readonly cwd?: string;
  readonly [key: string]: unknown;
}

const SERVER_INFO = {
  name: "memory-runtime",
  version: "0.1.0",
} as const;

let inputBuffer = Buffer.alloc(0);
let serverInitialized = false;

const encodeMessage = (payload: unknown): Buffer => {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
  return Buffer.concat([header, body]);
};

const writeMessage = (payload: unknown): void => {
  stdout.write(encodeMessage(payload));
};

const writeSuccess = (
  id: string | number | null | undefined,
  result: unknown,
): void => {
  if (id === undefined) {
    return;
  }
  writeMessage({ jsonrpc: "2.0", id, result });
};

const writeError = (
  id: string | number | null | undefined,
  code: number,
  message: string,
): void => {
  if (id === undefined) {
    return;
  }
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
};

const parseContentLength = (header: string): number | null => {
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) {
    return null;
  }
  return Number(match[1]);
};

const handleInitialize = (request: JsonRpcRequest): void => {
  writeSuccess(request.id, {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {},
    },
    serverInfo: SERVER_INFO,
  });
};

const handleToolsList = (request: JsonRpcRequest): void => {
  writeSuccess(request.id, { tools: listMcpTools() });
};

const handleToolsCall = async (request: JsonRpcRequest): Promise<void> => {
  const name = String(request.params?.name ?? "").trim();
  const args = (request.params?.arguments ?? {}) as McpToolCallArguments;
  if (!name) {
    writeError(request.id, -32602, "missing_tool_name");
    return;
  }
  const result = await handleBridgeRequest({
    tool: name,
    cwd: typeof args.cwd === "string" ? args.cwd : undefined,
    args,
  });
  writeSuccess(request.id, {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
  });
};

const handleRequest = async (request: JsonRpcRequest): Promise<void> => {
  switch (request.method) {
    case "initialize":
      handleInitialize(request);
      return;
    case "notifications/initialized":
      serverInitialized = true;
      return;
    case "ping":
      writeSuccess(request.id, {});
      return;
    case "tools/list":
      handleToolsList(request);
      return;
    case "tools/call":
      if (!serverInitialized) {
        writeError(request.id, -32002, "server_not_initialized");
        return;
      }
      await handleToolsCall(request);
      return;
    default:
      writeError(request.id, -32601, `method_not_found:${request.method}`);
  }
};

const processBuffer = async (): Promise<void> => {
  while (true) {
    const separatorIndex = inputBuffer.indexOf("\r\n\r\n");
    if (separatorIndex < 0) {
      return;
    }
    const header = inputBuffer.slice(0, separatorIndex).toString("utf8");
    const contentLength = parseContentLength(header);
    if (contentLength === null) {
      inputBuffer = Buffer.alloc(0);
      return;
    }
    const messageStart = separatorIndex + 4;
    const messageEnd = messageStart + contentLength;
    if (inputBuffer.length < messageEnd) {
      return;
    }
    const body = inputBuffer.slice(messageStart, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.slice(messageEnd);
    try {
      const request = JSON.parse(body) as JsonRpcRequest;
      await handleRequest(request);
    } catch (error) {
      writeError(
        null,
        -32700,
        error instanceof Error ? error.message : "parse_error",
      );
    }
  }
};

stdin.on("data", async (chunk: Buffer) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  await processBuffer();
});

stdin.resume();
