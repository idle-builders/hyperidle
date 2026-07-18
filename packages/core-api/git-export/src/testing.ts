/**
 * @hyperidle/git-export/testing — test doubles + internalized helpers.
 *
 * Exported from the `/testing` subpath (NOT the main barrel). Import here
 * only from test files; production code must use the main barrel.
 *
 * Includes:
 *  - GitRunner test doubles (createFakeGitRunner, FakeGitRunner, FakeGitCall)
 *  - resetExportMutexes (test teardown helper)
 *  - FsAdapter type + createNodeFsAdapter (for creating fake fs stubs)
 *  - Orchestration internals: computeExportPlan, buildCommitMessage,
 *    EXPORTED_KINDS, EXPORTED_STATUSES, ExportPlan, ExportPlanEntry,
 *    GitExportTrigger
 *  - Config internals: loadGitExportConfig, writeLastCommit, writeLastPush,
 *    redactRemoteUrl, and all sanitizers
 */

// ── Orchestration internals ────────────────────────────────────────────────
export type {
	ExportPlan,
	ExportPlanEntry,
	FsAdapter,
	GitExportTrigger,
} from "./git-export.js";
export {
	buildCommitMessage,
	computeExportPlan,
	createNodeFsAdapter,
	EXPORTED_KINDS,
	EXPORTED_STATUSES,
	resetExportMutexes,
} from "./git-export.js";
// ── Config internals ───────────────────────────────────────────────────────
export type { SanitizeRemoteUrlOptions } from "./git-export-config.js";
export {
	loadGitExportConfig,
	redactRemoteUrl,
	sanitizeAuthorEmail,
	sanitizeAuthorName,
	sanitizeBranch,
	sanitizePathSegment,
	sanitizeRemoteUrl,
	sanitizeRepoPath,
	writeLastCommit,
	writeLastPush,
} from "./git-export-config.js";
// ── GitRunner test doubles ─────────────────────────────────────────────────
export type { FakeGitCall, FakeGitRunner } from "./git-export-runner.js";
export { createFakeGitRunner } from "./git-export-runner.js";
