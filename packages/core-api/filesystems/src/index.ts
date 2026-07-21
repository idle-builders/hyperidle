/**
 * Barrel for @hyperidle/filesystems (core-api Layer).
 *
 * AU20 R-filesystems: census reduced from 18m/10t to 16m/9t.
 *
 * DELETED from public surface:
 *   Methods: insertFilesystem, getFilesystemById, listFilesystemsByTeamId,
 *     listFilesystemsByIds, listFilesystemIdsByAgent, deleteFilesystemById,
 *     getFilesystemInjection, insertFilesystemInjection, deleteFilesystemInjection,
 *     NoopAuthResolver, ServiceConnectionResolverAdapter
 *   Types: ProbeResult, InspectLocalPathDeps, FilesystemsGitConfigInjection,
 *     FilesystemsGitRunner
 *
 * ADDED to public surface:
 *   Methods: saveFilesystem, getFilesystem, listFilesystems, deleteFilesystem,
 *     getInjection, saveInjection, deleteInjection, writeCapture, listCaptures
 *   Types: FilesystemFilter, FilesystemCaptureInput, AdapterDeps
 *
 * @lore AU20 R-filesystems: NoopAuthResolver / ServiceConnectionResolverAdapter
 * are caller-side concerns — routes/filesystems.ts inlines the adapter logic
 * in buildAuthResolver(). Tests use inline structural objects satisfying
 * FilesystemAuthResolver (@hyperidle/shared). probeGitRemote / probeLocalPath /
 * repoToUrl remain accessible to intra-package tests via the source module path.
 *
 * @lore AU20 R-filesystems: SANDBOX_SCAFFOLDING_PATHS stays in the barrel
 * because scaffolding-drift-guard.test.ts (packages/core-api composition root)
 * must import it cross-package. The constant is an owned capability the
 * git adapters require; moving it would require an import from another service.
 */

// -- file-watcher --
export type { FileWatcher, FileWatcherConfig } from "./file-watcher.js";
export { startWatcher } from "./file-watcher.js";
// -- filesystem-reachability --
export type { FilesystemReachabilityInput } from "./filesystem-reachability.js";
export { resolveFilesystemState } from "./filesystem-reachability.js";
// -- filesystem-registry (filesystems, filesystem_injections, filesystem_captures) --
export type {
	FilesystemCaptureInput,
	FilesystemFilter,
	FilesystemInjectionRow,
	FilesystemRow,
	NewFilesystem,
	NewFilesystemInjection,
} from "./filesystem-registry.js";
export {
	deleteFilesystem,
	deleteInjection,
	getFilesystem,
	getInjection,
	listCaptures,
	listFilesystems,
	saveFilesystem,
	saveInjection,
	updateFilesystemState,
	writeCapture,
} from "./filesystem-registry.js";
// -- inspect-local-path --
export type { LocalPathInfo } from "./inspect-local-path.js";
export { inspectLocalPath } from "./inspect-local-path.js";
// -- mounter-registry --
export type { AdapterDeps } from "./mounter-registry.js";
export { MalformedFilesystemError, RegistryFilesystemMounter } from "./mounter-registry.js";
// -- ports (Mechanism C — DI-injected outbound edges) --
export type {
	FilesystemsGitRunnerFactory,
	FilesystemsServiceConnectionResolver,
} from "./ports.js";
// -- scaffolding-paths --
export { SANDBOX_SCAFFOLDING_PATHS } from "./scaffolding-paths.js";
