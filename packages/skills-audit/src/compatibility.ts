import type { MutationOperation } from "./types.ts";

interface RewriteRule {
  readonly label: string;
  readonly pattern: RegExp;
  readonly replacement: string;
}

const REWRITE_RULES: readonly RewriteRule[] = [
  {
    label: "todowrite",
    pattern: /\bTodoWrite\b/gu,
    replacement: "the current host's task tracking mechanism",
  },
  {
    label: "skill-tool",
    pattern: /`?Skill`?\s+tool|skill tool/giu,
    replacement: "the current host's skill mechanism",
  },
  {
    label: "claude-hooks",
    pattern: /\.claude\/hooks|UserPromptSubmit|PreToolUse|skill-rules\.json/gu,
    replacement: "host-specific hook integration",
  },
  {
    label: "host-tool-names",
    pattern: /`(?:Read|Glob|Grep|WebFetch)`|\b(?:Read|Glob|Grep|WebFetch)\s+tool\b/gu,
    replacement: "the current host's file, search, or web tools",
  },
];

const applyRule = (
  content: string,
  rule: RewriteRule,
): { readonly content: string; readonly matched: boolean } => {
  rule.pattern.lastIndex = 0;
  if (!rule.pattern.test(content)) {
    return { content, matched: false };
  }
  rule.pattern.lastIndex = 0;
  return {
    content: content.replace(rule.pattern, rule.replacement),
    matched: true,
  };
};

export const applyCompatibilityRewrite = (
  content: string,
): { readonly content: string; readonly operation: MutationOperation | null } => {
  let nextContent = content;
  const matchedRules: string[] = [];
  for (const rule of REWRITE_RULES) {
    const result = applyRule(nextContent, rule);
    if (!result.matched) {
      continue;
    }
    nextContent = result.content;
    matchedRules.push(rule.label);
  }
  if (matchedRules.length === 0) {
    return { content, operation: null };
  }
  return {
    content: nextContent,
    operation: {
      kind: "host-compat-rewrite",
      detail: matchedRules.join(", "),
    },
  };
};
