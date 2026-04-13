import { TOKEN_PATTERN } from "./constants.ts";
import { parseFrontmatter, updateFrontmatterField } from "./frontmatter.ts";
import { getTargetDescriptionThreshold } from "./profile.ts";
import type { GovernanceProfile, MutationOperation, SkillRecord } from "./types.ts";

const DESCRIPTION_BREAK_PATTERN =
  /(?<=[.;])\s+|,\s+(?:especially|including|notably|mainly|primarily)\s+/iu;

const countTokens = (value: string): number =>
  [...value.matchAll(TOKEN_PATTERN)].length;

const trimTokens = (
  value: string,
  limit: number,
): string => {
  const matches = [...value.matchAll(TOKEN_PATTERN)];
  const lastMatch = matches.at(limit - 1);
  if (!lastMatch?.index) {
    return value.trim();
  }
  return value.slice(0, lastMatch.index + lastMatch[0].length).trim();
};

const normalizeDescription = (value: string): string =>
  value.replace(/\s+/gu, " ").trim();

const compactDescription = (
  description: string,
  limit: number,
): string => {
  const segments = normalizeDescription(description).split(DESCRIPTION_BREAK_PATTERN);
  let nextValue = "";
  for (const segment of segments) {
    const candidate = nextValue ? `${nextValue}. ${segment.trim()}` : segment.trim();
    if (countTokens(candidate) > limit && nextValue) {
      break;
    }
    nextValue = candidate;
    if (countTokens(candidate) >= limit) {
      break;
    }
  }
  return trimTokens(nextValue || description, limit).replace(/[,:;.-]+$/u, "");
};

export const applyDescriptionTrim = ({
  record,
  profile,
  content,
}: {
  readonly record: SkillRecord;
  readonly profile: GovernanceProfile;
  readonly content: string;
}): { readonly content: string; readonly operation: MutationOperation | null } => {
  const parsed = parseFrontmatter(content);
  if (!parsed.hasFrontmatter || !record.description) {
    return { content, operation: null };
  }
  const limit = getTargetDescriptionThreshold(record, profile);
  if (countTokens(record.description) <= limit) {
    return { content, operation: null };
  }
  const nextDescription = compactDescription(record.description, limit);
  if (!nextDescription || nextDescription === record.description) {
    return { content, operation: null };
  }
  return {
    content: updateFrontmatterField(content, "description", nextDescription),
    operation: {
      kind: "description-trim",
      detail: `${countTokens(record.description)} -> ${countTokens(nextDescription)} tokens`,
    },
  };
};
