import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve as resolvePath } from "node:path";
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

export interface RuntimeServices {
  readonly project: ProjectIdentity;
  readonly hotClient: ReturnType<typeof createSqliteHotMemoryClient>;
  readonly runtime: MemoryRuntime;
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

export const detectProjectIdentity = (
  cwd: string,
  host: string | null,
): ProjectIdentity => {
  const vcsRoot = resolveGitRoot(cwd);
  const rootPath = vcsRoot ?? resolvePath(cwd);
  return {
    id: buildProjectId(rootPath),
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
): RuntimeServices => {
  const project = detectProjectIdentity(cwd, host);
  const hotClient = createSqliteHotMemoryClient({
    databasePath: resolveHotDatabasePath(),
  });
  const runtime = new MemoryRuntime(
    createSqliteHotMemoryProvider(hotClient),
    buildColdProvider(project),
    {
      coldQueryTimeoutMs: Number(process.env.MEMORY_RUNTIME_COLD_TIMEOUT_MS ?? 350),
    },
    hotClient.createObserver(),
  );
  return { project, hotClient, runtime };
};
