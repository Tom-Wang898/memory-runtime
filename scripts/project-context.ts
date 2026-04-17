import { execFileSync } from "node:child_process";

import type {
  CheckpointRecord,
  ConstraintRecord,
  DecisionRecord,
  OpenLoop,
  ProjectIdentity,
  WorkingSetEntry,
} from "../packages/memory-core/src/index.ts";

const safeExec = (command: string, args: readonly string[]): string => {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

const parseDecision = (value: string): DecisionRecord => {
  const [summary, reason] = value.split("::");
  return {
    id: `decision-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    summary: summary.trim(),
    reason: (reason ?? "manual").trim(),
    updatedAt: new Date().toISOString(),
    sourceUri: null,
  };
};

const parseOpenLoop = (value: string): OpenLoop => {
  const [summary, severity] = value.split("::");
  return {
    id: `loop-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    summary: summary.trim(),
    severity:
      severity === "low" || severity === "high" ? severity : "medium",
    updatedAt: new Date().toISOString(),
  };
};

const parseConstraint = (value: string): ConstraintRecord => {
  const [summary, priority, sourceKind] = value.split("::");
  return {
    id: `constraint-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    summary: summary.trim(),
    priority:
      priority === "critical" || priority === "medium" ? priority : "high",
    sourceKind:
      sourceKind === "system" || sourceKind === "memory" ? sourceKind : "user",
    updatedAt: new Date().toISOString(),
  };
};

export const collectGitWorkingSet = (
  project: ProjectIdentity,
): readonly WorkingSetEntry[] => {
  if (!project.vcsRoot) {
    return [];
  }
  const raw = safeExec("git", ["-C", project.vcsRoot, "status", "--short"]);
  if (!raw) {
    return [];
  }
  return raw
    .split("\n")
    .filter(Boolean)
    .slice(0, 12)
    .map((line) => ({
      kind: "file" as const,
      label: line.slice(0, 2).trim() || "modified",
      value: line.slice(3).trim(),
      updatedAt: new Date().toISOString(),
    }));
};

export const readJsonFromStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
};

export const buildCheckpointRecord = (input: {
  readonly project: ProjectIdentity;
  readonly sessionId: string | null;
  readonly summary?: string | null;
  readonly activeTask?: string | null;
  readonly nextStep?: string | null;
  readonly constraints?: readonly string[];
  readonly decisions: readonly string[];
  readonly openLoops: readonly string[];
  readonly workingSet?: readonly WorkingSetEntry[];
}): CheckpointRecord => ({
  project: input.project,
  sessionId: input.sessionId,
  summary: input.summary ?? null,
  activeTask: input.activeTask ?? null,
  constraints: input.constraints?.map(parseConstraint),
  nextStep: input.nextStep ?? null,
  openLoops: input.openLoops.map(parseOpenLoop),
  recentDecisions: input.decisions.map(parseDecision),
  workingSet: input.workingSet ?? collectGitWorkingSet(input.project),
});
