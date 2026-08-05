/**
 * Barrel for `@hyperidle/filesystem-mounting` (agent-orchestration Layer,
 * SQL-owning Service — owns `filesystem_captures`).
 *
 * @lore AU26 F1 (§D-I): the mount engine — `RegistryFilesystemMounter`, its
 * four adapters (`LocalFolderAdapter`, `GitCloneAdapter`, `GitWorktreeAdapter`,
 * `CloudNotBuiltAdapter`) and `SANDBOX_SCAFFOLDING_PATHS` — relocated here from
 * the core-api `filesystems` Service. It runs at session provisioning time, and
 * its only non-test callers are `run-orchestration`'s
 * `filesystem-provisioning.ts` and `provisioner.ts`, both in this Layer.
 *
 * `filesystem_captures` comes WITH the engine: the engine is its only writer,
 * its FK points at `sessions`, and `listCaptures` had zero non-test readers, so
 * that read surface was deleted rather than carried across (test-only reachable
 * ⇒ dead surface).
 *
 * What did NOT move (founder-approved split): the filesystem RECORD
 * (`filesystem-registry.ts`) and the reachability PROBE
 * (`filesystem-reachability.ts` / `inspect-local-path.ts`) stay in
 * `@hyperidle/filesystems` — `filesystems` is still a core-owned table.
 */

export type { AdapterDeps } from "./mounter-registry.js";
export { RegistryFilesystemMounter } from "./mounter-registry.js";
export type { MountingGitRunnerFactory } from "./ports.js";
export { SANDBOX_SCAFFOLDING_PATHS } from "./scaffolding-paths.js";
