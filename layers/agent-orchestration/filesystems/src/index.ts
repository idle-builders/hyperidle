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
export type { InjectedFilesystemForProvisioning } from "./injected-filesystems-for-provisioning.js";
// AU26 F2 — the LIVE, in-layer read one spawn performs. It replaces AU21 §9
// Increment 12's emit-time bake helper outright: no per-kind resolver calls
// anything about filesystems any more, and nothing about filesystems rides the
// request. See this module's own top-of-file `@lore`.
export { listInjectedFilesystemsForProvisioning } from "./injected-filesystems-for-provisioning.js";
export type { LocalPathInfo } from "./inspect-local-path.js";
export { inspectLocalPath } from "./inspect-local-path.js";
export type {
	FilesystemsGitRunnerFactory,
	FilesystemsServiceConnectionResolver,
	FilesystemTokenResolver,
} from "./ports.js";
