import { createFixtureColdProvider } from "../packages/cold-memory-fixture/src/index.ts";
import { MemoryRuntime, estimateCapsuleTokens } from "../packages/memory-core/src/index.ts";
import { createSqliteHotMemoryClient, createSqliteHotMemoryProvider } from "../packages/hot-memory-sqlite/src/index.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { renderCodexBootstrap } from "../packages/host-codex/src/index.ts";
import { formatContinuityContent } from "../scripts/continuity-cache.ts";
import { formatPrimerContent } from "../scripts/primer-cache.ts";

const estimateTextTokens = (value: string): number => Math.max(1, Math.ceil(value.length / 4));

const main = async (): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-token-bench-"));
  const hotClient = createSqliteHotMemoryClient({
    databasePath: join(directory, "hot-memory.db"),
  });
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    createFixtureColdProvider({
      facts: [
        {
          id: "fact-1",
          summary: "Long-lived project constraint for repeat sessions.",
          sourceUri: "notes://projects/demo/promotions/constraint",
          score: 0.9,
        },
      ],
    }),
    undefined,
    hotClient.createObserver(),
  );

  try {
    await runtime.checkpoint({
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      sessionId: "token-bench",
      summary:
        "This project requires deterministic startup, fail-open background recall, hot/cold separation, and promotion discipline.",
      activeTask: "Estimate token savings",
      openLoops: [
        {
          id: "loop-1",
          summary: "Keep background additive only.",
          severity: "medium",
          updatedAt: new Date().toISOString(),
        },
      ],
      recentDecisions: [
        {
          id: "decision-1",
          summary: "Prefer small hot capsules to full historical transcripts.",
          reason: "Token discipline",
          updatedAt: new Date().toISOString(),
          sourceUri: null,
        },
      ],
      workingSet: [],
    });

    const payload = await runtime.buildBootstrap({
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      mode: "warm",
      query: "token savings",
    });
    const continuityPayload = await runtime.buildContinuity({
      project: {
        id: "demo-project",
        rootPath: "/tmp/demo-project",
        host: "codex",
        vcsRoot: "/tmp/demo-project",
      },
      mode: "warm",
      query: "continue with the current route",
      budget: { targetTokens: 160, hardLimitTokens: 220 },
    });
    const bootstrapEnvelope = renderCodexBootstrap(payload);
    const continuityContent = formatContinuityContent(continuityPayload);
    const primerContent = formatPrimerContent(payload);
    const compactTokens = payload.capsule ? estimateCapsuleTokens(payload.capsule) : 0;
    const continuityTokens = estimateTextTokens(continuityContent);
    const bootstrapTokens = estimateTextTokens(bootstrapEnvelope);
    const primerTokens = estimateTextTokens(primerContent);
    const naiveTokens = Math.ceil(JSON.stringify(payload.capsule ?? {}).length / 2);
    console.log(
      JSON.stringify(
        {
          primerTokens,
          continuityTokens,
          bootstrapTokens,
          compactTokens,
          naiveTokens,
          primerSavingsVsContinuity: Math.max(0, continuityTokens - primerTokens),
          primerSavingsVsBootstrap: Math.max(0, bootstrapTokens - primerTokens),
          primerSavingsVsNaive: Math.max(0, naiveTokens - primerTokens),
          continuitySavingsVsBootstrap: Math.max(0, bootstrapTokens - continuityTokens),
          continuitySavingsVsNaive: Math.max(0, naiveTokens - continuityTokens),
          bootstrapSavingsVsNaive: Math.max(0, naiveTokens - bootstrapTokens),
          estimatedSavings: Math.max(0, naiveTokens - compactTokens),
        },
        null,
        2,
      ),
    );
  } finally {
    hotClient.close();
    rmSync(directory, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
