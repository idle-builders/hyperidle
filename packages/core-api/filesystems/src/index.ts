/**
 * Barrel for @hyperidle/filesystems (core-api Layer).
 *
 * Typed functions only. `filesystems` owns THREE tables — `filesystems`,
 * `filesystemInjections`, `filesystemCaptures` (confirmed this increment;
 * see `filesystem-registry.ts`'s and `ports.ts`'s headers for the §14 `⛁*`
 * resolution). Every foreign-Service reach (`git-export`, `work`,
 * `connections`, `capture-writeback`) is an injected DI port (`ports.ts`) —
 * never a raw cross-package import.
 *
 * @lore AU19 Increment 2b: real cut-over — the filesystem/* adapter seam
 * (`mount-adapter.ts`, `mounter-registry.ts`, `git-clone-adapter.ts`,
 * `git-worktree-adapter.ts`, `local-folder-adapter.ts`,
 * `cloud-not-built-adapter.ts`, `scaffolding-paths.ts`, `capture-store.ts`)
 * plus `file-watcher.ts`, `filesystem-reachability.ts`,
 * `inspect-local-path.ts`, `dependency-watcher.ts` moved here from
 * `packages/server/src/filesystem/` + `packages/server/src/services/`
 * (behavior-preserving move; every raw cross-Service table/function access
 * became an injected DI port). Closes the `filesystems` slice of Increment 2
 * (core-api non-SQL Services).
 */

// -- capture-store (filesystem_captures) --
export type { FilesystemCaptureInput } from "./capture-store.js";
export { writeFilesystemCapture } from "./capture-store.js";
// -- cloud-not-built-adapter --
export { CloudNotBuiltAdapter } from "./cloud-not-built-adapter.js";
// -- dependency-watcher --
export { checkAndUnblockDependents } from "./dependency-watcher.js";
// -- file-watcher --
export type { FileWatcher, FileWatcherConfig } from "./file-watcher.js";
export { startWatcher } from "./file-watcher.js";
// -- filesystem-reachability (AO1) --
export type { FilesystemReachabilityInput, ProbeResult } from "./filesystem-reachability.js";
export {
	NoopAuthResolver,
	probeGitRemote,
	probeLocalPath,
	repoToUrl,
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
// -- git-clone-adapter --
export { GitCloneAdapter } from "./git-clone-adapter.js";
// -- git-worktree-adapter --
export { GitWorktreeAdapter } from "./git-worktree-adapter.js";
// -- inspect-local-path (AV1) --
export type { InspectLocalPathDeps, LocalPathInfo } from "./inspect-local-path.js";
export { inspectLocalPath } from "./inspect-local-path.js";
// -- local-folder-adapter --
export { LocalFolderAdapter } from "./local-folder-adapter.js";
// -- mount-adapter --
export type {
	AdapterCaptureResult,
	CaptureContext,
	MountAdapter,
	MountContext,
} from "./mount-adapter.js";
// -- mounter-registry --
export type { AdapterDeps } from "./mounter-registry.js";
export {
	isLocalRepoPath,
	MalformedFilesystemError,
	RegistryFilesystemMounter,
	selectMountAdapter,
} from "./mounter-registry.js";
// -- ports (Mechanism C — DI-injected outbound edges) --
export type {
	FilesystemsAgentWorkIntentInput,
	FilesystemsAgentWorkIntentKind,
	FilesystemsAgentWorkIntentRecord,
	FilesystemsAgentWorkIntentRecorder,
	FilesystemsGitConfigInjection,
	FilesystemsGitRunner,
	FilesystemsGitRunnerFactory,
	FilesystemsServiceConnectionResolver,
	FilesystemsWorkStore,
	FilesystemsWritebackChange,
	FilesystemsWritebackConfig,
	FilesystemsWritebackProcessor,
	FilesystemsWritebackResult,
} from "./ports.js";
// -- scaffolding-paths (AO2 §8) --
export {
	EMITTED_ROOTS_AGENTS_MD,
	EMITTED_ROOTS_CLAUDE_SETTINGS,
	EMITTED_ROOTS_CLI_MCP_CONFIG,
	EMITTED_ROOTS_CODEX_HOME,
	EMITTED_ROOTS_CONTEXT_ASSEMBLY,
	EMITTED_ROOTS_MCP_JSON,
	EMITTED_ROOTS_OPENCODE_PLUGIN,
	SANDBOX_SCAFFOLDING_PATHS,
} from "./scaffolding-paths.js";
