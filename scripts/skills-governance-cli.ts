import { writeFileSync } from "node:fs";

import {
  applySkillsGovernance,
  applyDuplicateResolutionFile,
  benchmarkSkillsGovernance,
  buildDuplicateResolutionFile,
  buildDuplicateResolutionReport,
  buildSkillsApplyPlan,
  renderDuplicateResolutionApplyMarkdown,
  renderDuplicateResolutionFileMarkdown,
  renderDuplicateResolutionMarkdown,
  renderSkillsApplyPlanMarkdown,
  renderSkillsApplyResultMarkdown,
  renderSkillsAuditMarkdown,
  renderSkillsBenchmarkMarkdown,
  renderSkillsRollbackMarkdown,
  rollbackSkillsGovernance,
  auditSkills,
} from "../packages/skills-audit/src/index.ts";

interface SkillsCliContext {
  readonly command: string;
  readonly getValue: (key: string) => string | undefined;
  readonly getValues: (key: string) => readonly string[];
  readonly hasFlag: (key: string) => boolean;
  readonly printOutput: (value: unknown, asJson: boolean) => void;
  readonly shouldOutputJson: boolean;
}

const writeOutputFile = (
  filePath: string | undefined,
  content: string,
): void => {
  if (!filePath) {
    return;
  }
  writeFileSync(filePath, content, "utf8");
};

const resolveLimit = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const resolveCommonOptions = (
  context: SkillsCliContext,
): { readonly host: string | undefined; readonly limit: number | undefined; readonly roots: readonly string[] } => ({
  host: context.getValue("host"),
  limit: resolveLimit(context.getValue("limit")),
  roots: context.getValues("root"),
});

const runSkillsAudit = (context: SkillsCliContext): void => {
  const report = auditSkills(resolveCommonOptions(context));
  if (report.discoveredRoots.length === 0) {
    throw new Error("No skill roots found. Pass --root <path> or set MEMORY_RUNTIME_SKILL_ROOTS.");
  }
  const markdown = renderSkillsAuditMarkdown(report);
  writeOutputFile(context.getValue("json-out"), `${JSON.stringify(report, null, 2)}\n`);
  writeOutputFile(context.getValue("markdown-out"), markdown);
  context.printOutput(context.shouldOutputJson ? report : markdown, context.shouldOutputJson);
};

const runSkillsApply = (context: SkillsCliContext): void => {
  const options = {
    ...resolveCommonOptions(context),
    snapshotPath: context.getValue("snapshot-out"),
  };
  if (context.hasFlag("dry-run") || context.command === "skills-plan") {
    const plan = buildSkillsApplyPlan(options);
    const markdown = renderSkillsApplyPlanMarkdown(plan);
    writeOutputFile(context.getValue("plan-out"), `${JSON.stringify(plan, null, 2)}\n`);
    context.printOutput(context.shouldOutputJson ? plan : markdown, context.shouldOutputJson);
    return;
  }
  const result = applySkillsGovernance(options);
  const markdown = renderSkillsApplyResultMarkdown(result);
  writeOutputFile(context.getValue("plan-out"), `${JSON.stringify(result.plan, null, 2)}\n`);
  context.printOutput(context.shouldOutputJson ? result : markdown, context.shouldOutputJson);
};

const runSkillsRollback = (context: SkillsCliContext): void => {
  const snapshotPath = context.getValue("snapshot");
  if (!snapshotPath) {
    throw new Error("skills-rollback requires --snapshot <path>.");
  }
  const result = rollbackSkillsGovernance({
    snapshotPath,
    force: context.hasFlag("force"),
  });
  const markdown = renderSkillsRollbackMarkdown(result);
  context.printOutput(context.shouldOutputJson ? result : markdown, context.shouldOutputJson);
};

const runSkillsBenchmark = (context: SkillsCliContext): void => {
  const result = benchmarkSkillsGovernance(resolveCommonOptions(context));
  const markdown = renderSkillsBenchmarkMarkdown(result);
  context.printOutput(context.shouldOutputJson ? result : markdown, context.shouldOutputJson);
};

const runSkillsDuplicates = (context: SkillsCliContext): void => {
  const options = resolveCommonOptions(context);
  const report = buildDuplicateResolutionReport(options);
  const template = buildDuplicateResolutionFile(options);
  const markdown = renderDuplicateResolutionMarkdown(report);
  writeOutputFile(
    context.getValue("decision-out"),
    `${JSON.stringify(template, null, 2)}\n`,
  );
  writeOutputFile(
    context.getValue("template-markdown-out"),
    renderDuplicateResolutionFileMarkdown(template),
  );
  context.printOutput(context.shouldOutputJson ? report : markdown, context.shouldOutputJson);
};

const runSkillsDuplicatesApply = (context: SkillsCliContext): void => {
  const decisionFilePath = context.getValue("decision-file");
  if (!decisionFilePath) {
    throw new Error("skills-duplicates-apply requires --decision-file <path>.");
  }
  const result = applyDuplicateResolutionFile({
    decisionFilePath,
    snapshotPath: context.getValue("snapshot-out"),
  });
  const markdown = renderDuplicateResolutionApplyMarkdown(result);
  context.printOutput(context.shouldOutputJson ? result : markdown, context.shouldOutputJson);
};

export const isSkillsGovernanceCommand = (command: string): boolean =>
  [
    "skills-audit",
    "skills-apply",
    "skills-plan",
    "skills-duplicates",
    "skills-duplicates-apply",
    "skills-rollback",
    "skills-benchmark",
  ].includes(command);

export const runSkillsGovernanceCommand = (
  context: SkillsCliContext,
): void => {
  if (context.command === "skills-audit") {
    runSkillsAudit(context);
    return;
  }
  if (context.command === "skills-apply" || context.command === "skills-plan") {
    runSkillsApply(context);
    return;
  }
  if (context.command === "skills-duplicates") {
    runSkillsDuplicates(context);
    return;
  }
  if (context.command === "skills-duplicates-apply") {
    runSkillsDuplicatesApply(context);
    return;
  }
  if (context.command === "skills-rollback") {
    runSkillsRollback(context);
    return;
  }
  runSkillsBenchmark(context);
};
