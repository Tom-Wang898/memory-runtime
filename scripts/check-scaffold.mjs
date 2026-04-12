import { readFileSync, existsSync } from "node:fs";

const requiredPaths = [
  "README.md",
  "docs/ARCHITECTURE.md",
  "docs/DATA_CONTRACTS.md",
  "docs/ROADMAP.md",
  "packages/memory-core/src/index.ts",
  "packages/hot-memory-sqlite/src/index.ts",
  "packages/cold-memory-memory-palace/src/index.ts",
  "packages/cold-memory-fixture/src/index.ts",
  "packages/host-codex/src/index.ts",
  "packages/host-claude/src/index.ts",
  "packages/mcp-bridge/src/index.ts",
];

const missingPaths = requiredPaths.filter((path) => !existsSync(path));

if (missingPaths.length > 0) {
  console.error("Missing scaffold files:");
  for (const path of missingPaths) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
if (!Array.isArray(rootPackage.workspaces) || rootPackage.workspaces.length === 0) {
  console.error("Root package.json is missing workspaces.");
  process.exit(1);
}

console.log("Scaffold check passed.");
