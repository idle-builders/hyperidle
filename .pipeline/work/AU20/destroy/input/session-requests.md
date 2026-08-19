# Destroyer input — `session-requests` (agent-orchestration)

Package: `layers/agent-orchestration/session-requests`
Surface: 24 exported functions, 0 classes (0 member methods), 11 interface/type declarations, 1 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `enqueueWorkIntent` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1631` |
| 2 | `listPendingIntentsByKind` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1648` |
| 3 | `createSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1663` |
| 4 | `createSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1667` |
| 5 | `createSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1671` |
| 6 | `findSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1675` |
| 7 | `findSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1679` |
| 8 | `findSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1683` |
| 9 | `findSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1687` |
| 10 | `findSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1691` |
| 11 | `findSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1695` |
| 12 | `findSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1699` |
| 13 | `findSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1705` |
| 14 | `listSessionRequests` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1708` |
| 15 | `claimSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1718` |
| 16 | `renewClaim` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1728` |
| 17 | `releaseClaim` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1736` |
| 18 | `transitionSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1739` |
| 19 | `transitionSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1745` |
| 20 | `transitionSessionRequest` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1751` |
| 21 | `drainIntents` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1764` |
| 22 | `drainLifecycleProjections` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1770` |
| 23 | `startLifecycleProjectionDrain` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1781` |
| 24 | `reapExpired` | yes | `layers/agent-orchestration/session-requests/src/service.ts:1787` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `LifecycleProjectionDrainStop` (type, public) `layers/agent-orchestration/session-requests/src/service.ts:218`
- `BakedWorkIntentRequest` (type, public) `layers/agent-orchestration/session-requests/src/service.ts:1313` — members: `defaultAgentId`, `sourceKind`, `sourceId`, `streamId`, `taskId`, `teamId`, `userId`, `sourceCorrelation`, `transcript`, `contextBundle`, `agentConfig`, `harnessDisabled`, `callingThreadId`
- `BakedContextKnowledgeItem` (interface, internal) `layers/agent-orchestration/session-requests/src/service.ts:1364` — members: `id`, `title`, `body`, `format`, `version`, `layer`
- `BakedContextBundle` (type, internal) `layers/agent-orchestration/session-requests/src/service.ts:1374`
- `WorkIntentInput` (type, public) `layers/agent-orchestration/session-requests/src/service.ts:1418` — members: `kind`, `sourceKind`, `sourceId`, `requestedBy`, `idempotencyKey`, `bakedRequest`
- `CreateSessionRequestInput` (type, public) `layers/agent-orchestration/session-requests/src/service.ts:1460`
- `FindQuery` (type, public) `layers/agent-orchestration/session-requests/src/service.ts:1473`
- `SessionRequestTransition` (type, public) `layers/agent-orchestration/session-requests/src/service.ts:1547`
- `ClaimOptions` (interface, public) `layers/agent-orchestration/session-requests/src/service.ts:1550` — members: `workerId`, `now`, `leaseMs`
- `AgentLifecycleFact` (type, public) `layers/agent-orchestration/session-requests/src/service.ts:1555` — members: `requestId`, `sourceKind`, `sourceId`, `state`, `sessionId`, `failureCode`
- `DurableAgentQueueDeps` (interface, public) `layers/agent-orchestration/session-requests/src/service.ts:1563` — members: `db`, `lifecycleProjection`, `eventBus`

## D. Const / enum exports

- `sessionRunRegistry` (const, public) `layers/agent-orchestration/session-requests/src/session-run-registry.ts:96`
