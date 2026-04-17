export type ContextRoute = "primer" | "continuity" | "bootstrap";

export interface ContextRouteDecision {
  readonly route: ContextRoute;
  readonly reason:
    | "no_query"
    | "continuation_query"
    | "topic_shift_query"
    | "deep_history_query"
    | "explicit_query";
  readonly normalizedQuery: string | null;
}

const CONTINUATION_PATTERNS = [
  /^(?:继续|接着|接着做|下一步|后面的|刚才那个|按刚才|别动这个|先做这个|先别动|照这个做)/i,
  /^(?:continue|next step|keep going|go on|that one|this one|do the rest)/i,
  /(?:路线|线路|方案|版本|选项)\s*[ab12一二]/i,
  /\b(?:route|plan|option)\s*[ab12]\b/i,
  /(?:这个|那个|这条|那条|前一个|后一个|上一个|下一个|前者|后者|它)/,
];

const DEEP_HISTORY_PATTERNS = [
  /^(?:你知道什么|你已知什么|先说你知道的|先说已知背景)/i,
  /^(?:what do you know|what do you already know|summari[sz]e what you know)/i,
  /(?:背景|已知|历史|之前|为什么|原因|决策|runbook|issue|bug|故障|复盘)/i,
  /\b(?:history|decision|runbook|issue|bug|why)\b/i,
];

const TOPIC_SHIFT_PATTERNS = [
  /^(?:先回到|回到|现在回到|回头看|切回|切到|转到|转回|另外|换个问题|回到文档|先看文档|先处理文档)/i,
  /^(?:back to|switch to|return to|move to|another question|new question)/i,
  /(?:文档|标题|README|发布说明|方案|计划|标题可能需要修改)/i,
];

const MAX_CONTINUATION_QUERY_LENGTH = 64;

const normalizeQuery = (query: string | null | undefined): string | null => {
  const normalized = String(query ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
};

const matchesAny = (value: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(value));

export const decideContextRoute = (
  query: string | null | undefined,
): ContextRouteDecision => {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return { route: "primer", reason: "no_query", normalizedQuery: null };
  }

  if (matchesAny(normalizedQuery, DEEP_HISTORY_PATTERNS)) {
    return {
      route: "bootstrap",
      reason: "deep_history_query",
      normalizedQuery,
    };
  }

  if (matchesAny(normalizedQuery, TOPIC_SHIFT_PATTERNS)) {
    return {
      route: "bootstrap",
      reason: "topic_shift_query",
      normalizedQuery,
    };
  }

  if (
    normalizedQuery.length <= MAX_CONTINUATION_QUERY_LENGTH &&
    matchesAny(normalizedQuery, CONTINUATION_PATTERNS)
  ) {
    return {
      route: "continuity",
      reason: "continuation_query",
      normalizedQuery,
    };
  }

  return {
    route: "bootstrap",
    reason: "explicit_query",
    normalizedQuery,
  };
};
