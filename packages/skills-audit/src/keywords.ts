import { basename, dirname, sep } from "node:path";

const STOP_WORDS = new Set([
  "docs",
  "guide",
  "guides",
  "md",
  "readme",
  "reference",
  "references",
  "skill",
  "skills",
  "src",
  "the",
  "and",
  "for",
  "with",
  "when",
  "use",
]);

const splitWords = (value: string): readonly string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((part) => part.length > 1 && !STOP_WORDS.has(part));

const dedupe = (values: readonly string[]): readonly string[] =>
  [...new Set(values)];

export const extractPathKeywords = (
  filePath: string,
  skillName: string,
): readonly string[] => {
  const directoryParts = dirname(filePath).split(sep).slice(-3);
  const fileParts = splitWords(basename(filePath));
  const skillParts = splitWords(skillName);
  return dedupe(
    directoryParts
      .flatMap(splitWords)
      .concat(fileParts)
      .concat(skillParts),
  ).slice(0, 6);
};

export const buildKeywordPhrase = (keywords: readonly string[]): string =>
  keywords.slice(0, 4).join(" ").trim() || "the current skill";
