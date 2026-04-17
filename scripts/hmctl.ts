import { readFileSync } from "node:fs";
import { renderCodexBootstrap } from "../packages/host-codex/src/index.ts";
import type {
  BootstrapPayload,
  PromotionRecord,
  ProjectCapsule,
} from "../packages/memory-core/src/index.ts";
import { decideContextRoute } from "../packages/memory-core/src/index.ts";
import {
  createRuntimeServices,
  ensureMemoryPalaceAvailable,
  normalizeMode,
} from "./config.ts";
import { buildCheckpointRecord, readJsonFromStdin } from "./project-context.ts";
import {
  isSkillsGovernanceCommand,
  runSkillsGovernanceCommand,
} from "./skills-governance-cli.ts";
import {
  exportPublicProfile,
  listPublicExportProfiles,
} from "./public-export.ts";
import {
  readContinuityCache,
  writeContinuityCache,
} from "./continuity-cache.ts";
import { readPrimerCache, writePrimerCache } from "./primer-cache.ts";
import { runWithDatabaseRetry } from "./sqlite-retry.ts";
import {
  compactAllHotProjects,
  compactHotProject,
} from "./hot-memory-compactor.ts";

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

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const resolveMode = (
  args: ParsedArgs,
  fallback: "fast" | "warm" | "cold",
): "fast" | "warm" | "cold" =>
  getValue(args, "mode") ? normalizeMode(getValue(args, "mode")) : fallback;

const printOutput = (value: unknown, asJson: boolean): void => {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(String(value));
};

const recordRouteMetric = async (
  cwd: string,
  route: string,
  reason: string,
  query: string | null,
): Promise<void> => {
  const { hotClient, project } = createRuntimeServices(cwd, "codex");
  try {
    await hotClient.createObserver().recordMetric({
      metricType: "context_route",
      projectId: project.id,
      payload: {
        route,
        reason,
        hasQuery: Boolean(query),
      },
      createdAt: new Date().toISOString(),
    });
  } finally {
    hotClient.close();
  }
};

const loadBootstrap = async (
  cwd: string,
  args: ParsedArgs,
  fallbackMode: "fast" | "warm" | "cold" = "fast",
): Promise<BootstrapPayload> => {
  await ensureMemoryPalaceAvailable();
  const { project, hotClient, runtime } = createRuntimeServices(cwd, "codex");
  try {
    return await runWithDatabaseRetry(() =>
      runtime.buildBootstrap({
        project,
        mode: resolveMode(args, fallbackMode),
        query: getValue(args, "query") ?? null,
        sessionId: getValue(args, "session-id") ?? null,
        riskLevel: args.flags.has("high-risk") ? "high" : "normal",
        allowColdRecall: !args.flags.has("no-cold-recall"),
      }),
    );
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

const runPrimer = async (cwd: string, args: ParsedArgs): Promise<void> => {
  const { project, hotClient } = createRuntimeServices(cwd, "codex");
  hotClient.close();

  const maxAgeSec = parsePositiveInteger(getValue(args, "max-age-sec"), 900);
  const allowCache = !args.flags.has("force") && !getValue(args, "query");
  const cached = allowCache ? readPrimerCache(project, maxAgeSec) : null;
  if (cached) {
    printOutput(
      shouldOutputJson(args)
        ? { ok: true, source: "cache", path: cached.path, ...cached.record }
        : cached.record.content,
      shouldOutputJson(args),
    );
    return;
  }

  const payload = await loadBootstrap(cwd, args, "warm");
  const primer = writePrimerCache(project, payload);
  printOutput(
    shouldOutputJson(args)
      ? { ok: true, source: "fresh", path: primer.path, ...primer.record }
      : primer.record.content,
    shouldOutputJson(args),
  );
};

const runContinuity = async (cwd: string, args: ParsedArgs): Promise<void> => {
  const { project, hotClient, runtime } = createRuntimeServices(cwd, "codex");
  try {
    const maxAgeSec = parsePositiveInteger(getValue(args, "max-age-sec"), 900);
    const cached = args.flags.has("force")
      ? null
      : readContinuityCache(project, maxAgeSec);
    if (cached) {
      printOutput(
        shouldOutputJson(args)
          ? { ok: true, source: "cache", path: cached.path, ...cached.record }
          : cached.record.content,
        shouldOutputJson(args),
      );
      return;
    }

    const payload = await runWithDatabaseRetry(() =>
      runtime.buildContinuity({
        project,
        mode: getValue(args, "mode") ? normalizeMode(getValue(args, "mode")) : "warm",
        query: getValue(args, "query") ?? null,
        sessionId: getValue(args, "session-id") ?? null,
        budget: { hardLimitTokens: 220, targetTokens: 160 },
      }),
    );
    if (!payload.capsule) {
      printOutput(
        shouldOutputJson(args)
          ? { ok: false, source: "fresh", payload, reason: "capsule_missing" }
          : payload.fallbackNotes.join("\n"),
        shouldOutputJson(args),
      );
      return;
    }
    const continuity = writeContinuityCache(project, payload);
    printOutput(
      shouldOutputJson(args)
        ? { ok: true, source: "fresh", path: continuity.path, payload, ...continuity.record }
        : continuity.record.content,
      shouldOutputJson(args),
    );
  } finally {
    hotClient.close();
  }
};

const runContext = async (cwd: string, args: ParsedArgs): Promise<void> => {
  const explicitRoute = getValue(args, "route");
  const query = normalizeNullable(getValue(args, "query"));
  const decision =
    explicitRoute === "primer" || explicitRoute === "continuity" || explicitRoute === "bootstrap"
      ? {
          route: explicitRoute,
          reason: "explicit_query" as const,
          normalizedQuery: query,
        }
      : decideContextRoute(query);

  await recordRouteMetric(cwd, decision.route, decision.reason, decision.normalizedQuery);

  if (decision.route === "primer") {
    await runPrimer(cwd, args);
    return;
  }
  if (decision.route === "continuity") {
    await runContinuity(cwd, args);
    return;
  }
  const payload = await loadBootstrap(cwd, args, "warm");
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
      nextStep: normalizeNullable(
        getValue(args, "next-step") ?? jsonInput.nextStep,
      ),
      constraints:
        getValues(args, "constraint").concat(
          Array.isArray(jsonInput.constraints)
            ? jsonInput.constraints.map((item) => String(item))
            : [],
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
    await runWithDatabaseRetry(() => runtime.checkpoint(record));
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

const runCompact = async (cwd: string, args: ParsedArgs): Promise<void> => {
  const result = await compactHotProject({
    cwd,
    host: "codex",
    dryRun: args.flags.has("dry-run"),
    maxOpenLoopAgeDays: parsePositiveInteger(getValue(args, "max-open-loop-age-days"), 21),
    maxWorkingSetAgeDays: parsePositiveInteger(getValue(args, "max-working-set-age-days"), 7),
    maxDecisionAgeDays: parsePositiveInteger(getValue(args, "max-decision-age-days"), 30),
    updatePrimer: args.flags.has("update-primer"),
    promoteStable: args.flags.has("promote-stable"),
  });
  printOutput(result, true);
};

const runCompactAll = async (cwd: string, args: ParsedArgs): Promise<void> => {
  const result = await compactAllHotProjects({
    host: "codex",
    root: normalizeNullable(getValue(args, "root")) ?? cwd,
    dryRun: args.flags.has("dry-run"),
    maxOpenLoopAgeDays: parsePositiveInteger(getValue(args, "max-open-loop-age-days"), 21),
    maxWorkingSetAgeDays: parsePositiveInteger(getValue(args, "max-working-set-age-days"), 7),
    maxDecisionAgeDays: parsePositiveInteger(getValue(args, "max-decision-age-days"), 30),
    updatePrimer: args.flags.has("update-primer"),
    promoteStable: args.flags.has("promote-stable"),
  });
  printOutput(result, true);
};

const runPublicExport = async (args: ParsedArgs): Promise<void> => {
  if (args.flags.has("list-profiles")) {
    printOutput(listPublicExportProfiles(), true);
    return;
  }
  const profileName = getValue(args, "profile") ?? null;
  const sourceRoot = getValue(args, "source") ?? null;
  const outputRoot = getValue(args, "output") ?? null;
  if (profileName === null || sourceRoot === null || outputRoot === null) {
    throw new Error(
      "public-export requires --profile, --source, and --output.",
    );
  }
  printOutput(
    exportPublicProfile({
      profileName,
      sourceRoot,
      outputRoot,
      dryRun: args.flags.has("dry-run"),
    }),
    true,
  );
};

const runHelp = (): void => {
  console.log(`hmctl commands:
  bootstrap --cwd <dir> [--query <text>] [--mode fast|warm|cold] [--json]
  primer --cwd <dir> [--mode fast|warm|cold] [--query <text>] [--max-age-sec <n>] [--force] [--json]
  continuity --cwd <dir> [--mode fast|warm|cold] [--query <text>] [--max-age-sec <n>] [--force] [--json]
  context --cwd <dir> [--query <text>] [--route auto|primer|continuity|bootstrap] [--json]
  checkpoint --cwd <dir> [--summary <text>] [--active-task <text>] [--next-step <text>] [--constraint "summary::priority::sourceKind"] [--decision "summary::reason"] [--open-loop "summary::severity"] [--stdin-json]
  inspect --cwd <dir>
  compact --cwd <dir> [--dry-run] [--max-open-loop-age-days <n>] [--max-working-set-age-days <n>] [--max-decision-age-days <n>] [--update-primer] [--promote-stable]
  compact-all [--root <dir>] [--dry-run] [--max-open-loop-age-days <n>] [--max-working-set-age-days <n>] [--max-decision-age-days <n>] [--update-primer] [--promote-stable]
  promote --cwd <dir> [--title <text>] [--async]
  flush-promotions --cwd <dir>
  metrics --cwd <dir>
  skills-audit [--root <dir>] [--host <codex|claude|gemini|universal>] [--limit <n>] [--json] [--json-out <file>] [--markdown-out <file>]
  skills-plan [--root <dir>] [--host <codex|claude|gemini|universal>] [--limit <n>] [--json] [--plan-out <file>]
  skills-apply [--root <dir>] [--host <codex|claude|gemini|universal>] [--limit <n>] [--snapshot-out <file>] [--plan-out <file>] [--json]
  skills-duplicates [--root <dir>] [--host <codex|claude|gemini|universal>] [--json] [--decision-out <file>] [--template-markdown-out <file>]
  skills-duplicates-apply --decision-file <file> [--snapshot-out <file>] [--json]
  skills-rollback --snapshot <file> [--force] [--json]
  skills-benchmark [--root <dir>] [--host <codex|claude|gemini|universal>] [--limit <n>] [--json]
  public-export --profile <name> --source <dir> --output <dir> [--dry-run]
  public-export --list-profiles`);
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const cwd = getValue(args, "cwd") ?? process.cwd();
  const commandHandlers: Record<string, () => Promise<void>> = {
    bootstrap: () => runBootstrap(cwd, args),
    primer: () => runPrimer(cwd, args),
    continuity: () => runContinuity(cwd, args),
    context: () => runContext(cwd, args),
    checkpoint: () => runCheckpoint(cwd, args),
    inspect: () => runInspect(cwd, args),
    compact: () => runCompact(cwd, args),
    "compact-all": () => runCompactAll(cwd, args),
    promote: () => runPromote(cwd, args),
    "flush-promotions": () => runFlushPromotions(cwd),
    metrics: () => runMetrics(cwd),
    "public-export": () => runPublicExport(args),
  };
  const handler = commandHandlers[args.command];
  if (handler) {
    await handler();
    return;
  }
  if (isSkillsGovernanceCommand(args.command)) {
    runSkillsGovernanceCommand({
      command: args.command,
      getValue: (key) => getValue(args, key),
      getValues: (key) => getValues(args, key),
      hasFlag: (key) => args.flags.has(key),
      printOutput,
      shouldOutputJson: shouldOutputJson(args),
    });
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
