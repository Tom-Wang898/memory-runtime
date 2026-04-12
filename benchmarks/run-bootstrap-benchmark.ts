import { performance } from "node:perf_hooks";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createFixtureColdProvider } from "../packages/cold-memory-fixture/src/index.ts";
import { MemoryRuntime } from "../packages/memory-core/src/index.ts";
import { createSqliteHotMemoryClient, createSqliteHotMemoryProvider } from "../packages/hot-memory-sqlite/src/index.ts";

const ITERATIONS = 20;

const main = async (): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), "memory-runtime-bench-"));
  const hotClient = createSqliteHotMemoryClient({
    databasePath: join(directory, "hot-memory.db"),
  });
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    createFixtureColdProvider({
      facts: [
        {
          id: "fact-1",
          summary: "Bootstrap should stay additive and compact.",
          sourceUri: "notes://projects/demo/promotions/bootstrap",
          score: 0.8,
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
      sessionId: "bench-session",
      summary: "Benchmark capsule",
      activeTask: "Benchmark bootstrap",
      openLoops: [],
      recentDecisions: [],
      workingSet: [],
    });

    const timings: number[] = [];
    for (let index = 0; index < ITERATIONS; index += 1) {
      const started = performance.now();
      await runtime.buildBootstrap({
        project: {
          id: "demo-project",
          rootPath: "/tmp/demo-project",
          host: "codex",
          vcsRoot: "/tmp/demo-project",
        },
        mode: "warm",
        query: "bootstrap",
      });
      timings.push(performance.now() - started);
    }

    const avgMs = timings.reduce((sum, value) => sum + value, 0) / timings.length;
    console.log(
      JSON.stringify(
        {
          iterations: ITERATIONS,
          avgMs: Number(avgMs.toFixed(3)),
          maxMs: Number(Math.max(...timings).toFixed(3)),
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
