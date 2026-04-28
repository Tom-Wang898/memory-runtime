import { stdin, stdout } from "node:process";

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id?: string | number | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

interface StdioMcpServerOptions {
  readonly serverInfo: Readonly<{
    name: string;
    version: string;
  }>;
  readonly tools: readonly McpToolDefinition[];
  readonly handleToolCall: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}

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
  if (id !== undefined) {
    writeMessage({ jsonrpc: "2.0", id, result });
  }
};

const writeError = (
  id: string | number | null | undefined,
  code: number,
  message: string,
): void => {
  if (id !== undefined) {
    writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
  }
};

const parseContentLength = (header: string): number | null => {
  const match = header.match(/Content-Length:\s*(\d+)/i);
  return match ? Number(match[1]) : null;
};

const handleInitialize = (
  request: JsonRpcRequest,
  options: StdioMcpServerOptions,
): void => {
  writeSuccess(request.id, {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: options.serverInfo,
  });
};

const handleToolsCall = async (
  request: JsonRpcRequest,
  options: StdioMcpServerOptions,
): Promise<void> => {
  const name = String(request.params?.name ?? "").trim();
  const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
  if (!name) {
    writeError(request.id, -32602, "missing_tool_name");
    return;
  }
  try {
    const result = await options.handleToolCall(name, args);
    writeSuccess(request.id, {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    });
  } catch (error) {
    writeError(
      request.id,
      -32602,
      error instanceof Error ? error.message : "tool_call_failed",
    );
  }
};

const handleRequest = async (
  request: JsonRpcRequest,
  options: StdioMcpServerOptions,
): Promise<void> => {
  switch (request.method) {
    case "initialize":
      handleInitialize(request, options);
      return;
    case "notifications/initialized":
      serverInitialized = true;
      return;
    case "ping":
      writeSuccess(request.id, {});
      return;
    case "tools/list":
      writeSuccess(request.id, { tools: options.tools });
      return;
    case "tools/call":
      if (!serverInitialized) {
        writeError(request.id, -32002, "server_not_initialized");
        return;
      }
      await handleToolsCall(request, options);
      return;
    default:
      writeError(request.id, -32601, `method_not_found:${request.method}`);
  }
};

const processBuffer = async (options: StdioMcpServerOptions): Promise<void> => {
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
    let request: JsonRpcRequest | null = null;
    try {
      request = JSON.parse(body) as JsonRpcRequest;
      await handleRequest(request, options);
    } catch (error) {
      writeError(
        request?.id ?? null,
        -32700,
        error instanceof Error ? error.message : "parse_error",
      );
    }
  }
};

export const startStdioMcpServer = (options: StdioMcpServerOptions): void => {
  stdin.on("data", async (chunk: Buffer) => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    await processBuffer(options);
  });
  stdin.resume();
};
