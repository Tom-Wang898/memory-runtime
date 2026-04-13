import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const readTextFile = (filePath: string): string => {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
};

export const writeTextFile = (
  filePath: string,
  content: string,
): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
};

export const hashText = (value: string): string =>
  createHash("sha1").update(value).digest("hex");
