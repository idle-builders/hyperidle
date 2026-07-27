/**
 * @hyperidle/git-export/testing — test doubles + internalized helpers.
 *
 * Exported from the `/testing` subpath (NOT the main barrel). Import here
 * only from test files; production code must use the main barrel.
 *
 * Includes:
 *  - resetExportMutexes (test teardown helper)
 *  - FsAdapter type + createNodeFsAdapter (for creating fake fs stubs)
 *  - Orchestration internals: computeExportPlan, buildCommitMessage,
 *    EXPORTED_KINDS, EXPORTED_STATUSES, ExportPlan, ExportPlanEntry,
 *    GitExportTrigger
 *  - Config internals: loadGitExportConfig and writeExportMeta,
 *    redactRemoteUrl, and all sanitizers
 */

// ── Orchestration internals ────────────────────────────────────────────────
export {
	buildCommitMessage,
	computeExportPlan,
	createNodeFsAdapter,
	EXPORTED_KINDS,
	EXPORTED_STATUSES,
	resetExportMutexes,
} from "./git-export.js";
// ── Config internals ───────────────────────────────────────────────────────
export {
	loadGitExportConfig,
	redactRemoteUrl,
	sanitizeAuthorEmail,
	sanitizeAuthorName,
	sanitizeBranch,
	sanitizePathSegment,
	sanitizeRemoteUrl,
	sanitizeRepoPath,
	writeExportMeta,
} from "./git-export-config.js";
