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
export { scoreItem, rankAndBudget } from "./relevance-scoring.js";
export { countTokens, countItemTokens, enforceBudget } from "./token-budget.js";
export type { ScoredItem } from "./token-budget.js";
export {
	loadScoringWeights,
	getDefaultWeights,
	DEFAULT_KNOWLEDGE_BUDGET,
	CONTEXT_WINDOW_TOKENS,
	KNOWLEDGE_ALLOCATION_RATIO,
	BUDGET_ALLOCATION,
} from "./scoring-config.js";
export type { ScoringWeights, ScoringContext } from "./scoring-config.js";
