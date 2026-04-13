import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyDuplicateResolutionFile,
  applySkillsGovernance,
  auditSkills,
  benchmarkSkillsGovernance,
  buildDuplicateResolutionFile,
  buildDuplicateResolutionReport,
  buildSkillsApplyPlan,
  rollbackSkillsGovernance,
} from "../packages/skills-audit/src/index.ts";

const writeSkillTree = (rootPath: string): void => {
  const skillDirectory = join(rootPath, "skill-a");
  const referenceDirectory = join(skillDirectory, "references");
  mkdirSync(referenceDirectory, { recursive: true });
  writeFileSync(
    join(skillDirectory, "SKILL.md"),
    [
      "---",
      "name: Alpha",
      `description: ${Array.from({ length: 48 }, (_, index) => `token${index}`).join(" ")}`,
      "triggers: alpha, beta",
      "status: lite",
      "---",
      "",
      "Use the `Skill` tool and TodoWrite before editing files.",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(referenceDirectory, "guide.md"),
    "# Guide\n\nReference body without routing metadata.\n",
    "utf8",
  );
};

const writeDuplicateSkillTree = (rootPath: string): void => {
  const primaryDirectory = join(rootPath, "brainstorming");
  const managedDirectory = join(rootPath, "skillio-managed", "brainstorming-copy");
  mkdirSync(primaryDirectory, { recursive: true });
  mkdirSync(managedDirectory, { recursive: true });
  const content = [
    "---",
    "name: brainstorming",
    "description: duplicate demo",
    "triggers: brainstorm",
    "status: active",
    "---",
    "",
    "Shared duplicate body.",
    "",
  ].join("\n");
  writeFileSync(join(primaryDirectory, "SKILL.md"), content, "utf8");
  writeFileSync(join(managedDirectory, "SKILL.md"), content, "utf8");
};

test("buildSkillsApplyPlan plans safe transforms and manual review stays separate", () => {
  const rootPath = mkdtempSync(join(tmpdir(), "memory-runtime-skills-plan-"));
  try {
    writeSkillTree(rootPath);
    const plan = buildSkillsApplyPlan({
      roots: [rootPath],
      host: "codex",
      limit: 20,
    });
    assert.equal(plan.fileChanges.length, 2);
    assert.equal(plan.manualReview.length, 0);
    const operationKinds = plan.fileChanges.flatMap((change) =>
      change.operations.map((item) => item.kind),
    );
    assert.match(
      operationKinds.join(","),
      /description-trim|host-compat-rewrite/,
    );
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
});

test("applySkillsGovernance writes snapshot and rollback restores original content", () => {
  const rootPath = mkdtempSync(join(tmpdir(), "memory-runtime-skills-apply-"));
  const snapshotPath = join(rootPath, "snapshot.json");
  const skillPath = join(rootPath, "skill-a", "SKILL.md");
  try {
    writeSkillTree(rootPath);
    const before = auditSkills({ roots: [rootPath], host: "codex", limit: 20 });
    const applyResult = applySkillsGovernance({
      roots: [rootPath],
      host: "codex",
      snapshotPath,
      limit: 20,
    });
    const after = auditSkills({ roots: [rootPath], host: "codex", limit: 20 });
    assert.equal(applyResult.changedFileCount, 2);
    assert.equal(applyResult.operationCounts.descriptionTrimCount, 1);
    assert.equal(applyResult.operationCounts.hostCompatRewriteCount, 1);
    assert.equal(applyResult.operationCounts.referenceMetadataInjectCount, 1);
    assert.ok(after.summary.descriptionBudgetOverflowCount < before.summary.descriptionBudgetOverflowCount);
    assert.ok(after.summary.compatibilityIssueCount < before.summary.compatibilityIssueCount);
    assert.ok(applyResult.auditDelta.deltas.descriptionBudgetOverflowDelta < 0);
    assert.ok(applyResult.auditDelta.deltas.compatibilityIssueDelta < 0);
    assert.ok(applyResult.auditDelta.deltas.referenceGapSkillDelta < 0);
    const rollbackResult = rollbackSkillsGovernance({ snapshotPath });
    const restored = auditSkills({ roots: [rootPath], host: "codex", limit: 20 });
    assert.equal(rollbackResult.restoredFileCount, 2);
    assert.equal(restored.summary.descriptionBudgetOverflowCount, before.summary.descriptionBudgetOverflowCount);
    assert.equal(restored.summary.compatibilityIssueCount, before.summary.compatibilityIssueCount);
    assert.match(readFileSync(skillPath, "utf8"), /TodoWrite/);
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
});

test("rollbackSkillsGovernance reports conflicts when files drift after apply", () => {
  const rootPath = mkdtempSync(join(tmpdir(), "memory-runtime-skills-conflict-"));
  const snapshotPath = join(rootPath, "snapshot.json");
  const skillPath = join(rootPath, "skill-a", "SKILL.md");
  try {
    writeSkillTree(rootPath);
    applySkillsGovernance({
      roots: [rootPath],
      host: "codex",
      snapshotPath,
      limit: 20,
    });
    writeFileSync(skillPath, `${readFileSync(skillPath, "utf8")}\n# drift\n`, "utf8");
    const rollbackResult = rollbackSkillsGovernance({ snapshotPath });
    assert.equal(rollbackResult.restoredFileCount, 0);
    assert.equal(rollbackResult.conflicts.length, 1);
    const forced = rollbackSkillsGovernance({ snapshotPath, force: true });
    assert.equal(forced.restoredFileCount, 2);
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
});

test("duplicate resolution file prefers non-managed keep path and quarantines selected duplicates", () => {
  const rootPath = mkdtempSync(join(tmpdir(), "memory-runtime-duplicates-"));
  const decisionFilePath = join(rootPath, "duplicate-decisions.json");
  try {
    writeDuplicateSkillTree(rootPath);
    const file = buildDuplicateResolutionFile({
      roots: [rootPath],
      host: "codex",
    });
    assert.equal(file.decisions.length, 2);
    assert.equal(
      file.decisions[0]?.keepPath.includes("/skillio-managed/"),
      false,
    );
    assert.equal(file.decisions[0]?.action, "quarantine");
    assert.match(file.decisions[0]?.reason ?? "", /Prefer/);
    const report = buildDuplicateResolutionReport({
      roots: [rootPath],
      host: "codex",
    });
    assert.equal(report.groups[0]?.pathDetails.length, 2);
    assert.equal(report.groups[0]?.riskLevel, "medium");
    assert.match(report.groups[0]?.riskReason ?? "", /mixed managed and non-managed copies/);
    assert.equal(
      report.groups[0]?.pathDetails.some((detail) => detail.isManaged),
      true,
    );
    assert.equal(
      report.groups[0]?.pathDetails.every((detail) => typeof detail.riskTag === "string"),
      true,
    );
    writeFileSync(decisionFilePath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    const result = applyDuplicateResolutionFile({
      decisionFilePath,
      snapshotPath: join(rootPath, "duplicate-snapshot.json"),
    });
    assert.equal(result.changedFileCount, 1);
    assert.equal(result.operationCounts.duplicateQuarantineCount, 1);
    assert.ok(result.auditDelta.deltas.duplicateNameGroupDelta < 0);
    assert.ok(result.auditDelta.deltas.duplicateBodyGroupDelta < 0);
    const managedContent = readFileSync(
      join(rootPath, "skillio-managed", "brainstorming-copy", "SKILL.md"),
      "utf8",
    );
    assert.match(managedContent, /status: quarantined/);
    assert.match(managedContent, /replaced_by:/);
    assert.match(managedContent, /notes:/);
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
});

test("duplicate resolution skip action leaves duplicate files unchanged", () => {
  const rootPath = mkdtempSync(join(tmpdir(), "memory-runtime-duplicates-skip-"));
  const decisionFilePath = join(rootPath, "duplicate-decisions-skip.json");
  const managedPath = join(rootPath, "skillio-managed", "brainstorming-copy", "SKILL.md");
  try {
    writeDuplicateSkillTree(rootPath);
    const file = buildDuplicateResolutionFile({
      roots: [rootPath],
      host: "codex",
    });
    const skipped = {
      ...file,
      decisions: file.decisions.map((decision) => ({
        ...decision,
        action: "skip" as const,
      })),
    };
    writeFileSync(decisionFilePath, `${JSON.stringify(skipped, null, 2)}\n`, "utf8");
    const result = applyDuplicateResolutionFile({
      decisionFilePath,
      snapshotPath: join(rootPath, "duplicate-skip-snapshot.json"),
    });
    assert.equal(result.changedFileCount, 0);
    assert.equal(result.skippedDecisions.length, skipped.decisions.length);
    assert.equal(result.operationCounts.duplicateQuarantineCount, 0);
    assert.equal(result.auditDelta.deltas.duplicateNameGroupDelta, 0);
    assert.doesNotMatch(readFileSync(managedPath, "utf8"), /status: quarantined/);
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
});

test("benchmarkSkillsGovernance measures post-apply improvements in sandbox", () => {
  const rootPath = mkdtempSync(join(tmpdir(), "memory-runtime-skills-bench-"));
  try {
    writeSkillTree(rootPath);
    const result = benchmarkSkillsGovernance({
      roots: [rootPath],
      host: "codex",
      limit: 20,
    });
    assert.equal(result.appliedChangeCount, 2);
    assert.ok(result.deltas.descriptionBudgetOverflowDelta < 0);
    assert.ok(result.deltas.compatibilityIssueDelta < 0);
    assert.ok(result.deltas.referenceGapSkillDelta < 0);
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
});
