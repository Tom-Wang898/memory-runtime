import test from "node:test";
import assert from "node:assert/strict";

import { formatPrimerContent } from "../scripts/primer-cache.ts";
import type { BootstrapPayload } from "../packages/memory-core/src/index.ts";

const createPayload = (): BootstrapPayload => ({
  project: {
    id: "demo-project",
    rootPath: "/tmp/demo-project",
    host: "codex",
    vcsRoot: "/tmp/demo-project",
  },
  mode: "warm",
  capsule: null,
  backgroundSummary: "Keep summaries short and avoid repeated lines.",
  backgroundPoints: [
    "Keep summaries short and avoid repeated lines.",
    "Prefer compact project context.",
  ],
  currentFocus: [
    "Prefer compact project context.",
    "Stabilize native codex flow.",
  ],
  recentProgress: [
    "Keep summaries short and avoid repeated lines.",
    "Stabilize native codex flow.",
  ],
  fallbackNotes: [],
  diagnostics: {
    modeApplied: "warm",
    riskLevel: "normal",
    recallQueryStrategy: "direct",
    coldRecallAttempted: false,
    coldRecallUsed: false,
    usedFallback: false,
    degradeReasons: [],
    latencyMs: 10,
    estimatedTokens: 1,
  },
});

test("primer formatting deduplicates repeated summary lines", () => {
  const content = formatPrimerContent(createPayload());

  assert.match(content, /background: Keep summaries short and avoid repeated lines\./);
  assert.match(content, /- Prefer compact project context\./);
  assert.match(content, /- Stabilize native codex flow\./);
  assert.equal(
    content.includes("- Keep summaries short and avoid repeated lines."),
    false,
  );
  assert.equal(
    content.split("\n").filter((line) => line.includes("Prefer compact project context.")).length,
    1,
  );
});
