import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

interface PublicExportProfile {
  readonly name: string;
  readonly description: string;
  readonly sourcePlaceholder: string;
  readonly files: readonly string[];
  readonly buildDefaultRoots: (homeDirectory: string) => readonly string[];
}

interface ReplacementRule {
  readonly label: string;
  readonly needles: readonly string[];
  readonly replacement: string;
}

interface PublicExportRequest {
  readonly profileName: string;
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly dryRun?: boolean;
  readonly homeDirectory?: string;
}

interface ExportedFileRecord {
  readonly path: string;
  readonly replacementsApplied: number;
  readonly bytes: number;
}

interface PublicExportReport {
  readonly profile: string;
  readonly exportedFiles: readonly ExportedFileRecord[];
  readonly placeholderRoot: string;
  readonly manifestPath: string | null;
}

const MAC_PRIVATE_PATH_PATTERN = /\/Users\/[^/\s"'`]+/;
const LINUX_PRIVATE_PATH_PATTERN = /\/home\/[^/\s"'`]+/;
const WINDOWS_PRIVATE_PATH_PATTERN = /[A-Z]:\\Users\\[^\\\s"'`]+/i;

const PUBLIC_EXPORT_PROFILES = {
  "codex-project-memory": {
    name: "codex-project-memory",
    description:
      "Export project-memory scripts and docs from a Codex rules checkout.",
    sourcePlaceholder: "${CODEX_REPO_ROOT}",
    files: [
      "scripts/project_identity.py",
      "scripts/project_memory_bootstrap.py",
      "scripts/project_memory_context.py",
      "scripts/project_memory_optimize.py",
      "scripts/record_project_memory.py",
      "docs/project-memory-prompts.md",
      "docs/memory-palace-usage.md",
      "integrations/claude-rules-fused/local-rules/base/codex-workflow.md",
    ],
    buildDefaultRoots: (homeDirectory: string): readonly string[] => [
      `${homeDirectory}/Documents/codex`,
    ],
  },
  "memory-palace-project-tools": {
    name: "memory-palace-project-tools",
    description:
      "Export project-memory optimizer modules from a Memory Palace checkout.",
    sourcePlaceholder: "${MEMORY_PALACE_ROOT}",
    files: [
      "backend/project_memory_inventory.py",
      "backend/project_memory_digest.py",
      "backend/project_memory_merge.py",
      "backend/project_memory_relations.py",
      "backend/project_memory_optimizer.py",
      "backend/tests/test_project_memory_optimizer.py",
    ],
    buildDefaultRoots: (homeDirectory: string): readonly string[] => [
      `${homeDirectory}/Documents/Memory-Palace`,
    ],
  },
} satisfies Record<string, PublicExportProfile>;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizePathText = (value: string): string => value.replace(/\\/g, "/");

const uniq = (values: readonly string[]): readonly string[] =>
  Array.from(new Set(values.filter((value) => value.trim().length > 0)));

const listPublicExportProfiles = (): readonly PublicExportProfile[] =>
  Object.values(PUBLIC_EXPORT_PROFILES);

const getPublicExportProfile = (profileName: string): PublicExportProfile => {
  const profile = PUBLIC_EXPORT_PROFILES[profileName];
  if (!profile) {
    throw new Error(`Unsupported public-export profile: ${profileName}`);
  }
  return profile;
};

const ensureEmptyOutputRoot = (outputRoot: string): void => {
  if (!existsSync(outputRoot)) {
    mkdirSync(outputRoot, { recursive: true });
    return;
  }
  if (readdirSync(outputRoot).length > 0) {
    throw new Error(`Output root must be empty: ${outputRoot}`);
  }
};

const buildReplacementRules = (
  profile: PublicExportProfile,
  sourceRoot: string,
  homeDirectory: string,
): readonly ReplacementRule[] => {
  const normalizedHome = normalizePathText(homeDirectory);
  const normalizedSourceRoot = normalizePathText(sourceRoot);
  const defaultCodexRoot = `${normalizedHome}/Documents/codex`;
  const defaultMemoryPalaceRoot = `${normalizedHome}/Documents/Memory-Palace`;
  return [
    {
      label: "profile-root",
      needles: uniq([
        normalizedSourceRoot,
        ...profile.buildDefaultRoots(normalizedHome).map(normalizePathText),
      ]),
      replacement: profile.sourcePlaceholder,
    },
    {
      label: "codex-root",
      needles: uniq([defaultCodexRoot]),
      replacement: "${CODEX_REPO_ROOT}",
    },
    {
      label: "memory-palace-root",
      needles: uniq([defaultMemoryPalaceRoot]),
      replacement: "${MEMORY_PALACE_ROOT}",
    },
    {
      label: "codex-home",
      needles: uniq([`${normalizedHome}/.codex`]),
      replacement: "${HOME}/.codex",
    },
    {
      label: "claude-home",
      needles: uniq([`${normalizedHome}/.claude`]),
      replacement: "${HOME}/.claude",
    },
    {
      label: "gemini-home",
      needles: uniq([`${normalizedHome}/.gemini`]),
      replacement: "${HOME}/.gemini",
    },
    {
      label: "memory-runtime-home",
      needles: uniq([`${normalizedHome}/.memory-runtime`]),
      replacement: "${HOME}/.memory-runtime",
    },
    {
      label: "home-directory",
      needles: uniq([normalizedHome]),
      replacement: "${HOME}",
    },
  ];
};

const applyReplacements = (
  input: string,
  rules: readonly ReplacementRule[],
): { readonly output: string; readonly replacementsApplied: number } => {
  let output = input;
  let replacementsApplied = 0;
  for (const rule of rules) {
    for (const needle of rule.needles) {
      const pattern = new RegExp(escapeRegExp(needle), "g");
      const matchCount = output.match(pattern)?.length ?? 0;
      replacementsApplied += matchCount;
      output = output.replace(pattern, rule.replacement);
    }
  }
  return { output, replacementsApplied };
};

const validateSanitizedContent = (
  content: string,
  sourceRoot: string,
  homeDirectory: string,
): void => {
  const normalizedContent = normalizePathText(content);
  const normalizedSourceRoot = normalizePathText(sourceRoot);
  const normalizedHome = normalizePathText(homeDirectory);
  const hasLeak =
    normalizedContent.includes(normalizedSourceRoot) ||
    normalizedContent.includes(normalizedHome) ||
    MAC_PRIVATE_PATH_PATTERN.test(normalizedContent) ||
    LINUX_PRIVATE_PATH_PATTERN.test(normalizedContent) ||
    WINDOWS_PRIVATE_PATH_PATTERN.test(content);
  if (hasLeak) {
    throw new Error(
      "Sanitized export still contains a private absolute path marker.",
    );
  }
};

const resolveSourceFile = (
  sourceRoot: string,
  relativePath: string,
): string => {
  const absoluteSourceRoot = resolve(sourceRoot);
  const absoluteFilePath = resolve(sourceRoot, relativePath);
  if (!absoluteFilePath.startsWith(`${absoluteSourceRoot}/`)) {
    throw new Error(`Unsafe export path outside source root: ${relativePath}`);
  }
  return absoluteFilePath;
};

const writeManifest = (
  outputRoot: string,
  profile: PublicExportProfile,
  exportedFiles: readonly ExportedFileRecord[],
): string => {
  const manifestPath = join(outputRoot, "PUBLIC_EXPORT_MANIFEST.json");
  const manifest = {
    profile: profile.name,
    description: profile.description,
    placeholderRoot: profile.sourcePlaceholder,
    generatedAt: new Date().toISOString(),
    files: exportedFiles,
    notes: [
      "This manifest intentionally omits local absolute paths.",
      "Resolve placeholders in copied files before reuse.",
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
};

const exportPublicProfile = (
  request: PublicExportRequest,
): PublicExportReport => {
  const profile = getPublicExportProfile(request.profileName);
  const sourceRoot = resolve(request.sourceRoot);
  const outputRoot = resolve(request.outputRoot);
  const homeDirectory = request.homeDirectory ?? homedir();
  const rules = buildReplacementRules(profile, sourceRoot, homeDirectory);
  const exportedFiles: ExportedFileRecord[] = [];

  if (!request.dryRun) {
    ensureEmptyOutputRoot(outputRoot);
  }

  for (const relativePath of profile.files) {
    const sourceFilePath = resolveSourceFile(sourceRoot, relativePath);
    const rawContent = readFileSync(sourceFilePath, "utf8");
    const { output, replacementsApplied } = applyReplacements(rawContent, rules);
    validateSanitizedContent(output, sourceRoot, homeDirectory);
    exportedFiles.push({
      path: relativePath,
      replacementsApplied,
      bytes: Buffer.byteLength(output),
    });
    if (request.dryRun) {
      continue;
    }
    const outputFilePath = join(outputRoot, relativePath);
    mkdirSync(dirname(outputFilePath), { recursive: true });
    writeFileSync(outputFilePath, output);
  }

  return {
    profile: profile.name,
    exportedFiles,
    placeholderRoot: profile.sourcePlaceholder,
    manifestPath: request.dryRun
      ? null
      : writeManifest(outputRoot, profile, exportedFiles),
  };
};

export {
  exportPublicProfile,
  getPublicExportProfile,
  listPublicExportProfiles,
};
export type { PublicExportProfile, PublicExportReport, PublicExportRequest };
