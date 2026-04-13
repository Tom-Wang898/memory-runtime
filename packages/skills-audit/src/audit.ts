import { DEFAULT_REPORT_LIMIT } from "./constants.ts";
import { discoverSkillRoots } from "./discovery.ts";
import { resolveGovernanceHost } from "./profile.ts";
import { buildSkillsAuditReport } from "./report.ts";
import { scanSkillRoots } from "./scan.ts";
import type { SkillsAuditOptions, SkillsAuditReport } from "./types.ts";

export const auditSkills = (
  options: SkillsAuditOptions = {},
): SkillsAuditReport => {
  const roots = discoverSkillRoots(options.roots);
  const records = scanSkillRoots(roots.discoveredRoots);
  return buildSkillsAuditReport({
    host: resolveGovernanceHost(options.host),
    records,
    requestedRoots: roots.requestedRoots,
    discoveredRoots: roots.discoveredRoots,
    missingRoots: roots.missingRoots,
    limit: options.limit ?? DEFAULT_REPORT_LIMIT,
  });
};
