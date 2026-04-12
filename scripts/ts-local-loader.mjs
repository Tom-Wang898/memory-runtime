import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGE_ENTRYPOINTS = {
  "@memory-runtime/memory-core": "packages/memory-core/src/index.ts",
  "@memory-runtime/hot-memory-sqlite": "packages/hot-memory-sqlite/src/index.ts",
  "@memory-runtime/cold-memory-memory-palace":
    "packages/cold-memory-memory-palace/src/index.ts",
  "@memory-runtime/cold-memory-fixture":
    "packages/cold-memory-fixture/src/index.ts",
  "@memory-runtime/host-codex": "packages/host-codex/src/index.ts",
  "@memory-runtime/host-claude": "packages/host-claude/src/index.ts",
  "@memory-runtime/mcp-bridge": "packages/mcp-bridge/src/index.ts",
};

const resolvePackageEntry = (specifier) => {
  const relativePath = PACKAGE_ENTRYPOINTS[specifier];
  if (!relativePath) {
    return null;
  }
  return pathToFileURL(resolvePath(REPO_ROOT, relativePath)).href;
};

const resolveRelativeTypeScript = (specifier, parentUrl) => {
  if (!specifier.startsWith(".") || !specifier.endsWith(".js") || !parentUrl) {
    return null;
  }
  const parentPath = fileURLToPath(parentUrl);
  const typeScriptPath = resolvePath(
    dirname(parentPath),
    specifier.replace(/\.js$/, ".ts"),
  );
  return existsSync(typeScriptPath) ? pathToFileURL(typeScriptPath).href : null;
};

export const resolve = async (specifier, context, defaultResolve) => {
  const packageEntry = resolvePackageEntry(specifier);
  if (packageEntry) {
    return { shortCircuit: true, url: packageEntry };
  }

  const typeScriptUrl = resolveRelativeTypeScript(specifier, context.parentURL);
  if (typeScriptUrl) {
    return { shortCircuit: true, url: typeScriptUrl };
  }

  return defaultResolve(specifier, context, defaultResolve);
};
