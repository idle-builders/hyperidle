export { isTasteSensitive } from "./attention-classifier.js";
export type { AttentionScoringContext } from "./attention-scoring.js";
export {
	buildAttentionContext,
	cohortKey,
	crossScopeKey,
	scoreAttention,
	scoreAttentionBatch,
} from "./attention-scoring.js";
export type {
	ConcurrentEdit,
	ConflictResult,
	FieldConflict,
	MergeResult,
} from "./conflict-resolution.js";
export {
	canPromote,
	mergeStructuredEdits,
	promote,
	resolveConflict,
	resolveConflictRecord,
} from "./conflict-resolution.js";
export { ItemDeletedError, VersionConflictError } from "./errors.js";
export type { KnowledgeEventEmitterLike, KnowledgeItemUpdatedEvent } from "./events.js";
export {
	getKnowledgeEvents,
	KnowledgeEventType,
	knowledgeEvents,
	setKnowledgeEventBus,
} from "./events.js";
export type { FileWatcher, FileWatcherConfig } from "./file-watcher.js";
export { startWatcher } from "./file-watcher.js";
export { setupFts } from "./fts.js";
export type {
	CreateKnowledgeItemInput,
	ListFilters,
	UpdateKnowledgeItemInput,
} from "./knowledge-repository.js";
export {
	create,
	getById,
	list,
	search,
	update,
} from "./knowledge-repository.js";
export { isValidLayer, layerDepth } from "./layers.js";
export type {
	Manifest,
	ManifestEntry,
	MaterializationConfig,
	MaterializationResult,
} from "./materialization.js";
export { materialize } from "./materialization.js";
export { startPollingWatcher } from "./polling-watcher.js";
export type {
	AutoPromotionResult,
	AutoPromotionSweepResult,
	ContradictionResult,
	StaleSweepResult,
} from "./promotion-pipeline.js";
export {
	AUTO_PROMOTION_EDITOR,
	AUTO_PROMOTION_REPETITION_THRESHOLD,
	checkAutoPromotion,
	DEFAULT_SWEEP_MAX_BATCH_SIZE,
	detectLayerContradiction,
	findStaleItems,
	markStale,
	runAutoPromotionSweep,
	runStaleSweep,
	STALE_THRESHOLD_MS,
} from "./promotion-pipeline.js";
export { rankAndBudget, scoreItem } from "./relevance-scoring.js";
export { ROLE_TO_COMMUNITY } from "./role-community-map.js";
export type {
	AttentionWeights,
	ScoringContext,
	ScoringWeights,
} from "./scoring-config.js";
export {
	ATTENTION_THRESHOLD,
	BUDGET_ALLOCATION,
	CONTEXT_WINDOW_TOKENS,
	DEFAULT_KNOWLEDGE_BUDGET,
	getDefaultAttentionWeights,
	getDefaultWeights,
	KNOWLEDGE_ALLOCATION_RATIO,
	loadAttentionWeights,
	loadScoringWeights,
} from "./scoring-config.js";
export type { SessionContextConfig, SessionContextData } from "./session-context.js";
export { buildSessionContext } from "./session-context.js";
export type { ScoredItem } from "./token-budget.js";
export { countItemTokens, countTokens, enforceBudget } from "./token-budget.js";
export type { WritebackChange, WritebackConfig, WritebackResult } from "./writeback.js";
export {
	getRelativePath,
	isKnowledgePath,
	isSessionNotesPath,
	isWatchedPath,
	processWriteback,
	readManifest,
	writeManifest,
} from "./writeback.js";
