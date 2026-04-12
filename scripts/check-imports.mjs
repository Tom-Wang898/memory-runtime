import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve as resolvePath } from "node:path";

const ROOT = process.cwd();
const PACKAGE_ALIASES = new Set([
  "@memory-runtime/memory-core",
  "@memory-runtime/hot-memory-sqlite",
  "@memory-runtime/cold-memory-memory-palace",
  "@memory-runtime/cold-memory-fixture",
  "@memory-runtime/host-codex",
  "@memory-runtime/host-claude",
  "@memory-runtime/mcp-bridge",
]);
const IMPORT_PATTERN = /from\s+["']([^"']+)["']/g;

const walk = (directory) =>
  readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    return statSync(fullPath).isDirectory() ? walk(fullPath) : [fullPath];
  });

const verifyRelativeImport = (filePath, specifier) => {
  if (!specifier.startsWith(".") || !specifier.endsWith(".js")) {
    return null;
  }
  const targetPath = resolvePath(dirname(filePath), specifier.replace(/\.js$/, ".ts"));
  return statSync(targetPath, { throwIfNoEntry: false }) ? null : `${filePath} -> ${specifier}`;
};

const verifyPackageAlias = (filePath, specifier) =>
  specifier.startsWith("@memory-runtime/") && !PACKAGE_ALIASES.has(specifier)
    ? `${filePath} -> ${specifier}`
    : null;

const collectErrors = (filePath) => {
  const source = readFileSync(filePath, "utf8");
  return [...source.matchAll(IMPORT_PATTERN)].flatMap((match) => {
    const specifier = match[1];
    return [verifyRelativeImport(filePath, specifier), verifyPackageAlias(filePath, specifier)].filter(Boolean);
  });
};

const files = walk(join(ROOT, "packages"))
  .concat(walk(join(ROOT, "scripts")))
  .concat(walk(join(ROOT, "tests")))
  .concat(walk(join(ROOT, "benchmarks")))
  .filter((filePath) => extname(filePath) === ".ts" || extname(filePath) === ".mjs");
const errors = files.flatMap(collectErrors);

if (errors.length > 0) {
  console.error("Import verification failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Import verification passed.");
