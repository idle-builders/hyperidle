# Destroyer input — `work` (core-api)

Package: `layers/core-api/work`
Surface: 21 exported functions, 2 classes (0 member methods), 22 interface/type declarations, 1 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `cascadeBetKill` | yes | `layers/core-api/work/src/bet-kill-cascade.ts:81` |
| 2 | `transitionBet` | yes | `layers/core-api/work/src/bet-state-machine.ts:100` |
| 3 | `updateBetField` | yes | `layers/core-api/work/src/bet-state-machine.ts:260` |
| 4 | `checkAndUnblockDependents` | yes | `layers/core-api/work/src/dependency-watcher.ts:36` |
| 5 | `resolveSessionStartRequest` | yes | `layers/core-api/work/src/session-start-resolver.ts:101` |
| 6 | `getTaskRiskTierByTaskId` | yes | `layers/core-api/work/src/task-planning-signals.ts:16` |
| 7 | `resolveTaskRunRequest` | yes | `layers/core-api/work/src/task-run-resolver.ts:178` |
| 8 | `transitionTask` | yes | `layers/core-api/work/src/task-state-machine.ts:74` |
| 9 | `get` | yes | `layers/core-api/work/src/work-service.ts:256` |
| 10 | `get` | yes | `layers/core-api/work/src/work-service.ts:263` |
| 11 | `get` | yes | `layers/core-api/work/src/work-service.ts:268` |
| 12 | `list` | yes | `layers/core-api/work/src/work-service.ts:304` |
| 13 | `list` | yes | `layers/core-api/work/src/work-service.ts:310` |
| 14 | `list` | yes | `layers/core-api/work/src/work-service.ts:316` |
| 15 | `list` | yes | `layers/core-api/work/src/work-service.ts:322` |
| 16 | `list` | yes | `layers/core-api/work/src/work-service.ts:327` |
| 17 | `create` | yes | `layers/core-api/work/src/work-service.ts:669` |
| 18 | `update` | yes | `layers/core-api/work/src/work-service.ts:698` |
| 19 | `update` | yes | `layers/core-api/work/src/work-service.ts:711` |
| 20 | `update` | yes | `layers/core-api/work/src/work-service.ts:717` |
| 21 | `transition` | yes | `layers/core-api/work/src/work-service.ts:773` |

## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT

### `SessionStartSourceUnavailableError` — `layers/core-api/work/src/session-start-resolver.ts:60` (public)
- (no public member methods)

### `TaskRunSourceUnavailableError` — `layers/core-api/work/src/task-run-resolver.ts:81` (public)
- (no public member methods)

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `ArtifactRow` (type, public) `layers/core-api/work/src/artifact-store.ts:31`
- `ArtifactWithTaskTitle` (interface, public) `layers/core-api/work/src/artifact-store.ts:33` — members: `artifact`, `taskTitle`
- `ArtifactTaskSummaryRow` (interface, public) `layers/core-api/work/src/artifact-store.ts:38` — members: `artifactId`, `artifactKind`, `artifactPreviewJson`, `taskTitle`
- `BetKillCascadeDeps` (interface, public) `layers/core-api/work/src/bet-kill-cascade.ts:16` — members: `runOrchestration`, `policy`
- `RevisionLogEntry` (interface, public) `layers/core-api/work/src/bet-state-machine.ts:19` — members: `timestamp`, `field`, `old_value`, `new_value`, `reason`, `actor`
- `WorkDeps` (interface, public) `layers/core-api/work/src/ports.ts:183` — members: `users`, `teamCapacity`, `workIntents`
- `SessionStartResolverDeps` (interface, public) `layers/core-api/work/src/session-start-resolver.ts:39` — members: `requireRunnableAgent`, `readServerConfig`, `resolveOrCreateCallingThread`
- `BakedSessionStartRequest` (interface, public) `layers/core-api/work/src/session-start-resolver.ts:63` — members: `defaultAgentId`, `sourceKind`, `sourceId`, `streamId`, `taskId`, `teamId`, `sourceCorrelation`, `agentConfig`, `harnessDisabled`, `callingThreadId`
- `StateTransitionAuditEntry` (interface, public) `layers/core-api/work/src/task-audit.ts:21` — members: `from`, `to`, `timestamp`, `reason`
- `HandoffAuditEntry` (interface, public) `layers/core-api/work/src/task-audit.ts:28` — members: `type`, `fromAgent`, `toAgent`, `toHuman`, `reason`, `timestamp`
- `TaskAuditEntry` (type, public) `layers/core-api/work/src/task-audit.ts:37`
- `TaskRunResolverDeps` (interface, public) `layers/core-api/work/src/task-run-resolver.ts:35` — members: `requireRunnableAgent`, `getTeamById`, `assembleSessionKnowledge`, `readServerConfig`, `resolveOrCreateCallingThread`
- `BakedTaskRunRequest` (interface, public) `layers/core-api/work/src/task-run-resolver.ts:84` — members: `defaultAgentId`, `sourceKind`, `sourceId`, `streamId`, `taskId`, `teamId`, `sourceCorrelation`, `contextBundle`, `agentConfig`, `harnessDisabled`, `callingThreadId`
- `TaskStateMachineDeps` (interface, public) `layers/core-api/work/src/task-state-machine.ts:32` — members: `workIntents`, `taskRunResolver`
- `Bet` (type, public) `layers/core-api/work/src/work-service.ts:59`
- `Task` (type, public) `layers/core-api/work/src/work-service.ts:60`
- `Item` (type, public) `layers/core-api/work/src/work-service.ts:158`
- `WorkEntity` (type, public) `layers/core-api/work/src/work-service.ts:195`
- `WorkFilter` (interface, public) `layers/core-api/work/src/work-service.ts:223` — members: `ids`, `limit`, `offset`, `count`, `include`, `teamId`, `status`, `text`, `state`, `betId`, `ownerAgentId`, `dependencyId`, `threadId`, `threadIds`, `sourceAgentId`, `marker`, `bodyMarker`, `queued`, `createdSince`, `taskIds`, `cursor`
- `AppendNoteOp` (interface, public) `layers/core-api/work/src/work-service.ts:570` — members: `appendNote`
- `TransitionGuard` (type, public) `layers/core-api/work/src/work-service.ts:618`
- `TransitionSpec` (interface, public) `layers/core-api/work/src/work-service.ts:621` — members: `id`, `guard`, `patch`

## D. Const / enum exports

- `taskDispatchAttemptStore` (const, public) `layers/core-api/work/src/work-service.ts:63`
