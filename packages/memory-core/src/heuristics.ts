import type { BootstrapRiskLevel, CapsuleRequest } from "./contracts.js";

const HIGH_RISK_PATTERNS = [
  /\bdo not\b/i,
  /\bdon't\b/i,
  /\bonly\b/i,
  /\bmust\b/i,
  /\bexact\b/i,
  /\bmigration\b/i,
  /\bdatabase\b/i,
  /\bsecurity\b/i,
  /\bauth\b/i,
  /不要/,
  /只能/,
  /必须/,
  /别改/,
];

const CONFLICT_PATTERNS = [
  /\binstead\b/i,
  /\bchange\b/i,
  /\bnot\b/i,
  /不要/,
  /换成/,
  /改成/,
];

const matchPatterns = (value: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(value));

export const inferBootstrapRiskLevel = (
  request: CapsuleRequest,
): BootstrapRiskLevel => {
  if (request.riskLevel) {
    return request.riskLevel;
  }
  const query = (request.query ?? "").trim();
  return query && matchPatterns(query, HIGH_RISK_PATTERNS) ? "high" : "normal";
};

export const shouldUseConservativeBackground = (
  request: CapsuleRequest,
): boolean => {
  const query = (request.query ?? "").trim();
  if (!query) {
    return false;
  }
  return inferBootstrapRiskLevel(request) === "high" || matchPatterns(query, CONFLICT_PATTERNS);
};
