# Destroyer input — `run-orchestration` (agent-orchestration)

Package: `layers/agent-orchestration/run-orchestration`
Surface: 23 exported functions, 0 classes (0 member methods), 21 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `buildProvisioningPlan` | yes | `layers/agent-orchestration/run-orchestration/src/connection-provisioning.ts:155` |
| 2 | `applyProvisioningPlan` | yes | `layers/agent-orchestration/run-orchestration/src/connection-provisioning.ts:303` |
| 3 | `createContextAssembler` | internal | `layers/agent-orchestration/run-orchestration/src/context.ts:815` |
| 4 | `createBareRun` | yes | `layers/agent-orchestration/run-orchestration/src/create-bare-run.ts:42` |
| 5 | `endRunForHandoff` | yes | `layers/agent-orchestration/run-orchestration/src/end-run-for-handoff.ts:35` |
| 6 | `startWatcher` | yes | `layers/agent-orchestration/run-orchestration/src/file-watcher.ts:41` |
| 7 | `mountFilesystemsForAgent` | yes | `layers/agent-orchestration/run-orchestration/src/filesystem-provisioning.ts:73` |
| 8 | `createProvisioner` | internal | `layers/agent-orchestration/run-orchestration/src/provisioner.ts:1854` |
| 9 | `requestRunStopForTasks` | yes | `layers/agent-orchestration/run-orchestration/src/request-run-stop-for-tasks.ts:35` |
| 10 | `createRuntimeReapers` | internal | `layers/agent-orchestration/run-orchestration/src/runtime-reapers.ts:229` |
| 11 | `runSession` | yes | `layers/agent-orchestration/run-orchestration/src/runtime.ts:477` |
| 12 | `findSessionById` | yes | `layers/agent-orchestration/run-orchestration/src/session-store.ts:24` |
| 13 | `listSessions` | yes | `layers/agent-orchestration/run-orchestration/src/session-store.ts:33` |
| 14 | `countActiveRunsByAgent` | yes | `layers/agent-orchestration/run-orchestration/src/session-store.ts:58` |
| 15 | `listLatestOutcomeByTask` | yes | `layers/agent-orchestration/run-orchestration/src/session-store.ts:82` |
| 16 | `listRunSummaries` | yes | `layers/agent-orchestration/run-orchestration/src/session-store.ts:131` |
| 17 | `endSessionByCas` | yes | `layers/agent-orchestration/run-orchestration/src/session-store.ts:182` |
| 18 | `recordSessionMetadata` | yes | `layers/agent-orchestration/run-orchestration/src/session-store.ts:228` |
| 19 | `writeSessionNotes` | yes | `layers/agent-orchestration/run-orchestration/src/session-store.ts:248` |
| 20 | `startRuntime` | yes | `layers/agent-orchestration/run-orchestration/src/start-runtime.ts:362` |
| 21 | `transitionRun` | yes | `layers/agent-orchestration/run-orchestration/src/transition-run.ts:304` |
| 22 | `createWorkerIngress` | internal | `layers/agent-orchestration/run-orchestration/src/worker-ingress.ts:285` |
| 23 | `createWritebackProcessor` | internal | `layers/agent-orchestration/run-orchestration/src/writeback-processor.ts:389` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `HeldConnectionForProvisioning` (interface, public) `layers/agent-orchestration/run-orchestration/src/connection-provisioning.ts:94` — members: `id`, `userId`, `service`, `authSource`, `serverUrl`
- `HeldConnectionsReaderPort` (interface, public) `layers/agent-orchestration/run-orchestration/src/connection-provisioning.ts:108` — members: `listHeldForProvisioning`
- `ServiceConnectionResolverPort` (interface, public) `layers/agent-orchestration/run-orchestration/src/connection-provisioning.ts:113` — members: `resolve`
- `ProvisioningPlan` (interface, public) `layers/agent-orchestration/run-orchestration/src/connection-provisioning.ts:123` — members: `mcpServers`, `envInjections`
- `RuntimePorts` (interface, public) `layers/agent-orchestration/run-orchestration/src/contracts.ts:96` — members: `sessionRequests`, `sessionLifecycle`, `sessionProvisioner`
- `RunResult` (type, public) `layers/agent-orchestration/run-orchestration/src/contracts.ts:192`
- `RunOptions` (type, public) `layers/agent-orchestration/run-orchestration/src/contracts.ts:203`
- `RunTransitionSpec` (type, public) `layers/agent-orchestration/run-orchestration/src/contracts.ts:230`
- `RunTransitionResult` (type, public) `layers/agent-orchestration/run-orchestration/src/contracts.ts:231`
- `RuntimeDeps` (interface, public) `layers/agent-orchestration/run-orchestration/src/contracts.ts:234` — members: `db`, `eventBus`, `runtime`, `sandboxBasePath`, `resolveModel`, `ports`, `durableQueue`, `composition`
- `RuntimeHandle` (interface, public) `layers/agent-orchestration/run-orchestration/src/contracts.ts:286` — members: `registerWorkerWebSocket`, `dispose`
- `AgentTerminationReason` (type, public) `layers/agent-orchestration/run-orchestration/src/contracts.ts:294`
- `CreateBareRunInput` (interface, public) `layers/agent-orchestration/run-orchestration/src/create-bare-run.ts:31` — members: `agentId`, `taskId`, `modelTier`
- `FileWatcherConfig` (interface, public) `layers/agent-orchestration/run-orchestration/src/file-watcher.ts:18` — members: `sandboxPath`, `sessionId`, `manifestPath`, `eventBus`, `debounceMs`, `onError`
- `FileWatcher` (interface, public) `layers/agent-orchestration/run-orchestration/src/file-watcher.ts:27` — members: `stop`
- `FilesystemForProvisioning` (interface, public) `layers/agent-orchestration/run-orchestration/src/filesystem-provisioning.ts:36` — members: `id`, `teamId`, `source`, `kind`, `connectionId`, `resourceRef`, `writeback`, `state`, `createdAt`
- `InjectedFilesystemsReaderPort` (interface, public) `layers/agent-orchestration/run-orchestration/src/filesystem-provisioning.ts:54` — members: `listInjectedForProvisioning`
- `SessionLifecycleAgentRunConfigReader` (interface, internal) `layers/agent-orchestration/run-orchestration/src/provisioner.ts:494` — members: `readAgentRunConfig`
- `StoppedRun` (interface, public) `layers/agent-orchestration/run-orchestration/src/request-run-stop-for-tasks.ts:30` — members: `taskId`, `sessionId`
- `RunSummary` (interface, internal) `layers/agent-orchestration/run-orchestration/src/session-store.ts:119` — members: `id`, `agentId`, `taskId`, `startedAt`, `endedAt`, `state`, `outcome`, `effectivenessScore`
- `EndSessionByCasInput` (interface, internal) `layers/agent-orchestration/run-orchestration/src/session-store.ts:145` — members: `sessionId`, `agentId`, `taskId`, `state`, `outcome`, `notes`, `effectivenessScore`, `actor`, `now`
