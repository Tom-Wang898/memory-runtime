import type {
  DuplicateResolutionGroup,
  DuplicateResolutionPathDetail,
} from "./types.ts";

const weightForRisk = (riskLevel: DuplicateResolutionGroup["riskLevel"]): number =>
  riskLevel === "high" ? 3 : riskLevel === "medium" ? 2 : 1;

export const assessDuplicateRisk = (
  pathDetails: readonly DuplicateResolutionPathDetail[],
): {
  readonly riskLevel: DuplicateResolutionGroup["riskLevel"];
  readonly riskReason: string;
} => {
  const managedCount = pathDetails.filter((detail) => detail.isManaged).length;
  const nonManagedCount = pathDetails.length - managedCount;
  const hasEntrypoint = pathDetails.some((detail) => detail.entrypoint);
  const hasHostSpecificIssue = pathDetails.some(
    (detail) => detail.hostSpecificIssueCount > 0,
  );
  const maxTotalTokens = Math.max(...pathDetails.map((detail) => detail.totalTokens), 0);
  const reasons: string[] = [];
  let score = 0;

  if (nonManagedCount > 1) {
    score += 4;
    reasons.push("multiple non-managed duplicates");
  }
  if (hasEntrypoint) {
    score += 3;
    reasons.push("entrypoint skill involved");
  }
  if (managedCount > 0 && nonManagedCount > 0) {
    score += 2;
    reasons.push("mixed managed and non-managed copies");
  }
  if (hasHostSpecificIssue) {
    score += 2;
    reasons.push("host-specific coupling present");
  }
  if (maxTotalTokens >= 1800) {
    score += 2;
    reasons.push("heavy skill payload");
  }
  if (pathDetails.length >= 3) {
    score += 1;
    reasons.push("three or more active duplicates");
  }

  if (score >= 5) {
    return { riskLevel: "high", riskReason: reasons.join(", ") || "high priority duplicate set" };
  }
  if (score >= 2) {
    return { riskLevel: "medium", riskReason: reasons.join(", ") || "moderate duplicate risk" };
  }
  return { riskLevel: "low", riskReason: reasons.join(", ") || "low duplicate risk" };
};

export const compareDuplicateGroups = (
  left: DuplicateResolutionGroup,
  right: DuplicateResolutionGroup,
): number => {
  const riskDelta =
    weightForRisk(right.riskLevel) - weightForRisk(left.riskLevel);
  if (riskDelta !== 0) {
    return riskDelta;
  }
  const countDelta = right.paths.length - left.paths.length;
  if (countDelta !== 0) {
    return countDelta;
  }
  const leftMaxTokens = Math.max(...left.pathDetails.map((detail) => detail.totalTokens), 0);
  const rightMaxTokens = Math.max(...right.pathDetails.map((detail) => detail.totalTokens), 0);
  const tokenDelta = rightMaxTokens - leftMaxTokens;
  if (tokenDelta !== 0) {
    return tokenDelta;
  }
  return left.key.localeCompare(right.key);
};
