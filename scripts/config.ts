import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve as resolvePath } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  MemoryRuntime,
  type BootstrapMode,
  type ProjectIdentity,
} from "../packages/memory-core/src/index.ts";
import {
  createMemoryPalaceColdProviderFromConfig,
} from "../packages/cold-memory-memory-palace/src/index.ts";
import {
  createSqliteHotMemoryClient,
  createSqliteHotMemoryProvider,
} from "../packages/hot-memory-sqlite/src/index.ts";
import type { ColdMemoryProvider } from "../packages/memory-core/src/index.ts";

export interface RuntimeServices {
  readonly project: ProjectIdentity;
  readonly hotClient: ReturnType<typeof createSqliteHotMemoryClient>;
  readonly runtime: MemoryRuntime;
  readonly coldProvider: ColdMemoryProvider | null;
}

export interface ProjectResolutionOptions {
  readonly projectHint?: string | null;
  readonly queryHint?: string | null;
}

const DEFAULT_MEMORY_PALACE_CANDIDATES = [
  ["..", "Memory-Palace", "backend"],
  ["..", "memory-palace", "backend"],
  ["vendor", "Memory-Palace", "backend"],
  ["vendor", "memory-palace", "backend"],
] as const;

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const shortHash = (value: string): string =>
  createHash("sha1").update(value).digest("hex").slice(0, 8);

const PROJECT_OVERRIDE_FILES = [
  ".memory-palace-project.json",
  ".project-memory.json",
] as const;

const CHILD_PROJECT_MARKERS = [
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "AGENTS.md",
  "README.md",
  "README_CN.md",
] as const;

const CHILD_SOURCE_DIRS = [
  "src",
  "app",
  "pages",
  "server",
  "backend",
  "frontend",
  "src-tauri",
] as const;

const CHILD_PROJECT_SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "generated-images",
  "node_modules",
  "out",
  "target",
  "test-results",
  "vendor",
]);

const DEFAULT_GLOBAL_PROJECT_ROOT = resolvePath(homedir(), "Documents");

interface ProjectCandidate {
  readonly rootPath: string;
  readonly memoryNamespace: string;
  readonly aliases: readonly string[];
}

const resolveGitRoot = (cwd: string): string | null => {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

const resolveHotDatabasePath = (): string =>
  resolvePath(
    process.env.MEMORY_RUNTIME_HOT_DB_PATH ?? join(homedir(), ".memory-runtime", "hot-memory.db"),
  );

const getRuntimeRoot = (): string =>
  resolvePath(
    process.env.MEMORY_RUNTIME_ROOT ??
      dirname(dirname(fileURLToPath(import.meta.url))),
  );

const getMemoryPalaceBaseUrl = (): string =>
  process.env.MEMORY_RUNTIME_MP_BASE_URL ?? "http://127.0.0.1:18000";

const canAutostartMemoryPalace = (): boolean =>
  (process.env.MEMORY_RUNTIME_MP_AUTOSTART ?? "1").trim() !== "0";

const isLoopbackBaseUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
};

const healthCheck = async (baseUrl: string, timeoutMs: number): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL("/health", baseUrl), {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const waitForHealth = async (baseUrl: string): Promise<boolean> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await healthCheck(baseUrl, 400)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

const resolveBackendCandidate = (candidate: string): string | null => {
  const backendRoot = resolvePath(candidate);
  const pythonPath = resolvePath(backendRoot, ".venv", "bin", "python");
  const entryPath = resolvePath(backendRoot, "main.py");
  if (!existsSync(pythonPath) || !existsSync(entryPath)) {
    return null;
  }
  return backendRoot;
};

export const resolveMemoryPalaceBackendRoot = (): string | null => {
  const configuredRoot = process.env.MEMORY_RUNTIME_MP_BACKEND_ROOT?.trim();
  if (configuredRoot) {
    return resolveBackendCandidate(configuredRoot);
  }
  const runtimeRoot = getRuntimeRoot();
  for (const parts of DEFAULT_MEMORY_PALACE_CANDIDATES) {
    const resolvedRoot = resolveBackendCandidate(resolvePath(runtimeRoot, ...parts));
    if (resolvedRoot) {
      return resolvedRoot;
    }
  }
  return null;
};

const spawnMemoryPalace = (baseUrl: string): boolean => {
  const backendRoot = resolveMemoryPalaceBackendRoot();
  if (!backendRoot) {
    return false;
  }
  try {
    const pythonPath = resolvePath(backendRoot, ".venv", "bin", "python");
    const url = new URL(baseUrl);
    const logDir = resolvePath(homedir(), ".memory-runtime", "logs");
    mkdirSync(logDir, { recursive: true });
    const logPath = resolvePath(logDir, "memory-palace-backend.log");
    const logFd = openSync(logPath, "a");
    const child = spawn(
      pythonPath,
      ["-m", "uvicorn", "main:app", "--host", url.hostname, "--port", url.port || "18000"],
      {
        cwd: backendRoot,
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: {
          ...process.env,
          MCP_API_KEY_ALLOW_INSECURE_LOCAL:
            process.env.MCP_API_KEY_ALLOW_INSECURE_LOCAL ?? "true",
        },
      },
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
};

export const ensureMemoryPalaceAvailable = async (): Promise<void> => {
  const baseUrl = getMemoryPalaceBaseUrl();
  if (!canAutostartMemoryPalace() || !isLoopbackBaseUrl(baseUrl)) {
    return;
  }
  if (await healthCheck(baseUrl, 400)) {
    return;
  }
  if (!spawnMemoryPalace(baseUrl)) {
    return;
  }
  await waitForHealth(baseUrl);
};

const buildProjectId = (rootPath: string): string => {
  const name = slugify(basename(rootPath)) || "project";
  return `${name}-${shortHash(rootPath)}`;
};

const listDirectoryNames = (rootPath: string): readonly string[] => {
  try {
    return readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
};

const hasProjectSignals = (rootPath: string): boolean => {
  if (existsSync(join(rootPath, ".git"))) {
    return true;
  }
  if (PROJECT_OVERRIDE_FILES.some((fileName) => existsSync(join(rootPath, fileName)))) {
    return true;
  }
  if (CHILD_PROJECT_MARKERS.some((fileName) => existsSync(join(rootPath, fileName)))) {
    return true;
  }
  return CHILD_SOURCE_DIRS.some((dirName) => existsSync(join(rootPath, dirName)));
};

const loadProjectOverride = (rootPath: string): Record<string, unknown> => {
  for (const fileName of PROJECT_OVERRIDE_FILES) {
    const candidate = resolvePath(rootPath, fileName);
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      return JSON.parse(readFileSync(candidate, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
};

const buildProjectAliases = (rootPath: string): readonly string[] => {
  const override = loadProjectOverride(rootPath);
  const aliases = [
    basename(rootPath),
    String(override.project_name ?? ""),
    String(override.project_slug ?? ""),
    resolveGitRemoteSlug(rootPath) ?? "",
  ]
    .map((value) => slugify(value))
    .filter(Boolean);
  return [...new Set(aliases)];
};

const resolveGitRemoteSlug = (rootPath: string): string | null => {
  try {
    const remote = execFileSync(
      "git",
      ["-C", rootPath, "remote", "get-url", "origin"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    if (!remote) {
      return null;
    }
    const tail = remote.replace(/\/+$/, "").split("/").at(-1) ?? "";
    const candidate = tail.includes(":") ? tail.split(":").at(-1) ?? tail : tail;
    const slug = slugify(candidate.replace(/\.git$/i, ""));
    return slug || null;
  } catch {
    return null;
  }
};

const resolveMemoryNamespace = (rootPath: string): string => {
  const override = loadProjectOverride(rootPath);
  const explicit = slugify(String(override.project_slug ?? ""));
  if (explicit) {
    return explicit;
  }
  const fallbackSlug = slugify(basename(rootPath)) || "project";
  return resolveGitRemoteSlug(rootPath) ?? fallbackSlug;
};

const scoreCandidate = (
  candidate: ProjectCandidate,
  hint: string,
): number => {
  const normalizedHint = slugify(hint);
  if (!normalizedHint) {
    return 0;
  }
  let score = 0;
  for (const alias of candidate.aliases) {
    if (alias === normalizedHint) {
      score = Math.max(score, 100);
      continue;
    }
    if (normalizedHint.includes(alias)) {
      score = Math.max(score, 80);
      continue;
    }
    if (alias.includes(normalizedHint)) {
      score = Math.max(score, 60);
    }
  }
  return score;
};

const discoverWorkspaceProjects = (
  rootPath: string,
  maxDepth = 3,
): readonly ProjectCandidate[] => {
  const seen = new Set<string>();
  const candidates: ProjectCandidate[] = [];
  const walk = (currentPath: string, depth: number): void => {
    if (depth > maxDepth) {
      return;
    }
    const directoryNames = listDirectoryNames(currentPath);
    for (const directoryName of directoryNames) {
      if (CHILD_PROJECT_SKIP_DIRS.has(directoryName)) {
        continue;
      }
      const nextPath = join(currentPath, directoryName);
      let stats;
      try {
        stats = statSync(nextPath);
      } catch {
        continue;
      }
      if (!stats.isDirectory()) {
        continue;
      }
      if (!seen.has(nextPath) && hasProjectSignals(nextPath)) {
        seen.add(nextPath);
        candidates.push({
          rootPath: nextPath,
          memoryNamespace: resolveMemoryNamespace(nextPath),
          aliases: buildProjectAliases(nextPath),
        });
        continue;
      }
      walk(nextPath, depth + 1);
    }
  };
  walk(rootPath, 1);
  return candidates;
};

const discoverGlobalProjects = (
  rootPath: string,
  maxDepth = 3,
): readonly ProjectCandidate[] => {
  const discovered: ProjectCandidate[] = [];
  const seen = new Set<string>();
  const walk = (currentPath: string, depth: number): void => {
    if (depth > maxDepth) {
      return;
    }
    const directoryNames = listDirectoryNames(currentPath);
    for (const directoryName of directoryNames) {
      if (CHILD_PROJECT_SKIP_DIRS.has(directoryName) || directoryName.startsWith(".Trash")) {
        continue;
      }
      const nextPath = join(currentPath, directoryName);
      if (seen.has(nextPath)) {
        continue;
      }
      if (hasProjectSignals(nextPath)) {
        seen.add(nextPath);
        discovered.push({
          rootPath: nextPath,
          memoryNamespace: resolveMemoryNamespace(nextPath),
          aliases: buildProjectAliases(nextPath),
        });
        continue;
      }
      walk(nextPath, depth + 1);
    }
  };
  walk(rootPath, 1);
  return discovered;
};

const rankProjectCandidates = (
  candidates: readonly ProjectCandidate[],
  hints: readonly string[],
): string | null => {
  if (hints.length === 0) {
    return candidates.length === 1 ? candidates[0]!.rootPath : null;
  }
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: Math.max(...hints.map((hint) => scoreCandidate(candidate, hint))),
    }))
    .filter((item) => item.score >= 60)
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.candidate.rootPath ?? null;
};

const resolveWorkspaceProjectRoot = (
  rootPath: string,
  options: ProjectResolutionOptions,
): string | null => {
  const hints = [options.projectHint, options.queryHint]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const workspaceMatch = rankProjectCandidates(
    discoverWorkspaceProjects(rootPath),
    hints,
  );
  if (workspaceMatch) {
    return workspaceMatch;
  }
  if (hints.length === 0) {
    return null;
  }
  if (!existsSync(DEFAULT_GLOBAL_PROJECT_ROOT)) {
    return null;
  }
  return rankProjectCandidates(
    discoverGlobalProjects(DEFAULT_GLOBAL_PROJECT_ROOT),
    hints,
  );
};

export const detectProjectIdentity = (
  cwd: string,
  host: string | null,
  options: ProjectResolutionOptions = {},
): ProjectIdentity => {
  const vcsRoot = resolveGitRoot(cwd);
  const resolvedCwd = resolvePath(cwd);
  const baseRoot = vcsRoot ?? resolvedCwd;
  const workspaceMatch =
    !vcsRoot || baseRoot === resolvedCwd
      ? resolveWorkspaceProjectRoot(baseRoot, options)
      : null;
  const rootPath = workspaceMatch ?? baseRoot;
  return {
    id: buildProjectId(rootPath),
    memoryNamespace: resolveMemoryNamespace(rootPath),
    rootPath,
    host,
    vcsRoot,
  };
};

const buildColdProvider = (project: ProjectIdentity) => {
  const providerName = (process.env.MEMORY_RUNTIME_COLD_PROVIDER ?? "memory-palace")
    .trim()
    .toLowerCase();
  const baseUrl = getMemoryPalaceBaseUrl();
  if (providerName === "none") {
    return null;
  }
  return createMemoryPalaceColdProviderFromConfig({
    baseUrl,
    timeoutMs: Number(process.env.MEMORY_RUNTIME_COLD_TIMEOUT_MS ?? 350),
    apiKey: process.env.MEMORY_RUNTIME_MP_API_KEY ?? null,
    apiKeyMode:
      process.env.MEMORY_RUNTIME_MP_API_KEY_MODE === "bearer" ? "bearer" : "header",
    promotionDomain: process.env.MEMORY_RUNTIME_MP_PROMOTION_DOMAIN ?? "projects",
    promotionParentPath:
      process.env.MEMORY_RUNTIME_MP_PROMOTION_PARENT_PATH ??
      project.memoryNamespace ??
      project.id,
  });
};

export const normalizeMode = (value: string | undefined): BootstrapMode => {
  if (value === "warm" || value === "cold") {
    return value;
  }
  return "fast";
};

export const createRuntimeServices = (
  cwd: string,
  host: string | null,
  options: ProjectResolutionOptions = {},
): RuntimeServices => {
  const project = detectProjectIdentity(cwd, host, options);
  const coldProvider = buildColdProvider(project);
  const hotClient = createSqliteHotMemoryClient({
    databasePath: resolveHotDatabasePath(),
  });
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    coldProvider,
    {
      coldQueryTimeoutMs: Number(process.env.MEMORY_RUNTIME_COLD_TIMEOUT_MS ?? 350),
    },
    hotClient.createObserver(),
  );
  return { project, hotClient, runtime, coldProvider };
};
