/**
 * Barrel for @hyperidle/git-export (core-api Layer).
 *
 * Public surface — ~22 exports across five coherent surfaces:
 *   A. Git-execution platform  (createGitRunner + 3 types)
 *   B. Export operation        (runGitExport + 2 types)
 *   C. Export event wiring     (registerGitExportHandler + 1 type)
 *   D. Export config accessor  (read/update/getMeta + 3 types)
 *   E. DI port bag             (7 structural types)
 *
 * Orchestration internals, sanitizers, and config helpers are available from the
 * `@hyperidle/git-export/testing` subpath — not product surface.
 *
 * @lore AU20 Am8: collapsed from 47 exports → ~22; config/sanitizer
 * sprawl and orchestration internals internalized; test doubles moved to
 * /testing subpath; GitExportConfigDeps sub-bag collapsed away.
 * Validation folded into updateGitExportConfig (returns ok/error result).
 * readGitExportConfig now returns a redacted remoteUrl for safe HTTP use.
 */

// ── B. Export operation ────────────────────────────────────────────────────
// ── C. Export event wiring ─────────────────────────────────────────────────
export type {
	GitExportResult,
	RegisterGitExportHandlerOptions,
	RunGitExportDeps,
} from "./git-export.js";
export { registerGitExportHandler, runGitExport } from "./git-export.js";
// ── D. Export config accessor ──────────────────────────────────────────────
export type {
	GitExportConfig,
	GitExportConfigPatch,
	LastExportMeta,
	UpdateGitExportConfigResult,
} from "./git-export-config.js";
export {
	getLastExportMeta,
	readGitExportConfig,
	updateGitExportConfig,
} from "./git-export-config.js";
// ── A. Git-execution platform ──────────────────────────────────────────────
export type {
	CreateGitRunnerOptions,
	GitConfigInjection,
	GitRunner,
} from "./git-export-runner.js";
export { createGitRunner } from "./git-export-runner.js";

// ── E. DI port bag ─────────────────────────────────────────────────────────
export type {
	GitExportConfigSection,
	GitExportConfigSectionPatch,
	GitExportDeps,
	GitExportKnowledgeItemRow,
	GitExportKnowledgeReader,
	GitExportServerConfigPort,
} from "./ports.js";
