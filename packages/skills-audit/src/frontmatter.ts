const FRONTMATTER_DELIMITER = "---";
const TOP_LEVEL_KEY_PATTERN = /^([A-Za-z0-9_.-]+):\s*(.*)$/;
const MULTILINE_MARKERS = new Set([">", ">-", "|", "|-"]);

const flushValue = (
  values: Map<string, string>,
  currentKey: string | null,
  buffer: readonly string[],
): void => {
  if (!currentKey) {
    return;
  }
  const value = buffer.map((line) => line.trim()).filter(Boolean).join(" ").trim();
  values.set(currentKey, value);
};

const parseFrontmatterLines = (lines: readonly string[]): ReadonlyMap<string, string> => {
  const values = new Map<string, string>();
  let currentKey: string | null = null;
  let buffer: string[] = [];
  for (const line of lines) {
    if (currentKey && (line.startsWith(" ") || line.startsWith("\t"))) {
      buffer.push(line);
      continue;
    }
    flushValue(values, currentKey, buffer);
    currentKey = null;
    buffer = [];
    const match = TOP_LEVEL_KEY_PATTERN.exec(line);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (MULTILINE_MARKERS.has(value)) {
      currentKey = key;
      continue;
    }
    values.set(key, value.replace(/^['"]|['"]$/g, ""));
  }
  flushValue(values, currentKey, buffer);
  return values;
};

export const parseFrontmatter = (
  text: string,
): { readonly body: string; readonly values: ReadonlyMap<string, string>; readonly hasFrontmatter: boolean } => {
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== FRONTMATTER_DELIMITER) {
    return { body: text, values: new Map(), hasFrontmatter: false };
  }
  const endIndex = lines.slice(1).indexOf(FRONTMATTER_DELIMITER);
  if (endIndex < 0) {
    return { body: text, values: new Map(), hasFrontmatter: false };
  }
  const frontmatterLines = lines.slice(1, endIndex + 1);
  const body = lines.slice(endIndex + 2).join("\n");
  return {
    body,
    values: parseFrontmatterLines(frontmatterLines),
    hasFrontmatter: true,
  };
};

const quoteValue = (value: string): string =>
  /[:#'"`\n]/u.test(value) ? JSON.stringify(value) : value;

export const updateFrontmatterField = (
  text: string,
  fieldName: string,
  nextValue: string,
): string => {
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== FRONTMATTER_DELIMITER) {
    return text;
  }
  const endIndex = lines.slice(1).indexOf(FRONTMATTER_DELIMITER);
  if (endIndex < 0) {
    return text;
  }
  const closingIndex = endIndex + 1;
  const updatedLines = [...lines];
  const replacement = `${fieldName}: ${quoteValue(nextValue)}`;
  for (let index = 1; index < closingIndex; index += 1) {
    if (!updatedLines[index]?.startsWith(`${fieldName}:`)) {
      continue;
    }
    updatedLines[index] = replacement;
    return updatedLines.join("\n");
  }
  updatedLines.splice(closingIndex, 0, replacement);
  return updatedLines.join("\n");
};
