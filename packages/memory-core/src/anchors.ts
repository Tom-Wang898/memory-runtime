import type { ProjectCapsule } from "./contracts.js";

export type RecallQueryStrategy =
  | "none"
  | "direct"
  | "anchored"
  | "suppressed";

const AUTO_CHECKPOINT_PATTERNS = [
  /^automatic checkpoint from\b/i,
  /^hot memory capsule for\b/i,
];
const SHORT_REFERENCE_PATTERNS = [
  /(?:路线|线路|方案|版本|选项)\s*[ab12一二]/i,
  /^(?:[ab12一二])$/i,
  /^(?:继续|先做|先走|先看|先用|选|做|走|按)\b/,
  /(?:这个|那个|这条|那条|前一个|后一个|上一个|下一个|前者|后者|它)/,
  /\b(?:this|that|it|former|latter|route|plan|option)\b/i,
];
const MAX_QUERY_LENGTH = 48;
const MAX_ANCHOR_ITEMS = 4;
const MAX_ANCHOR_LENGTH = 280;

const normalizeText = (value: string | null | undefined): string =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const trimToLimit = (value: string, limit: number): string =>
  value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1)).trim()}…`;

const matchesAny = (value: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(value));

const shouldAnchorQuery = (query: string): boolean =>
  query.length <= MAX_QUERY_LENGTH && matchesAny(query, SHORT_REFERENCE_PATTERNS);

const dedupeLines = (items: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of items) {
    const normalized = normalizeText(item).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(normalizeText(item));
  }
  return unique;
};

const collectAnchorCandidates = (capsule: ProjectCapsule | null): readonly string[] => {
  if (!capsule) {
    return [];
  }
  const items = [
    sanitizeCheckpointSummary(capsule.summary),
    normalizeText(capsule.activeTask),
    ...capsule.recentDecisions.slice(0, 2).map((item) => normalizeText(item.summary)),
    ...capsule.openLoops.slice(0, 2).map((item) => normalizeText(item.summary)),
  ].filter(Boolean) as string[];
  return dedupeLines(items).slice(0, MAX_ANCHOR_ITEMS);
};

export const sanitizeCheckpointSummary = (
  summary: string | null | undefined,
): string | null => {
  const normalized = normalizeText(summary);
  if (!normalized || matchesAny(normalized, AUTO_CHECKPOINT_PATTERNS)) {
    return null;
  }
  return normalized;
};

export const buildScopedRecallQuery = (
  query: string | null | undefined,
  capsule: ProjectCapsule | null,
): { readonly strategy: RecallQueryStrategy; readonly query: string | null } => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return { strategy: "none", query: null };
  }
  if (!shouldAnchorQuery(normalizedQuery)) {
    return { strategy: "direct", query: normalizedQuery };
  }
  const anchor = collectAnchorCandidates(capsule).join(" | ");
  if (!anchor) {
    return { strategy: "suppressed", query: null };
  }
  return {
    strategy: "anchored",
    query: trimToLimit(
      `current_query: ${normalizedQuery}\nanchor: ${anchor}`,
      MAX_ANCHOR_LENGTH,
    ),
  };
};
