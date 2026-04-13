import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve as resolvePath } from "node:path";

import {
  HOST_SPECIFIC_PATTERNS,
  SKIP_DIRECTORIES,
  TOKEN_PATTERN,
  TOPICS_HINT_PATTERN,
  WHEN_HINT_PATTERN,
} from "./constants.ts";
import { collectSkillFiles } from "./discovery.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import type { SkillRecord } from "./types.ts";

const normalizeText = (value: string): string =>
  value.replace(/\s+/gu, " ").trim();

const estimateTokens = (value: string): number => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 0;
  }
  return [...normalized.matchAll(TOKEN_PATTERN)].length;
};

const computeBodyHash = (value: string): string =>
  createHash("sha1").update(normalizeText(value)).digest("hex");

const readText = (filePath: string): string => {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
};

const walkReferenceFiles = (
  directory: string,
  results: string[],
): readonly string[] => {
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name)) {
      walkReferenceFiles(resolvePath(directory, entry.name), results);
    }
    if (entry.isFile()) {
      results.push(resolvePath(directory, entry.name));
    }
  }
  return results;
};

const collectReferenceFiles = (skillDirectory: string): readonly string[] => {
  const referencesRoot = resolvePath(skillDirectory, "references");
  return walkReferenceFiles(referencesRoot, []).sort((left, right) =>
    left.localeCompare(right),
  );
};

const resolveReferenceFiles = (skillDirectory: string): readonly string[] => {
  try {
    return collectReferenceFiles(skillDirectory);
  } catch {
    return [];
  }
};

const countReferenceGaps = (
  referencePaths: readonly string[],
): { readonly gapCount: number; readonly gapPaths: readonly string[]; readonly tokenCount: number } => {
  const gapPaths: string[] = [];
  let tokenCount = 0;
  for (const referencePath of referencePaths) {
    const text = readText(referencePath);
    tokenCount += estimateTokens(text);
    if (WHEN_HINT_PATTERN.test(text) && TOPICS_HINT_PATTERN.test(text)) {
      continue;
    }
    gapPaths.push(referencePath);
  }
  return { gapCount: gapPaths.length, gapPaths, tokenCount };
};

const detectHostSpecificIssues = (text: string): readonly string[] =>
  HOST_SPECIFIC_PATTERNS.flatMap(([label, pattern]) =>
    pattern.test(text) ? [label] : [],
  );

const resolveStatus = (values: ReadonlyMap<string, string>): string =>
  values.get("status")?.trim().toLowerCase() || "active";

const resolveEntrypoint = (values: ReadonlyMap<string, string>): boolean => {
  const rawValue = values.get("entrypoint")?.trim().toLowerCase();
  return rawValue === "true" || resolveStatus(values) === "lite";
};

const resolveDescription = (values: ReadonlyMap<string, string>): string =>
  values.get("description")?.trim() ?? "";

const resolveName = (values: ReadonlyMap<string, string>, skillDirectory: string): string =>
  values.get("name")?.trim() || basename(skillDirectory);

export const scanSkillFile = (filePath: string, rootPath: string): SkillRecord => {
  const text = readText(filePath);
  const skillDirectory = dirname(filePath);
  const parsed = parseFrontmatter(text);
  const referencePaths = resolveReferenceFiles(skillDirectory);
  const referenceHealth = countReferenceGaps(referencePaths);
  const description = resolveDescription(parsed.values);
  const bodyTokens = estimateTokens(parsed.body);
  const referenceTokens = referenceHealth.tokenCount;
  return {
    path: filePath,
    root: rootPath,
    dirName: basename(skillDirectory),
    name: resolveName(parsed.values, skillDirectory),
    description,
    risk: parsed.values.get("risk")?.trim() ?? "unknown",
    status: resolveStatus(parsed.values),
    entrypoint: resolveEntrypoint(parsed.values),
    hasFrontmatter: parsed.hasFrontmatter,
    hasTriggers: parsed.values.has("triggers"),
    descriptionTokens: estimateTokens(description),
    bodyTokens,
    referenceFileCount: referencePaths.length,
    referenceTokens,
    totalTokens: bodyTokens + referenceTokens,
    referenceGapCount: referenceHealth.gapCount,
    referenceGapPaths: referenceHealth.gapPaths,
    hostSpecificIssues: detectHostSpecificIssues(text),
    bodyHash: computeBodyHash(parsed.body),
  };
};

export const scanSkillRoots = (roots: readonly string[]): readonly SkillRecord[] =>
  roots.flatMap((rootPath) =>
    collectSkillFiles(rootPath).map((filePath) => scanSkillFile(filePath, rootPath)),
  );
