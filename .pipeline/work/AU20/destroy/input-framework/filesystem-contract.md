# Destroyer input — `filesystem-contract` (framework)

Package: `framework/filesystem-contract`
Surface: 0 exported functions, 0 classes (0 member methods), 12 interface/type declarations, 4 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `FilesystemKind` (type, public) `framework/filesystem-contract/src/filesystem.ts:9`
- `WriteBack` (type, public) `framework/filesystem-contract/src/filesystem.ts:13`
- `FilesystemState` (type, public) `framework/filesystem-contract/src/filesystem.ts:20`
- `FilesystemSource` (type, public) `framework/filesystem-contract/src/filesystem.ts:27`
- `ResourceRef` (type, public) `framework/filesystem-contract/src/filesystem.ts:30`
- `Filesystem` (interface, public) `framework/filesystem-contract/src/filesystem.ts:36` — members: `id`, `teamId`, `source`, `kind`, `connectionId`, `resourceRef`, `writeback`, `state`, `createdAt`
- `FilesystemInjection` (interface, public) `framework/filesystem-contract/src/filesystem.ts:54` — members: `agentUserId`, `filesystemId`, `createdAt`
- `FilesystemAuth` (interface, public) `framework/filesystem-contract/src/filesystem.ts:64` — members: `connectionId`, `provision`
- `FilesystemAuthResolver` (interface, public) `framework/filesystem-contract/src/filesystem.ts:77` — members: `canResolve`, `sourceOf`, `resolve`, `resolveToken`
- `MountResult` (interface, public) `framework/filesystem-contract/src/filesystem.ts:104` — members: `success`, `sandboxPath`, `error`
- `CaptureResult` (interface, public) `framework/filesystem-contract/src/filesystem.ts:111` — members: `success`, `captured`, `error`
- `FilesystemMounter` (interface, public) `framework/filesystem-contract/src/filesystem.ts:123` — members: `mount`, `captureBack`

## D. Const / enum exports

- `FILESYSTEM_KINDS` (const, public) `framework/filesystem-contract/src/filesystem.ts:8`
- `WRITEBACK_MODES` (const, public) `framework/filesystem-contract/src/filesystem.ts:12`
- `SUBSTRATE_STATES` (const, public) `framework/filesystem-contract/src/filesystem.ts:19`
- `FILESYSTEM_SOURCES` (const, public) `framework/filesystem-contract/src/filesystem.ts:26`
