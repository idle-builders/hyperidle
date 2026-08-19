# Destroyer input — `filesystem-mounting` (agent-orchestration)

Package: `layers/agent-orchestration/filesystem-mounting`
Surface: 0 exported functions, 1 classes (2 member methods), 2 interface/type declarations, 1 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|

## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT

### `RegistryFilesystemMounter` — `layers/agent-orchestration/filesystem-mounting/src/mounter-registry.ts:290` (public)
- `RegistryFilesystemMounter.mount`
- `RegistryFilesystemMounter.captureBack`

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `AdapterDeps` (interface, public) `layers/agent-orchestration/filesystem-mounting/src/mounter-registry.ts:30` — members: `gitRunnerFactory`, `capturesDir`, `db`
- `MountingGitRunnerFactory` (type, public) `layers/agent-orchestration/filesystem-mounting/src/ports.ts:45`

## D. Const / enum exports

- `SANDBOX_SCAFFOLDING_PATHS` (const, public) `layers/agent-orchestration/filesystem-mounting/src/scaffolding-paths.ts:1`
