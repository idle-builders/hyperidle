# Destroyer input — `routine` (core-api)

Package: `layers/core-api/routine`
Surface: 17 exported functions, 1 classes (0 member methods), 13 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `isBuiltinRoutineId` | yes | `layers/core-api/routine/src/routine-scheduler.ts:81` |
| 2 | `extractBuiltinKind` | yes | `layers/core-api/routine/src/routine-scheduler.ts:85` |
| 3 | `provisionTeamRoutines` | yes | `layers/core-api/routine/src/routine-scheduler.ts:177` |
| 4 | `fireBuiltinRoutine` | yes | `layers/core-api/routine/src/routine-scheduler.ts:442` |
| 5 | `registerBuiltinRoutineHandlers` | yes | `layers/core-api/routine/src/routine-scheduler.ts:506` |
| 6 | `fireGenericRoutine` | yes | `layers/core-api/routine/src/routine-scheduler.ts:578` |
| 7 | `startRoutineScheduler` | yes | `layers/core-api/routine/src/routine-scheduler.ts:787` |
| 8 | `insertRoutine` | yes | `layers/core-api/routine/src/routine-service.ts:64` |
| 9 | `updateRoutine` | yes | `layers/core-api/routine/src/routine-service.ts:77` |
| 10 | `getRoutine` | yes | `layers/core-api/routine/src/routine-service.ts:90` |
| 11 | `listRoutines` | yes | `layers/core-api/routine/src/routine-service.ts:108` |
| 12 | `insertRoutineRun` | yes | `layers/core-api/routine/src/routine-service.ts:144` |
| 13 | `updateRoutineRun` | yes | `layers/core-api/routine/src/routine-service.ts:158` |
| 14 | `getRoutineRun` | yes | `layers/core-api/routine/src/routine-service.ts:179` |
| 15 | `listRoutineRuns` | yes | `layers/core-api/routine/src/routine-service.ts:197` |
| 16 | `resolveRoutineRunRequest` | yes | `layers/core-api/routine/src/routine-service.ts:338` |
| 17 | `humanizeSchedule` | yes | `layers/core-api/routine/src/schedule-label.ts:112` |

## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT

### `RoutineRunSourceUnavailableError` — `layers/core-api/routine/src/routine-service.ts:232` (public)
- (no public member methods)

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `RoutineSchedulerPorts` (interface, public) `layers/core-api/routine/src/ports.ts:37` — members: `work`, `conversation`, `knowledge`, `settings`, `workIntents`, `requireRunnableAgent`, `getTeamById`, `assembleSessionKnowledge`
- `BuiltinRoutineId` (type, public) `layers/core-api/routine/src/routine-scheduler.ts:79`
- `RunBuiltinResult` (type, public) `layers/core-api/routine/src/routine-scheduler.ts:221`
- `PostBetRetroArgs` (interface, public) `layers/core-api/routine/src/routine-scheduler.ts:229` — members: `betId`
- `FireResult` (interface, public) `layers/core-api/routine/src/routine-scheduler.ts:233` — members: `fired`, `reason`, `runId`, `sessionId`, `emitted`, `extra`
- `RoutineSchedulerConfig` (interface, public) `layers/core-api/routine/src/routine-scheduler.ts:768` — members: `pollIntervalMs`, `canProvision`, `reap`, `reaperCadenceMs`
- `RoutineScheduler` (interface, public) `layers/core-api/routine/src/routine-scheduler.ts:775` — members: `stop`
- `Routine` (type, public) `layers/core-api/routine/src/routine-service.ts:52`
- `RoutineRun` (type, public) `layers/core-api/routine/src/routine-service.ts:53`
- `RoutinePatch` (type, public) `layers/core-api/routine/src/routine-service.ts:56`
- `RoutineRunPatch` (type, public) `layers/core-api/routine/src/routine-service.ts:58`
- `BakedRoutineRunRequest` (interface, public) `layers/core-api/routine/src/routine-service.ts:240` — members: `defaultAgentId`, `sourceKind`, `sourceId`, `streamId`, `teamId`, `taskId`, `sourceCorrelation`, `contextBundle`, `agentConfig`, `harnessDisabled`
- `RoutineRunResolverDeps` (interface, public) `layers/core-api/routine/src/routine-service.ts:285` — members: `requireRunnableAgent`, `getTeamById`, `assembleSessionKnowledge`, `readServerConfig`
