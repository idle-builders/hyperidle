// @lore AU21 §9 Increment 8 (Decision F2): `startWatcher`/`FileWatcher`/
// `FileWatcherConfig` relocated wholesale to `@hyperidle/run-orchestration`'s
// `file-watcher.ts` — zero DB coupling, only ever called at session-launch
// time, and an agent-orchestration package may not import a core-api Service
// directly (Mechanism B).
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
	listFilesystems,
	saveFilesystem,
	saveInjection,
	updateFilesystemState,
} from "./filesystem-registry.js";
export type { LocalPathInfo } from "./inspect-local-path.js";
export { inspectLocalPath } from "./inspect-local-path.js";
export type {
	FilesystemsGitRunnerFactory,
	FilesystemsServiceConnectionResolver,
} from "./ports.js";
export type { InjectedFilesystemForAgent } from "./resolve-injected-filesystems-for-agent.js";
// AU21 §9 Increment 12 follow-up (F2 gap closure) — the emit-time bake helper
// every per-kind resolver calls to resolve an agent's injected filesystems at
// EMIT TIME, replacing the deleted `CoreApiPort.filesystems.listFilesystemsByAgent`
// seam call. See this module's own top-of-file `@lore`.
export { resolveInjectedFilesystemsForAgent } from "./resolve-injected-filesystems-for-agent.js";
