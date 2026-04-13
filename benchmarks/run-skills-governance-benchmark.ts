import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { benchmarkSkillsGovernance } from "../packages/skills-audit/src/index.ts";

const createFixtureSkillRoot = (): string => {
  const rootPath = mkdtempSync(join(tmpdir(), "memory-runtime-skills-benchmark-"));
  const skillDirectory = join(rootPath, "skill-demo");
  const referenceDirectory = join(skillDirectory, "references");
  mkdirSync(referenceDirectory, { recursive: true });
  writeFileSync(
    join(skillDirectory, "SKILL.md"),
    [
      "---",
      "name: demo-skill",
      `description: ${Array.from({ length: 50 }, (_, index) => `token${index}`).join(" ")}`,
      "triggers: demo, governance",
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
    "# Guide\n\nThis reference is missing routing metadata.\n",
    "utf8",
  );
  return rootPath;
};

const main = (): void => {
  const rootPath = createFixtureSkillRoot();
  try {
    const result = benchmarkSkillsGovernance({
      roots: [rootPath],
      host: "codex",
      limit: 20,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
};

main();
