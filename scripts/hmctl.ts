import { readFileSync } from "node:fs";

import { renderCodexBootstrap } from "../packages/host-codex/src/index.ts";
import type {
  BootstrapPayload,
  PromotionRecord,
  ProjectCapsule,
} from "../packages/memory-core/src/index.ts";
import {
  createRuntimeServices,
  ensureMemoryPalaceAvailable,
  normalizeMode,
} from "./config.ts";
import { buildCheckpointRecord, readJsonFromStdin } from "./project-context.ts";

interface ParsedArgs {
  readonly command: string;
  readonly values: Map<string, string[]>;
  readonly flags: Set<string>;
}

const parseArgs = (argv: readonly string[]): ParsedArgs => {
  const [command = "help", ...rest] = argv;
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(key);
      continue;
    }
    const existing = values.get(key) ?? [];
    existing.push(next);
    values.set(key, existing);
    index += 1;
  }
  return { command, values, flags };
};

const getValue = (args: ParsedArgs, key: string): string | undefined =>
  args.values.get(key)?.at(-1);

const getValues = (args: ParsedArgs, key: string): readonly string[] =>
  args.values.get(key) ?? [];

const shouldOutputJson = (args: ParsedArgs): boolean => args.flags.has("json");

const normalizeNullable = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
};

const printOutput = (value: unknown, asJson: boolean): void => {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(String(value));
};

const loadBootstrap = async (
  cwd: string,
  args: ParsedArgs,
): Promise<BootstrapPayload> => {
  await ensureMemoryPalaceAvailable();
  const { project, hotClient, runtime } = createRuntimeServices(cwd, "codex");
  try {
    return await runtime.buildBootstrap({
      project,
      mode: normalizeMode(getValue(args, "mode")),
      query: getValue(args, "query") ?? null,
      sessionId: getValue(args, "session-id") ?? null,
      riskLevel: args.flags.has("high-risk") ? "high" : "normal",
      allowColdRecall: !args.flags.has("no-cold-recall"),
    });
  } finally {
    hotClient.close();
  }
};

const buildPromotionRecord = (
  capsule: ProjectCapsule,
  title: string | undefined,
): PromotionRecord => ({
  projectId: capsule.project.id,
  title: title?.trim() || `${capsule.project.id}-promotion`,
  summary: capsule.summary,
  facts:
    capsule.supportingFacts.length > 0
      ? capsule.supportingFacts.map((item) => item.summary)
      : [
          ...capsule.recentDecisions.map((item) => item.summary),
          ...capsule.openLoops.map((item) => item.summary),
        ],
  sourceSessionId: null,
});

const runBootstrap = async (cwd: string, args: ParsedArgs): Promise<void> => {
  const payload = await loadBootstrap(cwd, args);
  const output = shouldOutputJson(args) ? payload : renderCodexBootstrap(payload);
  printOutput(output, shouldOutputJson(args));
};

const runInspect = async (cwd: string, args: ParsedArgs): Promise<void> => {
  const { hotClient, project } = createRuntimeServices(cwd, "codex");
  try {
    const capsule = await hotClient.readProjectCapsule(project.id);
    printOutput(capsule, true);
  } finally {
    hotClient.close();
  }
};

const parseCheckpointFromJson = async (): Promise<unknown> => {
  const raw = await readJsonFromStdin();
  return raw ? JSON.parse(raw) : {};
};

const runCheckpoint = async (cwd: string, args: ParsedArgs): Promise<void> => {
  const { project, hotClient, runtime } = createRuntimeServices(cwd, "codex");
  try {
    const jsonInput = args.flags.has("stdin-json")
      ? ((await parseCheckpointFromJson()) as Record<string, unknown>)
      : {};
    const record = buildCheckpointRecord({
      project,
      sessionId: normalizeNullable(
        getValue(args, "session-id") ?? jsonInput.sessionId,
      ),
      summary: normalizeNullable(getValue(args, "summary") ?? jsonInput.summary),
      activeTask: normalizeNullable(
        getValue(args, "active-task") ?? jsonInput.activeTask,
      ),
      decisions:
        getValues(args, "decision").concat(
          Array.isArray(jsonInput.decisions)
            ? jsonInput.decisions.map((item) => String(item))
            : [],
        ),
      openLoops:
        getValues(args, "open-loop").concat(
          Array.isArray(jsonInput.openLoops)
            ? jsonInput.openLoops.map((item) => String(item))
            : [],
        ),
    });
    await runtime.checkpoint(record);
    printOutput({ ok: true, projectId: project.id }, true);
  } finally {
    hotClient.close();
  }
};

const runPromote = async (cwd: string, args: ParsedArgs): Promise<void> => {
  await ensureMemoryPalaceAvailable();
  const { hotClient, project, runtime } = createRuntimeServices(cwd, "codex");
  try {
    const capsule = await hotClient.readProjectCapsule(project.id);
    if (!capsule) {
      throw new Error(`No capsule available for ${project.id}`);
    }
    const promotion = buildPromotionRecord(capsule, getValue(args, "title"));
    if (args.flags.has("async")) {
      const job = await hotClient.enqueuePromotion(promotion);
      printOutput({ ok: true, queued: true, job }, true);
      return;
    }
    await runtime.promote(promotion);
    printOutput({ ok: true, promotion }, true);
  } finally {
    hotClient.close();
  }
};

const runFlushPromotions = async (cwd: string): Promise<void> => {
  await ensureMemoryPalaceAvailable();
  const { hotClient, project, runtime } = createRuntimeServices(cwd, "codex");
  try {
    const jobs = await hotClient.readPendingPromotions(project.id);
    for (const job of jobs) {
      try {
        await hotClient.markPromotionRunning(job.jobId);
        await runtime.promote(job.payload);
        await hotClient.markPromotionDone(job.jobId);
      } catch (error) {
        await hotClient.markPromotionFailed(
          job.jobId,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    printOutput({ ok: true, flushed: jobs.length }, true);
  } finally {
    hotClient.close();
  }
};

const runMetrics = async (cwd: string): Promise<void> => {
  const { hotClient, project } = createRuntimeServices(cwd, "codex");
  try {
    printOutput(await hotClient.readRuntimeMetrics(project.id, 20), true);
  } finally {
    hotClient.close();
  }
};

const runHelp = (): void => {
  console.log(`hmctl commands:
  bootstrap --cwd <dir> [--query <text>] [--mode fast|warm|cold] [--json]
  checkpoint --cwd <dir> [--summary <text>] [--active-task <text>] [--decision "summary::reason"] [--open-loop "summary::severity"] [--stdin-json]
  inspect --cwd <dir>
  promote --cwd <dir> [--title <text>] [--async]
  flush-promotions --cwd <dir>
  metrics --cwd <dir>`);
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const cwd = getValue(args, "cwd") ?? process.cwd();
  if (args.command === "bootstrap") {
    await runBootstrap(cwd, args);
    return;
  }
  if (args.command === "checkpoint") {
    await runCheckpoint(cwd, args);
    return;
  }
  if (args.command === "inspect") {
    await runInspect(cwd, args);
    return;
  }
  if (args.command === "promote") {
    await runPromote(cwd, args);
    return;
  }
  if (args.command === "flush-promotions") {
    await runFlushPromotions(cwd);
    return;
  }
  if (args.command === "metrics") {
    await runMetrics(cwd);
    return;
  }
  if (args.command === "print-file") {
    printOutput(readFileSync(cwd, "utf8"), false);
    return;
  }
  runHelp();
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
