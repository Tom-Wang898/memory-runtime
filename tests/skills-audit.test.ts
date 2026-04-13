import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";

import {
  auditSkills,
  renderSkillsAuditMarkdown,
} from "../packages/skills-audit/src/index.ts";

const withEnv = async (
  values: Record<string, string | undefined>,
  callback: () => Promise<void> | void,
): Promise<void> => {
  const previousValues = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
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
    for (const [key, value] of Object.entries(previousValues)) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }
      process.env[key] = value;
    }
  }
};

const writeSkill = (
  rootPath: string,
  skillDirectory: string,
  contents: string,
): void => {
  const directoryPath = join(rootPath, skillDirectory);
  mkdirSync(directoryPath, { recursive: true });
  writeFileSync(join(directoryPath, "SKILL.md"), contents);
};

const writeReference = (
  rootPath: string,
  skillDirectory: string,
  fileName: string,
  contents: string,
): void => {
  const directoryPath = join(rootPath, skillDirectory, "references");
  mkdirSync(directoryPath, { recursive: true });
  writeFileSync(join(directoryPath, fileName), contents);
};

const buildFrontmatter = (name: string, description: string, status = "active"): string =>
  [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "triggers: alpha, beta",
    `status: ${status}`,
    "---",
  ].join("\n");

test("auditSkills reports token, duplicate, compatibility, and reference issues", () => {
  const rootPath = mkdtempSync(join(tmpdir(), "memory-runtime-skills-"));
  const heavyDescription = Array.from({ length: 45 }, (_, index) => `token${index}`).join(" ");
  const heavyBody = `TodoWrite ${"payload ".repeat(1900)}`;
  const sharedBody = "Shared body for duplicate hashing.\n";
  try {
    writeSkill(
      rootPath,
      "skill-a",
      `${buildFrontmatter("Alpha", heavyDescription, "lite")}\n${heavyBody}\n`,
    );
    writeSkill(
      rootPath,
      "skill-b",
      `${buildFrontmatter("Alpha", "short description")}\n${sharedBody}`,
    );
    writeSkill(
      rootPath,
      "skill-c",
      `${buildFrontmatter("Gamma", "another description")}\n${sharedBody}`,
    );
    writeReference(rootPath, "skill-a", "guide.md", "When: use for migration reviews\n");
    writeReference(
      rootPath,
      "skill-b",
      "guide.md",
      "When: use for search\nTopics: search, docs\n",
    );

    const report = auditSkills({ roots: [rootPath], limit: 10 });

    assert.equal(report.summary.skillCount, 3);
    assert.equal(report.summary.descriptionBudgetOverflowCount, 1);
    assert.equal(report.summary.heavySkillCount, 1);
    assert.equal(report.summary.duplicateNameGroupCount, 1);
    assert.equal(report.summary.duplicateBodyGroupCount, 1);
    assert.equal(report.summary.compatibilityIssueCount, 1);
    assert.equal(report.summary.referenceGapSkillCount, 1);
    assert.match(renderSkillsAuditMarkdown(report), /Duplicate Name Groups/);
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
});

test("auditSkills discovers roots from MEMORY_RUNTIME_SKILL_ROOTS", async () => {
  const existingRoot = mkdtempSync(join(tmpdir(), "memory-runtime-skills-env-"));
  const missingRoot = join(existingRoot, "missing");
  try {
    writeSkill(
      existingRoot,
      "skill-env",
      `${buildFrontmatter("EnvSkill", "env description")}\nBody\n`,
    );
    await withEnv(
      {
        MEMORY_RUNTIME_SKILL_ROOTS: [existingRoot, missingRoot].join(delimiter),
      },
      () => {
        const report = auditSkills();
        assert.deepEqual(report.discoveredRoots, [existingRoot]);
        assert.deepEqual(report.missingRoots, [missingRoot]);
        assert.equal(report.summary.skillCount, 1);
      },
    );
  } finally {
    rmSync(existingRoot, { recursive: true, force: true });
  }
});
