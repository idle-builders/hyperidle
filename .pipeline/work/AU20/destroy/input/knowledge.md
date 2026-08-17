# Destroyer input — `knowledge` (core-api)

Package: `layers/core-api/knowledge`
Surface: 42 exported functions, 1 classes (0 member methods), 15 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `recomputeAttention` | yes | `layers/core-api/knowledge/src/attention-service.ts:439` |
| 2 | `ensureFactoryKnowledgeSeed` | yes | `layers/core-api/knowledge/src/factory-seed.ts:19` |
| 3 | `resolveKnowledgeActionRequest` | yes | `layers/core-api/knowledge/src/knowledge-action-resolver.ts:121` |
| 4 | `recordConflict` | yes | `layers/core-api/knowledge/src/knowledge-conflicts.ts:48` |
| 5 | `findOpenConflict` | yes | `layers/core-api/knowledge/src/knowledge-conflicts.ts:66` |
| 6 | `create` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:258` |
| 7 | `update` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:402` |
| 8 | `get` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:601` |
| 9 | `get` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:606` |
| 10 | `get` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:611` |
| 11 | `get` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:616` |
| 12 | `get` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:621` |
| 13 | `list` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:701` |
| 14 | `list` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:705` |
| 15 | `list` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:709` |
| 16 | `list` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:713` |
| 17 | `list` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:719` |
| 18 | `list` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:723` |
| 19 | `list` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:734` |
| 20 | `list` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:738` |
| 21 | `list` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:739` |
| 22 | `count` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:934` |
| 23 | `search` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:975` |
| 24 | `countAccesses` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:1067` |
| 25 | `transition` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:1143` |
| 26 | `transition` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:1148` |
| 27 | `transition` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:1159` |
| 28 | `transition` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:1164` |
| 29 | `transition` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:1175` |
| 30 | `transition` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:1180` |
| 31 | `transition` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:1195` |
| 32 | `remove` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:1507` |
| 33 | `recordAccess` | yes | `layers/core-api/knowledge/src/knowledge-repository.ts:1557` |
| 34 | `sweep` | yes | `layers/core-api/knowledge/src/promotion-pipeline.ts:552` |
| 35 | `sweep` | yes | `layers/core-api/knowledge/src/promotion-pipeline.ts:558` |
| 36 | `sweep` | yes | `layers/core-api/knowledge/src/promotion-pipeline.ts:569` |
| 37 | `rank` | yes | `layers/core-api/knowledge/src/relevance-scoring.ts:209` |
| 38 | `recomputeRelevance` | yes | `layers/core-api/knowledge/src/relevance-service.ts:214` |
| 39 | `recomputeRelevance` | yes | `layers/core-api/knowledge/src/relevance-service.ts:215` |
| 40 | `recomputeRelevance` | yes | `layers/core-api/knowledge/src/relevance-service.ts:219` |
| 41 | `reapAccessLog` | yes | `layers/core-api/knowledge/src/relevance-service.ts:252` |
| 42 | `assembleSessionKnowledge` | yes | `layers/core-api/knowledge/src/session-knowledge-assembler.ts:77` |

## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT

### `KnowledgeActionSourceUnavailableError` — `layers/core-api/knowledge/src/knowledge-action-resolver.ts:72` (public)
- (no public member methods)

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `KnowledgeActionResolverDeps` (interface, public) `layers/core-api/knowledge/src/knowledge-action-resolver.ts:44` — members: `requireRunnableAgent`, `readServerConfig`, `resolveOrCreateCallingThread`
- `BakedKnowledgeActionRequest` (interface, public) `layers/core-api/knowledge/src/knowledge-action-resolver.ts:75` — members: `defaultAgentId`, `sourceKind`, `sourceId`, `streamId`, `sourceCorrelation`, `contextBundle`, `agentConfig`, `harnessDisabled`, `callingThreadId`
- `RecordConflictInput` (interface, public) `layers/core-api/knowledge/src/knowledge-conflicts.ts:30` — members: `id`, `itemId`, `versionBase`, `versionCurrent`, `proposedBody`, `proposedMeta`, `proposedBy`, `createdAt`
- `CreateKnowledgeItemInput` (interface, internal) `layers/core-api/knowledge/src/knowledge-repository.ts:44` — members: `layer`, `scopeKind`, `scopeId`, `kind`, `topic`, `title`, `body`, `format`, `status`, `updatedBy`, `attentionScore`, `confidence`, `meta`
- `UpdateKnowledgeItemInput` (interface, internal) `layers/core-api/knowledge/src/knowledge-repository.ts:92` — members: `layer`, `scopeId`, `kind`, `topic`, `title`, `body`, `format`, `status`, `updatedBy`, `attentionScore`, `confidence`, `meta`
- `ListFilters` (interface, internal) `layers/core-api/knowledge/src/knowledge-repository.ts:112` — members: `layer`, `scopeId`, `kind`, `topic`, `limit`, `offset`
- `KnowledgeItemView` (type, internal) `layers/core-api/knowledge/src/knowledge-repository.ts:123`
- `KnowledgeItemWithProjection` (interface, internal) `layers/core-api/knowledge/src/knowledge-repository.ts:133` — members: `layer`, `kind`, `attentionScore`, `confidence`, `meta`
- `PromoteTransitionResult` (type, internal) `layers/core-api/knowledge/src/knowledge-repository.ts:1134`
- `RecordAccessInput` (interface, internal) `layers/core-api/knowledge/src/knowledge-repository.ts:1547` — members: `itemId`, `accessorKind`, `accessorId`, `accessedAt`
- `SessionKnowledgeInput` (interface, public) `layers/core-api/knowledge/src/session-knowledge-assembler.ts:27` — members: `teamId`, `agentRole`, `taskDescription`
- `KnowledgeLayer` (type, internal) `layers/core-api/knowledge/src/types.ts:11`
- `KnowledgeStatus` (type, internal) `layers/core-api/knowledge/src/types.ts:22`
- `KnowledgeKind` (type, internal) `layers/core-api/knowledge/src/types.ts:24`
- `KnowledgeScope` (interface, public) `layers/core-api/knowledge/src/types.ts:44` — members: `scopeKind`, `scopeId`
