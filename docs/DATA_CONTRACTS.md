# Data Contracts

## ProjectCapsule

Minimal bootstrap packet for a project session.

| Field | Type | Notes |
|---|---|---|
| `project` | `ProjectIdentity` | Stable project identity |
| `summary` | `string` | Short project background |
| `activeTask` | `string \\| null` | Current dominant task |
| `openLoops` | `OpenLoop[]` | Unclosed risks or follow-ups |
| `recentDecisions` | `DecisionRecord[]` | Recent stable decisions |
| `workingSet` | `WorkingSetEntry[]` | Recent files, commands, errors |
| `budget` | `TokenBudget` | Target and hard token limits |
| `source` | `"hot" \\| "hot+cold"` | Provenance of the capsule |
| `generatedAt` | `string` | ISO timestamp |

## DecisionRecord

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable identifier |
| `summary` | `string` | Decision statement |
| `reason` | `string` | Why it exists |
| `updatedAt` | `string` | ISO timestamp |
| `sourceUri` | `string \\| null` | Optional cold-memory link |

## OpenLoop

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable identifier |
| `summary` | `string` | What is still unresolved |
| `severity` | `"low" \\| "medium" \\| "high"` | Runtime priority |
| `updatedAt` | `string` | ISO timestamp |

## WorkingSetEntry

| Field | Type | Notes |
|---|---|---|
| `kind` | `"file" \\| "command" \\| "error" \\| "note"` | Entry type |
| `label` | `string` | Short label |
| `value` | `string` | Compact payload |
| `updatedAt` | `string` | ISO timestamp |
| `weight` | `number \\| undefined` | Optional ranking hint |

## FactHit

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable identifier |
| `summary` | `string` | Compact fact |
| `sourceUri` | `string` | Durable source |
| `score` | `number` | Recall score |

## PromotionRecord

| Field | Type | Notes |
|---|---|---|
| `projectId` | `string` | Project scope |
| `title` | `string` | Durable memory title |
| `summary` | `string` | Promoteable summary |
| `facts` | `string[]` | Stable facts only |
| `sourceSessionId` | `string \\| null` | Optional session link |

## BootstrapDiagnostics

| Field | Type | Notes |
|---|---|---|
| `modeApplied` | `"fast" \\| "warm" \\| "cold"` | Effective bootstrap mode |
| `riskLevel` | `"normal" \\| "high"` | Risk classification for the query |
| `recallQueryStrategy` | `"none" \\| "direct" \\| "anchored" \\| "suppressed"` | How cold-recall query construction was handled |
| `coldRecallAttempted` | `boolean` | Whether the runtime actually queried cold memory |
| `coldRecallUsed` | `boolean` | Whether cold memory returned facts that were injected |
| `usedFallback` | `boolean` | Whether no hot capsule was available |
| `degradeReasons` | `string[]` | Timeout, suppression, or fallback reasons |
| `latencyMs` | `number` | End-to-end bootstrap latency |
| `estimatedTokens` | `number` | Estimated bootstrap token size |
