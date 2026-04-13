import type {
  ColdMemoryProvider,
  FactHit,
  PromotionRecord,
} from "@memory-runtime/memory-core";

import {
  createMemoryPalaceHttpClient,
  type MemoryPalaceClient,
  type MemoryPalaceHttpClientConfig,
} from "./http-client.js";

export {
  createMemoryPalaceHttpClient,
  type MemoryPalaceClient,
  type MemoryPalaceHttpClientConfig,
};

export interface MemoryPalaceAdapterConfig extends MemoryPalaceHttpClientConfig {}

export const createMemoryPalaceColdProvider = (
  client: MemoryPalaceClient,
  _config: MemoryPalaceAdapterConfig,
): ColdMemoryProvider => ({
  readProjectPrimer: (projectId) => client.readProjectPrimer(projectId),
  searchFacts: (projectId, query) => client.searchFacts(projectId, query),
  searchGists: (projectId, query) => client.searchGists(projectId, query),
  promote: (record) => client.promote(record),
});

export const createMemoryPalaceColdProviderFromConfig = (
  config: MemoryPalaceAdapterConfig,
): ColdMemoryProvider =>
  createMemoryPalaceColdProvider(createMemoryPalaceHttpClient(config), config);

export const createMemoryPalaceFixtureClient = (
  facts: readonly FactHit[],
): MemoryPalaceClient => ({
  readProjectPrimer: async () => facts.slice(0, 2),
  searchFacts: async () => facts,
  searchGists: async () => facts,
  promote: async (_record: PromotionRecord) => undefined,
});
