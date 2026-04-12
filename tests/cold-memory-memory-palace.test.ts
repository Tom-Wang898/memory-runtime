import test from "node:test";
import assert from "node:assert/strict";

import { createMemoryPalaceHttpClient } from "../packages/cold-memory-memory-palace/src/index.ts";

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

test("memory palace client maps search results into fact hits", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    createJsonResponse({
      results: [
        {
          memory_id: 1,
          uri: "notes://projects/demo/promotions/one",
          snippet: "Important durable fact",
          score: 0.92,
        },
      ],
    });

  try {
    const client = createMemoryPalaceHttpClient({
      baseUrl: "http://127.0.0.1:18000",
    });
    const results = await client.searchGists("demo-project", "durable fact");
    assert.equal(results.length, 1);
    assert.equal(results[0]?.summary, "Important durable fact");
  } finally {
    global.fetch = originalFetch;
  }
});

test("memory palace client promotes via create when node does not exist", async () => {
  const originalFetch = global.fetch;
  const calls: { url: string; method: string }[] = [];
  global.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: String(init?.method ?? "GET") });
    if (url.includes("/browse/node?")) {
      return createJsonResponse({ detail: "not found" }, 404);
    }
    return createJsonResponse({ ok: true }, 200);
  };

  try {
    const client = createMemoryPalaceHttpClient({
      baseUrl: "http://127.0.0.1:18000",
    });
    await client.promote({
      projectId: "demo-project",
      title: "Wrapper promotion",
      summary: "Summary",
      facts: ["Fact A"],
      sourceSessionId: null,
    });
    assert.equal(calls.length, 4);
    assert.deepEqual(
      calls.map((call) => call.method),
      ["GET", "POST", "GET", "POST"],
    );
    assert.match(calls[0]?.url ?? "", /path=demo-project/);
    assert.match(calls[2]?.url ?? "", /path=demo-project%2Fwrapper-promotion/);
  } finally {
    global.fetch = originalFetch;
  }
});
