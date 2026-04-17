import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

import type {
  ContinuityPayload,
  ProjectIdentity,
} from "../packages/memory-core/src/index.ts";

export interface ContinuityRecord {
  readonly version: 1;
  readonly projectId: string;
  readonly rootPath: string;
  readonly generatedAt: string;
  readonly content: string;
  readonly estimatedTokens: number;
}

export interface ContinuityCacheHit {
  readonly path: string;
  readonly record: ContinuityRecord;
}

const DEFAULT_CONTINUITY_DIR = resolvePath(homedir(), ".memory-runtime", "continuity");

const getContinuityDirectory = (): string =>
  resolvePath(process.env.MEMORY_RUNTIME_CONTINUITY_DIR ?? DEFAULT_CONTINUITY_DIR);

const trimLine = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

const normalizeKey = (value: string): string =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

const renderList = (
  label: string,
  items: readonly string[],
  maxItems: number,
  maxLength: number,
  seenKeys: Set<string>,
): string[] => {
  const normalized = items
    .map((item) => trimLine(String(item), maxLength))
    .filter(Boolean)
    .filter((item) => {
      const key = normalizeKey(item);
      if (seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    })
    .slice(0, maxItems);

  if (normalized.length === 0) {
    return [];
  }

  return [label, ...normalized.map((item) => `- ${item}`)];
};

const estimateContinuityTokens = (content: string): number =>
  Math.max(1, Math.ceil(content.length / 4));

export const resolveContinuityPath = (project: ProjectIdentity): string =>
  join(getContinuityDirectory(), `${project.id}.md`);

export const formatContinuityContent = (payload: ContinuityPayload): string => {
  const seenKeys = new Set<string>();
  const summary = payload.continuitySummary
    ? trimLine(payload.continuitySummary, 160)
    : null;
  if (summary) {
    seenKeys.add(normalizeKey(summary));
  }

  const lines = [
    `project: ${payload.project.id}`,
    summary ? `summary: ${summary}` : null,
    ...renderList("continuity:", payload.continuityPoints ?? [], 8, 140, seenKeys),
    payload.fallbackNotes.length > 0
      ? `fallback: ${trimLine(payload.fallbackNotes.join(" | "), 180)}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return lines.join("\n").trim();
};

export const readContinuityCache = (
  project: ProjectIdentity,
  maxAgeSec: number,
): ContinuityCacheHit | null => {
  const path = resolveContinuityPath(project);
  if (!existsSync(path)) {
    return null;
  }

  const stats = statSync(path);
  const ageMs = Date.now() - stats.mtimeMs;
  if (maxAgeSec > 0 && ageMs > maxAgeSec * 1000) {
    return null;
  }

  const content = readFileSync(path, "utf8").trim();
  if (!content) {
    return null;
  }

  return {
    path,
    record: {
      version: 1,
      projectId: project.id,
      rootPath: project.rootPath,
      generatedAt: new Date(stats.mtimeMs).toISOString(),
      content,
      estimatedTokens: estimateContinuityTokens(content),
    },
  };
};

export const writeContinuityCache = (
  project: ProjectIdentity,
  payload: ContinuityPayload,
): ContinuityCacheHit => {
  const path = resolveContinuityPath(project);
  mkdirSync(getContinuityDirectory(), { recursive: true });

  const content = formatContinuityContent(payload);
  writeFileSync(path, `${content}\n`, "utf8");

  return {
    path,
    record: {
      version: 1,
      projectId: project.id,
      rootPath: project.rootPath,
      generatedAt: new Date().toISOString(),
      content,
      estimatedTokens: estimateContinuityTokens(content),
    },
  };
};
