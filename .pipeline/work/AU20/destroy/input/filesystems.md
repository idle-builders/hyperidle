# Destroyer input — `filesystems` (agent-orchestration)

Package: `layers/agent-orchestration/filesystems`
Surface: 10 exported functions, 0 classes (0 member methods), 9 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `resolveFilesystemState` | yes | `layers/agent-orchestration/filesystems/src/filesystem-reachability.ts:74` |
| 2 | `saveFilesystem` | yes | `layers/agent-orchestration/filesystems/src/filesystem-registry.ts:21` |
| 3 | `getFilesystem` | yes | `layers/agent-orchestration/filesystems/src/filesystem-registry.ts:25` |
| 4 | `listFilesystems` | yes | `layers/agent-orchestration/filesystems/src/filesystem-registry.ts:33` |
| 5 | `updateFilesystemState` | yes | `layers/agent-orchestration/filesystems/src/filesystem-registry.ts:55` |
| 6 | `deleteFilesystem` | yes | `layers/agent-orchestration/filesystems/src/filesystem-registry.ts:63` |
| 7 | `saveInjection` | yes | `layers/agent-orchestration/filesystems/src/filesystem-registry.ts:67` |
| 8 | `deleteInjection` | yes | `layers/agent-orchestration/filesystems/src/filesystem-registry.ts:74` |
| 9 | `listInjectedFilesystemsForProvisioning` | yes | `layers/agent-orchestration/filesystems/src/injected-filesystems-for-provisioning.ts:53` |
| 10 | `inspectLocalPath` | yes | `layers/agent-orchestration/filesystems/src/inspect-local-path.ts:37` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `FilesystemReachabilityInput` (interface, public) `layers/agent-orchestration/filesystems/src/filesystem-reachability.ts:62` — members: `id`, `teamId`, `source`, `kind`, `connectionId`, `resourceRef`, `writeback`, `state`, `createdAt`
- `FilesystemRow` (type, public) `layers/agent-orchestration/filesystems/src/filesystem-registry.ts:11`
- `NewFilesystem` (type, public) `layers/agent-orchestration/filesystems/src/filesystem-registry.ts:12`
- `NewFilesystemInjection` (type, public) `layers/agent-orchestration/filesystems/src/filesystem-registry.ts:13`
- `FilesystemFilter` (interface, public) `layers/agent-orchestration/filesystems/src/filesystem-registry.ts:15` — members: `teamId`, `agentId`, `ids`
- `InjectedFilesystemForProvisioning` (interface, public) `layers/agent-orchestration/filesystems/src/injected-filesystems-for-provisioning.ts:33` — members: `id`, `teamId`, `source`, `kind`, `connectionId`, `resourceRef`, `writeback`, `state`, `createdAt`
- `LocalPathInfo` (interface, public) `layers/agent-orchestration/filesystems/src/inspect-local-path.ts:22` — members: `exists`, `isGitRepo`, `branch`
- `FilesystemsGitRunnerFactory` (type, public) `layers/agent-orchestration/filesystems/src/ports.ts:32`
- `FilesystemsServiceConnectionResolver` (interface, public) `layers/agent-orchestration/filesystems/src/ports.ts:34` — members: `resolve`
