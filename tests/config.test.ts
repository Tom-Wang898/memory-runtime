import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { detectProjectIdentity, resolveMemoryPalaceBackendRoot } from "../scripts/config.ts";

const withEnv = async (
  values: Record<string, string | undefined>,
  callback: () => Promise<void> | void,
): Promise<void> => {
  const previousEntries = Object.entries(values).map(([key]) => [key, process.env[key]] as const);
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
  try {
    await callback();
  } finally {
    for (const [key, value] of previousEntries) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }
      process.env[key] = value;
    }
  }
};

const createBackendRoot = (parentPath: string): string => {
  const backendRoot = join(parentPath, "backend");
  mkdirSync(join(backendRoot, ".venv", "bin"), { recursive: true });
  writeFileSync(join(backendRoot, ".venv", "bin", "python"), "");
  writeFileSync(join(backendRoot, "main.py"), "app = object()\n");
  return backendRoot;
};

test("resolveMemoryPalaceBackendRoot returns configured backend root", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-config-"));
  const backendRoot = createBackendRoot(sandboxRoot);
  try {
    await withEnv(
      {
        MEMORY_RUNTIME_MP_BACKEND_ROOT: backendRoot,
        MEMORY_RUNTIME_ROOT: undefined,
      },
      () => {
        assert.equal(resolveMemoryPalaceBackendRoot(), backendRoot);
      },
    );
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});

test("resolveMemoryPalaceBackendRoot discovers sibling Memory-Palace backend", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-root-"));
  const runtimeRoot = join(sandboxRoot, "memory-runtime");
  const siblingRoot = join(sandboxRoot, "Memory-Palace");
  mkdirSync(runtimeRoot, { recursive: true });
  const backendRoot = createBackendRoot(siblingRoot);
  try {
    await withEnv(
      {
        MEMORY_RUNTIME_ROOT: runtimeRoot,
        MEMORY_RUNTIME_MP_BACKEND_ROOT: undefined,
      },
      () => {
        assert.equal(resolveMemoryPalaceBackendRoot(), backendRoot);
      },
    );
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});

test("resolveMemoryPalaceBackendRoot returns null when no backend is available", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-missing-"));
  try {
    await withEnv(
      {
        MEMORY_RUNTIME_ROOT: sandboxRoot,
        MEMORY_RUNTIME_MP_BACKEND_ROOT: undefined,
      },
      () => {
        assert.equal(resolveMemoryPalaceBackendRoot(), null);
      },
    );
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});

test("detectProjectIdentity derives memory namespace from override file", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-identity-"));
  try {
    writeFileSync(
      join(sandboxRoot, ".memory-palace-project.json"),
      JSON.stringify({ project_slug: "demo-manual-slug" }),
    );
    const identity = detectProjectIdentity(sandboxRoot, "codex");
    assert.equal(identity.memoryNamespace, "demo-manual-slug");
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});

test("detectProjectIdentity resolves a hinted child project inside a workspace root", async () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-workspace-"));
  const childRoot = join(sandboxRoot, "KeepFlow");
  try {
    writeFileSync(join(sandboxRoot, "AGENTS.md"), "# workspace\n");
    mkdirSync(join(childRoot, "src"), { recursive: true });
    writeFileSync(
      join(childRoot, ".memory-palace-project.json"),
      JSON.stringify({
        project_slug: "keepflow",
        project_name: "KeepFlow",
      }),
    );
    writeFileSync(join(childRoot, "package.json"), JSON.stringify({ name: "keepflow" }));

    const identity = detectProjectIdentity(sandboxRoot, "codex", {
      projectHint: "KeepFlow",
    });
    assert.equal(identity.rootPath, childRoot);
    assert.equal(identity.memoryNamespace, "keepflow");
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});
