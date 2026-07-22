export type { FileWatcher, FileWatcherConfig } from "./file-watcher.js";
export { startWatcher } from "./file-watcher.js";
export type { FilesystemReachabilityInput } from "./filesystem-reachability.js";
export { resolveFilesystemState } from "./filesystem-reachability.js";
export type {
	FilesystemFilter,
	FilesystemRow,
	NewFilesystem,
	NewFilesystemInjection,
} from "./filesystem-registry.js";
export {
	deleteFilesystem,
	deleteInjection,
	getFilesystem,
	listCaptures,
	listFilesystems,
	saveFilesystem,
	saveInjection,
	updateFilesystemState,
} from "./filesystem-registry.js";
export type { LocalPathInfo } from "./inspect-local-path.js";
export { inspectLocalPath } from "./inspect-local-path.js";
export type { AdapterDeps } from "./mounter-registry.js";
export { RegistryFilesystemMounter } from "./mounter-registry.js";
export type {
	FilesystemsGitRunnerFactory,
	FilesystemsServiceConnectionResolver,
} from "./ports.js";
export { SANDBOX_SCAFFOLDING_PATHS } from "./scaffolding-paths.js";
