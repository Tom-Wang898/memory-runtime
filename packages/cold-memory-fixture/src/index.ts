import type {
  ColdMemoryProvider,
  FactHit,
  PromotionRecord,
} from "@memory-runtime/memory-core";

export interface FixtureColdMemoryConfig {
  readonly facts: readonly FactHit[];
}

const matchFacts = (
  facts: readonly FactHit[],
  query: string,
): readonly FactHit[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return facts.slice(0, 4);
  }
  return facts
    .filter((item) => item.summary.toLowerCase().includes(normalized))
    .slice(0, 4);
};

export const createFixtureColdProvider = (
  config: FixtureColdMemoryConfig,
): ColdMemoryProvider => ({
  searchFacts: async (_projectId, query) => matchFacts(config.facts, query),
  searchGists: async (_projectId, query) => matchFacts(config.facts, query),
  promote: async (_record: PromotionRecord) => undefined,
});
