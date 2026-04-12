import type {
  BootstrapPayload,
  CapsuleRequest,
  CheckpointRecord,
  FactHit,
  ProjectCapsule,
  PromotionRecord,
} from "./contracts.js";

export interface HotMemoryProvider {
  getProjectCapsule(projectId: string): Promise<ProjectCapsule | null>;
  buildCapsule(input: CapsuleRequest): Promise<ProjectCapsule | null>;
  checkpoint(input: CheckpointRecord): Promise<void>;
}

export interface ColdMemoryProvider {
  searchFacts(projectId: string, query: string): Promise<readonly FactHit[]>;
  searchGists(projectId: string, query: string): Promise<readonly FactHit[]>;
  promote(record: PromotionRecord): Promise<void>;
}

export interface HostAdapter {
  bootstrap(input: CapsuleRequest): Promise<BootstrapPayload>;
  checkpoint(record: CheckpointRecord): Promise<void>;
}
