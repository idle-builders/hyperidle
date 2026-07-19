/**
 * Barrel for @hyperidle/filesystems (core-api Layer).
 *
 * Typed functions only. `filesystems` owns THREE tables — `filesystems`,
 * `filesystemInjections`, `filesystemCaptures` (confirmed this increment;
 * see `filesystem-registry.ts`'s and `ports.ts`'s headers for the §14 `⛁*`
 * resolution). Every foreign-Service reach (`git-export`, `connections`) is an
 * injected DI port (`ports.ts`) — never a raw cross-package import.
 * `capture-writeback` is the one exception: the against-grain
 * `filesystems ⚠ capture-writeback` edge inverts through the `EventBus`
 * (AU19 Increment 3f, §10.3 line 517) rather than a DI port — `file-watcher.ts`
 * emits `sandbox_writeback_changes_detected` instead of calling an injected
 * processor.
 *
 * @lore AU20 Ag2: barrel collapsed from 61 → 32 exports. The internal adapter
 * seam (`GitCloneAdapter`, `GitWorktreeAdapter`, `LocalFolderAdapter`,
 * `CloudNotBuiltAdapter`, `AdapterDeps`, `AdapterCaptureResult`,
 * `CaptureContext`, `MountAdapter`, `MountContext`, `selectMountAdapter`,
 * `isLocalRepoPath`), internal capture-store exports
 * (`FilesystemCaptureInput`, `writeFilesystemCapture`), internal probe
 * internals (`probeGitRemote`, `probeLocalPath`, `repoToUrl`), and the
 * work-facing DI-port mirrors (`FilesystemsWorkStore`,
 * `FilesystemsAgentWorkIntent*`, `checkAndUnblockDependents`) are no longer
 * re-exported — they are module-internal. The 7 `EMITTED_ROOTS_*` constants
 * are authored by `context-assembly`, `harness-registry`, and
 * `session-lifecycle` respectively; the drift-guard test imports them there
 * directly. `checkAndUnblockDependents` relocated to `@hyperidle/work`.
 */

// -- file-watcher --
export type { FileWatcher, FileWatcherConfig } from "./file-watcher.js";
export { startWatcher } from "./file-watcher.js";
// -- filesystem-reachability (AO1 public surface) --
export type { FilesystemReachabilityInput, ProbeResult } from "./filesystem-reachability.js";
export {
	NoopAuthResolver,
	resolveFilesystemState,
	ServiceConnectionResolverAdapter,
} from "./filesystem-reachability.js";
// -- filesystem-registry (filesystems, filesystem_injections) --
export type {
	FilesystemInjectionRow,
	FilesystemRow,
	NewFilesystem,
	NewFilesystemInjection,
} from "./filesystem-registry.js";
export {
	deleteFilesystemById,
	deleteFilesystemInjection,
	getFilesystemById,
	getFilesystemInjection,
	insertFilesystem,
	insertFilesystemInjection,
	listFilesystemIdsByAgent,
	listFilesystemsByIds,
	listFilesystemsByTeamId,
	updateFilesystemState,
} from "./filesystem-registry.js";
// -- inspect-local-path (AV1) --
export type { InspectLocalPathDeps, LocalPathInfo } from "./inspect-local-path.js";
export { inspectLocalPath } from "./inspect-local-path.js";
// -- mounter-registry (public product surface: mounter + error class) --
export { MalformedFilesystemError, RegistryFilesystemMounter } from "./mounter-registry.js";
// -- ports (Mechanism C — DI-injected outbound edges) --
export type {
	FilesystemsGitConfigInjection,
	FilesystemsGitRunner,
	FilesystemsGitRunnerFactory,
	FilesystemsServiceConnectionResolver,
} from "./ports.js";
// -- scaffolding-paths (AO2 §8 — single constant needed externally) --
export { SANDBOX_SCAFFOLDING_PATHS } from "./scaffolding-paths.js";
