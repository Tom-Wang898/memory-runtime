export const DEFAULT_DESCRIPTION_TOKEN_THRESHOLD = 48;
export const ENTRYPOINT_DESCRIPTION_TOKEN_THRESHOLD = 40;
export const HEAVY_SKILL_TOKEN_THRESHOLD = 1800;
export const DEFAULT_REPORT_LIMIT = 20;

export const DEFAULT_SKILL_ROOT_CANDIDATES = [
  "~/.codex/skills",
  "~/.claude/skills",
  "~/.gemini/skills",
  "~/.config/codex/skills",
  "~/.config/claude/skills",
  "~/.config/gemini/skills",
] as const;

export const TOKEN_PATTERN = /[A-Za-z0-9_]+|[\u4e00-\u9fff]|[^\s]/gu;
export const WHEN_HINT_PATTERN =
  /(^|\n)\s*(?:##\s*)?(when|when to use|trigger(?:\s+condition)?)(?:[ :#-]|\n|$)/i;
export const TOPICS_HINT_PATTERN =
  /(^|\n)\s*(?:##\s*)?(topics|keywords?)(?:[ :#-]|\n|$)/i;

export const HOST_SPECIFIC_PATTERNS = [
  ["skill-tool", /Use the `?Skill`? tool|invoke the skill tool|invoke Skill tool/i],
  ["task-tool", /\bTask tool\b|subagent_type\s*=/i],
  ["todo-write", /\bTodoWrite\b/i],
  [
    "claude-hooks",
    /\.claude\/hooks|UserPromptSubmit|PreToolUse(?!: async \(input\) =>)|skill-rules\.json|Stop event/i,
  ],
  [
    "host-tool-coupling",
    /allowed-tools:|`(?:Read|Glob|Grep|WebFetch)`|\b(?:Read|Glob|Grep|WebFetch)\s+tool\b/i,
  ],
] as const;

export const SKIP_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);
