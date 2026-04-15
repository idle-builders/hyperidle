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
