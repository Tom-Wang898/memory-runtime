import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, resolve as resolvePath } from "node:path";

import {
  DEFAULT_SKILL_ROOT_CANDIDATES,
  SKIP_DIRECTORIES,
} from "./constants.ts";
import type { SkillRootDiscovery } from "./types.ts";

const splitConfiguredRoots = (): readonly string[] => {
  const value = process.env.MEMORY_RUNTIME_SKILL_ROOTS?.trim() ?? "";
  return value ? value.split(delimiter).filter(Boolean) : [];
};

const expandHome = (value: string): string =>
  value.startsWith("~/")
    ? resolvePath(homedir(), value.slice(2))
    : resolvePath(value);

const collectRequestedRoots = (roots: readonly string[] | undefined): readonly string[] => {
  if (roots && roots.length > 0) {
    return roots.map(expandHome);
  }
  const configuredRoots = splitConfiguredRoots();
  if (configuredRoots.length > 0) {
    return configuredRoots.map(expandHome);
  }
  return DEFAULT_SKILL_ROOT_CANDIDATES.map(expandHome);
};

export const discoverSkillRoots = (
  roots: readonly string[] | undefined,
): SkillRootDiscovery => {
  const requestedRoots = [...new Set(collectRequestedRoots(roots))];
  const discoveredRoots = requestedRoots.filter((rootPath) => existsSync(rootPath));
  const missingRoots = requestedRoots.filter((rootPath) => !existsSync(rootPath));
  return { requestedRoots, discoveredRoots, missingRoots };
};

const walkSkillFiles = (
  directory: string,
  results: string[],
): readonly string[] => {
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name)) {
      walkSkillFiles(resolvePath(directory, entry.name), results);
    }
    if (entry.isFile() && entry.name === "SKILL.md") {
      results.push(resolvePath(directory, entry.name));
    }
  }
  return results;
};

export const collectSkillFiles = (rootPath: string): readonly string[] =>
  walkSkillFiles(rootPath, []).sort((left, right) => left.localeCompare(right));
