export { isValidLayer, layerDepth } from "./layers.js";
export { VersionConflictError } from "./errors.js";
export { knowledgeEvents, KnowledgeEventType } from "./events.js";
export type { KnowledgeItemUpdatedEvent } from "./events.js";
export { setupFts } from "./fts.js";
export {
	create,
	getById,
	update,
	list,
	search,
} from "./knowledge-repository.js";
export type {
	CreateKnowledgeItemInput,
	UpdateKnowledgeItemInput,
	ListFilters,
} from "./knowledge-repository.js";
export { materialize } from "./materialization.js";
export type {
	MaterializationConfig,
	MaterializationResult,
	ManifestEntry,
	Manifest,
} from "./materialization.js";
export { buildSessionContext } from "./session-context.js";
export type { SessionContextConfig, SessionContextData } from "./session-context.js";
export { startWatcher } from "./file-watcher.js";
export type { FileWatcher, FileWatcherConfig } from "./file-watcher.js";
export { startPollingWatcher } from "./polling-watcher.js";
export {
	processWriteback,
	readManifest,
	writeManifest,
	getRelativePath,
	isKnowledgePath,
	isSessionNotesPath,
	isWatchedPath,
} from "./writeback.js";
export type { WritebackConfig, WritebackChange, WritebackResult } from "./writeback.js";
