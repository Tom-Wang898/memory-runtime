import { extname } from "node:path";

import { buildKeywordPhrase, extractPathKeywords } from "./keywords.ts";
import type { MutationOperation } from "./types.ts";

const WHEN_HINT_PATTERN =
  /(^|\n)\s*##\s*When\b|(^|\n)\s*When\s*:/iu;
const TOPICS_HINT_PATTERN =
  /(^|\n)\s*##\s*Topics\b|(^|\n)\s*Topics\s*:/iu;
const SUPPORTED_EXTENSIONS = new Set(["", ".md", ".mdx", ".txt"]);

const buildMetadataBlock = (
  keywords: readonly string[],
): string => {
  const phrase = buildKeywordPhrase(keywords);
  const topicLines = keywords.slice(0, 4).map((keyword) => `- ${keyword}`).join("\n");
  return [
    "## When",
    `- Use when you need reference material about ${phrase}.`,
    "",
    "## Topics",
    topicLines || "- reference",
    "",
  ].join("\n");
};

export const injectReferenceMetadata = ({
  filePath,
  skillName,
  content,
}: {
  readonly filePath: string;
  readonly skillName: string;
  readonly content: string;
}): { readonly content: string; readonly operation: MutationOperation | null } => {
  if (!SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase())) {
    return { content, operation: null };
  }
  if (WHEN_HINT_PATTERN.test(content) && TOPICS_HINT_PATTERN.test(content)) {
    return { content, operation: null };
  }
  const keywords = extractPathKeywords(filePath, skillName);
  return {
    content: `${buildMetadataBlock(keywords)}${content.trimStart()}`,
    operation: {
      kind: "reference-metadata-inject",
      detail: keywords.slice(0, 4).join(", ") || "reference",
    },
  };
};
