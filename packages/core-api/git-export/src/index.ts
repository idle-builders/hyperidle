/**
 * Barrel for @hyperidle/git-export (core-api Layer, non-SQL orchestration Service).
 *
 * Typed functions only. `git-export` owns ZERO tables — its config lives in
 * `server_config.gitExport`, owned by `settings` and reached through an
 * injected `GitExportServerConfigPort` (`ports.ts`). No `TABLE_OWNER` row is
 * added for `git-export` — there is nothing to own (same shape as `policy`'s
 * Increment 2a finding).
 *
 * @lore AU19 Increment 2c: this is the real cut-over — `git-export-runner.ts`
 * (the `GitRunner` interface + `createGitRunner` spawn implementation +
 * `FakeGitRunner` test double), `git-export.ts` (the export orchestrator +
 * `registerGitExportHandler` event listener), and `git-export-config.ts`
 * (the `server_config.gitExport` read/write surface + every sanitizer) moved
 * here from `packages/server/src/{services,config}/` (behavior-preserving
 * move — the one real outbound edge, `git-export → settings`, became an
 * injected `GitExportServerConfigPort` DI port, `ports.ts`). This closes the
 * `filesystems → git-export` forward-reference from Increment 2b: every real
 * `gitRunnerFactory` call site (`server-factory.ts`, `routes/filesystems.ts`
 * ×2, plus the AO1-filesystem-reachability/AO1-reachability-lane-b/
 * git-clone-adapter/git-worktree-adapter/git-worktree-live-proof test files)
 * now imports `createGitRunner` from `@hyperidle/git-export` instead of the
 * deleted `packages/server/src/services/git-export-runner.ts` — same closing
 * idiom as `work`'s `UserStoreReader` → `users`, Increment 1d.
 */

// -- export orchestrator (plan computation, disk write, git commit/push, event handler) --
export type {
	ExportPlan,
	ExportPlanEntry,
	FsAdapter,
	GitExportResult,
	GitExportTrigger,
	RegisterGitExportHandlerOptions,
	RunGitExportDeps,
} from "./git-export.js";
export {
	buildCommitMessage,
	computeExportPlan,
	createNodeFsAdapter,
	EXPORTED_KINDS,
	EXPORTED_STATUSES,
	registerGitExportHandler,
	resetExportMutexes,
	runGitExport,
} from "./git-export.js";
// -- export config (server_config.gitExport read/write + sanitizers) --
export type {
	GitExportConfig,
	GitExportConfigPatch,
	LastExportMeta,
	SanitizeRemoteUrlOptions,
} from "./git-export-config.js";
export {
	getLastExportMeta,
	loadGitExportConfig,
	readGitExportConfig,
	redactRemoteUrl,
	sanitizeAuthorEmail,
	sanitizeAuthorName,
	sanitizeBranch,
	sanitizePathSegment,
	sanitizeRemoteUrl,
	sanitizeRepoPath,
	updateGitExportConfig,
	writeLastCommit,
	writeLastPush,
} from "./git-export-config.js";
// -- git runner (GitRunner interface + real/fake implementations) --
export type {
	CreateGitRunnerOptions,
	FakeGitCall,
	FakeGitRunner,
	GitConfigInjection,
	GitRunner,
} from "./git-export-runner.js";
export { createFakeGitRunner, createGitRunner } from "./git-export-runner.js";
// -- ports (Mechanism C — DI-injected outbound edges) --
export type {
	GitExportConfigDeps,
	GitExportConfigSection,
	GitExportConfigSectionPatch,
	GitExportDeps,
	GitExportKnowledgeItemProjection,
	GitExportKnowledgeItemRow,
	GitExportKnowledgeReader,
	GitExportServerConfigPort,
} from "./ports.js";
