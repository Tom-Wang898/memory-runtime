import type { FactHit, PromotionRecord } from "@memory-runtime/memory-core";

const DEFAULT_TIMEOUT_MS = 350;

export interface MemoryPalaceHttpClientConfig {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly apiKey?: string | null;
  readonly apiKeyMode?: "header" | "bearer";
  readonly promotionDomain?: string;
  readonly promotionParentPath?: string;
}

interface SearchResponse {
  readonly results?: readonly Record<string, unknown>[];
}

interface BrowseNodeResponse {
  readonly node?: Record<string, unknown>;
}

const createHeaders = (
  config: MemoryPalaceHttpClientConfig,
  contentType = true,
): Headers => {
  const headers = new Headers();
  if (contentType) {
    headers.set("content-type", "application/json");
  }
  if (!config.apiKey) {
    return headers;
  }
  if (config.apiKeyMode === "bearer") {
    headers.set("authorization", `Bearer ${config.apiKey}`);
    return headers;
  }
  headers.set("x-mcp-api-key", config.apiKey);
  return headers;
};

const withTimeout = async (
  config: MemoryPalaceHttpClientConfig,
  input: string,
  init: RequestInit,
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const buildUrl = (config: MemoryPalaceHttpClientConfig, path: string): string =>
  new URL(path, config.baseUrl.endsWith("/") ? config.baseUrl : `${config.baseUrl}/`).toString();

const toFactHit = (item: Record<string, unknown>): FactHit => ({
  id: String(item.memory_id ?? item.uri ?? item.path ?? crypto.randomUUID()),
  summary: String(item.snippet ?? item.preview ?? item.name ?? ""),
  sourceUri: String(item.uri ?? ""),
  score: Number(item.score ?? 0),
});

const trimText = (value: string, limit: number): string => {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
};

const toPrimerFactHit = (item: Record<string, unknown>): FactHit | null => {
  const uri = String(item.uri ?? "").trim();
  if (!uri) {
    return null;
  }
  const gistText = String(item.gist_text ?? "").trim();
  const content = String(item.content ?? "").trim();
  const summary = trimText(gistText || content, 240);
  if (!summary) {
    return null;
  }
  return {
    id: uri,
    summary,
    sourceUri: uri,
    score: 1,
  };
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "memory-runtime-promotion";

const buildPromotionContent = (record: PromotionRecord): string => {
  const facts = record.facts.map((item) => `- ${item}`).join("\n");
  return `# ${record.title}\n\n## Summary\n${record.summary}\n\n## Facts\n${facts || "- (no facts)"}\n`;
};

const readJson = async (response: Response): Promise<Record<string, unknown>> => {
  const payload = (await response.json()) as Record<string, unknown>;
  return payload;
};

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = await readJson(response);
    const detail = payload.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (detail && typeof detail === "object") {
      return JSON.stringify(detail);
    }
    return JSON.stringify(payload);
  } catch {
    return response.statusText || `http_${response.status}`;
  }
};

const searchViaMaintenance = async (
  config: MemoryPalaceHttpClientConfig,
  query: string,
  resultView: string,
  scopeHint: string,
): Promise<readonly FactHit[]> => {
  const response = await withTimeout(config, buildUrl(config, "/maintenance/observability/search"), {
    method: "POST",
    headers: createHeaders(config),
    body: JSON.stringify({
      query,
      mode: "hybrid",
      max_results: 4,
      candidate_multiplier: 4,
      include_session: false,
      result_view: resultView,
      scope_hint: scopeHint,
    }),
  });
  if (!response.ok) {
    return [];
  }
  const payload = (await readJson(response)) as SearchResponse;
  const results = Array.isArray(payload.results) ? payload.results : [];
  return results
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => toFactHit(item))
    .filter((item) => item.summary.trim().length > 0);
};

const readBrowseNode = async (
  config: MemoryPalaceHttpClientConfig,
  domain: string,
  path: string,
): Promise<Record<string, unknown> | null> => {
  const url = buildUrl(
    config,
    `/browse/node?domain=${encodeURIComponent(domain)}&path=${encodeURIComponent(path)}`,
  );
  const response = await withTimeout(config, url, {
    method: "GET",
    headers: createHeaders(config, false),
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await readJson(response)) as BrowseNodeResponse;
  if (!payload.node || typeof payload.node !== "object") {
    return null;
  }
  return payload.node;
};

const readProjectPrimer = async (
  config: MemoryPalaceHttpClientConfig,
  projectId: string,
): Promise<readonly FactHit[]> => {
  const domain = config.promotionDomain ?? "projects";
  const digestNode = await readBrowseNode(config, domain, `${projectId}/digest/current`);
  const anchorNode = await readBrowseNode(config, domain, `${projectId}/anchors/current`);
  const overviewNode = digestNode
    ? null
    : await readBrowseNode(config, domain, `${projectId}/overview`);
  return [digestNode, anchorNode, overviewNode]
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => toPrimerFactHit(item))
    .filter((item): item is FactHit => Boolean(item));
};

const loadExistingPromotionPath = async (
  config: MemoryPalaceHttpClientConfig,
  domain: string,
  path: string,
): Promise<boolean> => {
  const url = buildUrl(
    config,
    `/browse/node?domain=${encodeURIComponent(domain)}&path=${encodeURIComponent(path)}`,
  );
  const response = await withTimeout(config, url, {
    method: "GET",
    headers: createHeaders(config, false),
  });
  return response.ok;
};

const createNode = async (
  config: MemoryPalaceHttpClientConfig,
  domain: string,
  parentPath: string,
  title: string,
  content: string,
): Promise<void> => {
  const response = await withTimeout(config, buildUrl(config, "/browse/node"), {
    method: "POST",
    headers: createHeaders(config),
    body: JSON.stringify({
      domain,
      parent_path: parentPath,
      title,
      content,
      priority: 2,
    }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
};

const ensurePromotionNamespace = async (
  config: MemoryPalaceHttpClientConfig,
  domain: string,
  parentPath: string,
): Promise<void> => {
  const segments = parentPath.split("/").filter(Boolean);
  let currentPath = "";
  for (const segment of segments) {
    const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
    const exists = await loadExistingPromotionPath(config, domain, nextPath);
    if (!exists) {
      await createNode(
        config,
        domain,
        currentPath,
        segment,
        `Namespace node for ${nextPath}`,
      );
    }
    currentPath = nextPath;
  }
};

const writePromotion = async (
  config: MemoryPalaceHttpClientConfig,
  domain: string,
  path: string,
  record: PromotionRecord,
): Promise<void> => {
  const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const title = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
  if (parentPath) {
    await ensurePromotionNamespace(config, domain, parentPath);
  }
  const exists = await loadExistingPromotionPath(config, domain, path);
  if (exists) {
    const response = await withTimeout(
      config,
      buildUrl(
        config,
        `/browse/node?domain=${encodeURIComponent(domain)}&path=${encodeURIComponent(path)}`,
      ),
      {
        method: "PUT",
        headers: createHeaders(config),
        body: JSON.stringify({ content: buildPromotionContent(record) }),
      },
    );
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    return;
  }
  await createNode(config, domain, parentPath, title, buildPromotionContent(record));
};

export interface MemoryPalaceClient {
  readProjectPrimer(projectId: string): Promise<readonly FactHit[]>;
  searchFacts(projectId: string, query: string): Promise<readonly FactHit[]>;
  searchGists(projectId: string, query: string): Promise<readonly FactHit[]>;
  promote(record: PromotionRecord): Promise<void>;
}

export const createMemoryPalaceHttpClient = (
  config: MemoryPalaceHttpClientConfig,
): MemoryPalaceClient => ({
  readProjectPrimer: async (projectId) => readProjectPrimer(config, projectId),
  searchFacts: async (projectId, query) =>
    searchViaMaintenance(config, query, "snippet", `projects://${projectId}`),
  searchGists: async (projectId, query) =>
    searchViaMaintenance(config, query, "gist_preferred", `projects://${projectId}`),
  promote: async (record) =>
    writePromotion(
      config,
      config.promotionDomain ?? "projects",
      `${config.promotionParentPath ?? `${record.projectId}`}/${slugify(record.title)}`,
      record,
    ),
});
