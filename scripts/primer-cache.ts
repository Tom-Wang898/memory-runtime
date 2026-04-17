import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

import type { BootstrapPayload, ProjectIdentity } from "../packages/memory-core/src/index.ts";

export interface PrimerRecord {
  readonly version: 1;
  readonly projectId: string;
  readonly rootPath: string;
  readonly generatedAt: string;
  readonly content: string;
  readonly estimatedTokens: number;
}

export interface PrimerCacheHit {
  readonly path: string;
  readonly record: PrimerRecord;
}

const DEFAULT_PRIMER_DIR = resolvePath(homedir(), ".memory-runtime", "primers");

const getPrimerDirectory = (): string =>
  resolvePath(process.env.MEMORY_RUNTIME_PRIMER_DIR ?? DEFAULT_PRIMER_DIR);

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

const estimatePrimerTokens = (content: string): number =>
  Math.max(1, Math.ceil(content.length / 4));

export const resolvePrimerPath = (project: ProjectIdentity): string =>
  join(getPrimerDirectory(), `${project.id}.md`);

export const formatPrimerContent = (payload: BootstrapPayload): string => {
  const seenKeys = new Set<string>();
  const background = payload.backgroundSummary
    ? trimLine(payload.backgroundSummary, 160)
    : null;
  if (background) {
    seenKeys.add(normalizeKey(background));
  }
  const lines = [
    `project: ${payload.project.id}`,
    background ? `background: ${background}` : null,
    ...renderList("points:", payload.backgroundPoints ?? [], 3, 120, seenKeys),
    ...renderList("focus:", payload.currentFocus ?? [], 2, 100, seenKeys),
    ...renderList("recent:", payload.recentProgress ?? [], 1, 100, seenKeys),
    payload.fallbackNotes.length > 0
      ? `fallback: ${trimLine(payload.fallbackNotes.join(" | "), 160)}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return lines.join("\n").trim();
};

export const readPrimerCache = (
  project: ProjectIdentity,
  maxAgeSec: number,
): PrimerCacheHit | null => {
  const path = resolvePrimerPath(project);
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
      estimatedTokens: estimatePrimerTokens(content),
    },
  };
};

export const writePrimerCache = (
  project: ProjectIdentity,
  payload: BootstrapPayload,
): PrimerCacheHit => {
  const path = resolvePrimerPath(project);
  mkdirSync(getPrimerDirectory(), { recursive: true });

  const content = formatPrimerContent(payload);
  writeFileSync(path, `${content}\n`, "utf8");

  return {
    path,
    record: {
      version: 1,
      projectId: project.id,
      rootPath: project.rootPath,
      generatedAt: new Date().toISOString(),
      content,
      estimatedTokens: estimatePrimerTokens(content),
    },
  };
};
