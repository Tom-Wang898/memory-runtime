import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { auditSkills } from "./audit.ts";
import { applySkillsGovernance } from "./apply.ts";
import { resolveGovernanceHost } from "./profile.ts";
import type {
  SkillsAuditOptions,
  SkillsBenchmarkResult,
} from "./types.ts";

const copyRootsToSandbox = (
  roots: readonly string[],
): { readonly sandboxRoot: string; readonly copiedRoots: readonly string[] } => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "memory-runtime-skills-bench-"));
  const copiedRoots = roots.map((rootPath, index) => {
    const targetRoot = join(sandboxRoot, `${index}-${basename(rootPath)}`);
    cpSync(rootPath, targetRoot, { recursive: true });
    return targetRoot;
  });
  return { sandboxRoot, copiedRoots };
};

export const benchmarkSkillsGovernance = (
  options: SkillsAuditOptions = {},
): SkillsBenchmarkResult => {
  const before = auditSkills(options);
  if (before.discoveredRoots.length === 0) {
    throw new Error("No skill roots found. Pass --root <path> or set MEMORY_RUNTIME_SKILL_ROOTS.");
  }
  const host = resolveGovernanceHost(options.host);
  const { sandboxRoot, copiedRoots } = copyRootsToSandbox(before.discoveredRoots);
  try {
    const applyResult = applySkillsGovernance({
      roots: copiedRoots,
      host,
      limit: options.limit,
      snapshotPath: join(sandboxRoot, "snapshot.json"),
    });
    const after = auditSkills({
      roots: copiedRoots,
      host,
      limit: options.limit,
    });
    return {
      host,
      before,
      after,
      appliedChangeCount: applyResult.changedFileCount,
      manualReviewCount: applyResult.manualReviewCount,
      deltas: {
        descriptionBudgetOverflowDelta:
          after.summary.descriptionBudgetOverflowCount -
          before.summary.descriptionBudgetOverflowCount,
        heavySkillDelta:
          after.summary.heavySkillCount - before.summary.heavySkillCount,
        compatibilityIssueDelta:
          after.summary.compatibilityIssueCount -
          before.summary.compatibilityIssueCount,
        referenceGapSkillDelta:
          after.summary.referenceGapSkillCount -
          before.summary.referenceGapSkillCount,
      },
    };
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
};
