export { isValidLayer, layerDepth } from "./layers.js";
export { ItemDeletedError, VersionConflictError } from "./errors.js";
export {
	knowledgeEvents,
	getKnowledgeEvents,
	setKnowledgeEventBus,
	KnowledgeEventType,
} from "./events.js";
export type { KnowledgeItemUpdatedEvent, KnowledgeEventEmitterLike } from "./events.js";
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
export { scoreItem, rankAndBudget } from "./relevance-scoring.js";
export { ROLE_TO_COMMUNITY } from "./role-community-map.js";
export { countTokens, countItemTokens, enforceBudget } from "./token-budget.js";
export type { ScoredItem } from "./token-budget.js";
export {
	loadScoringWeights,
	getDefaultWeights,
	DEFAULT_KNOWLEDGE_BUDGET,
	CONTEXT_WINDOW_TOKENS,
	KNOWLEDGE_ALLOCATION_RATIO,
	BUDGET_ALLOCATION,
	ATTENTION_THRESHOLD,
	loadAttentionWeights,
	getDefaultAttentionWeights,
} from "./scoring-config.js";
export type {
	ScoringWeights,
	ScoringContext,
	AttentionWeights,
} from "./scoring-config.js";
export { isTasteSensitive } from "./attention-classifier.js";
export {
	scoreAttention,
	scoreAttentionBatch,
	buildAttentionContext,
	cohortKey,
	crossScopeKey,
} from "./attention-scoring.js";
export type { AttentionScoringContext } from "./attention-scoring.js";
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
export {
	resolveConflict,
	mergeStructuredEdits,
	canPromote,
	resolveConflictRecord,
	promote,
} from "./conflict-resolution.js";
export type {
	ConcurrentEdit,
	FieldConflict,
	MergeResult,
	ConflictResult,
} from "./conflict-resolution.js";
export {
	AUTO_PROMOTION_REPETITION_THRESHOLD,
	AUTO_PROMOTION_EDITOR,
	DEFAULT_SWEEP_MAX_BATCH_SIZE,
	STALE_THRESHOLD_MS,
	checkAutoPromotion,
	detectLayerContradiction,
	findStaleItems,
	markStale,
	runAutoPromotionSweep,
	runStaleSweep,
} from "./promotion-pipeline.js";
export type {
	AutoPromotionResult,
	ContradictionResult,
	AutoPromotionSweepResult,
	StaleSweepResult,
} from "./promotion-pipeline.js";
