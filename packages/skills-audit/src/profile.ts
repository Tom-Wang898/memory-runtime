import type { GovernanceHost, GovernanceProfile, SkillRecord } from "./types.ts";

const GOVERNANCE_PROFILES: Record<GovernanceHost, GovernanceProfile> = {
  codex: {
    host: "codex",
    defaultDescriptionThreshold: 48,
    entrypointDescriptionThreshold: 40,
    targetDescriptionThreshold: 36,
    targetEntrypointDescriptionThreshold: 30,
  },
  claude: {
    host: "claude",
    defaultDescriptionThreshold: 56,
    entrypointDescriptionThreshold: 44,
    targetDescriptionThreshold: 42,
    targetEntrypointDescriptionThreshold: 34,
  },
  gemini: {
    host: "gemini",
    defaultDescriptionThreshold: 52,
    entrypointDescriptionThreshold: 42,
    targetDescriptionThreshold: 38,
    targetEntrypointDescriptionThreshold: 32,
  },
  universal: {
    host: "universal",
    defaultDescriptionThreshold: 44,
    entrypointDescriptionThreshold: 36,
    targetDescriptionThreshold: 32,
    targetEntrypointDescriptionThreshold: 28,
  },
};

export const resolveGovernanceHost = (
  value: string | undefined,
): GovernanceHost => {
  if (
    value === "codex" ||
    value === "claude" ||
    value === "gemini" ||
    value === "universal"
  ) {
    return value;
  }
  return "codex";
};

export const getGovernanceProfile = (
  host: GovernanceHost,
): GovernanceProfile => GOVERNANCE_PROFILES[host];

export const getDescriptionThreshold = (
  record: SkillRecord,
  profile: GovernanceProfile,
): number =>
  record.entrypoint
    ? profile.entrypointDescriptionThreshold
    : profile.defaultDescriptionThreshold;

export const getTargetDescriptionThreshold = (
  record: SkillRecord,
  profile: GovernanceProfile,
): number =>
  record.entrypoint
    ? profile.targetEntrypointDescriptionThreshold
    : profile.targetDescriptionThreshold;
