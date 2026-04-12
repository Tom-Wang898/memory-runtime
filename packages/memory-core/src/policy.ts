import type { BootstrapMode, CapsuleSectionKey, TokenBudget } from "./contracts.js";

export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  targetTokens: 900,
  hardLimitTokens: 1400,
};

export const CAPSULE_SECTION_PRIORITY: readonly CapsuleSectionKey[] = [
  "active_task",
  "open_loops",
  "recent_decisions",
  "working_set",
  "project_capsule",
];

export const resolveTokenBudget = (
  budget: Partial<TokenBudget> | undefined,
): TokenBudget => ({
  targetTokens: budget?.targetTokens ?? DEFAULT_TOKEN_BUDGET.targetTokens,
  hardLimitTokens: budget?.hardLimitTokens ?? DEFAULT_TOKEN_BUDGET.hardLimitTokens,
});

export const normalizeBootstrapMode = (
  mode: string | undefined,
): BootstrapMode => {
  if (mode === "warm" || mode === "cold") {
    return mode;
  }
  return "fast";
};
