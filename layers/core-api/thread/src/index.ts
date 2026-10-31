/**
 * Barrel for @hyperidle/thread (core-api Layer, SQL-owning Service).
 * Typed functions only — must NOT re-export raw `threads`/`messages` pgTable objects (table ownership).
 */

export { createThreadActions, type ThreadActionsDeps } from "./thread-actions.js";
export type {
	AppMessageRow,
	MessageFilter,
	ThreadFilter,
	ThreadSearchRow,
} from "./thread-service.js";
export {
	findThread,
	listMessages,
	listReviewsOpenedBy,
	listThreads,
	searchAppMessages,
	searchConversations,
	upsertReviewOpened,
} from "./thread-service.js";
export { registerThreadSessionLiveUpdates } from "./thread-session-live-updates.js";
export type { BakedThreadTurnRequest, ThreadTurnResolverDeps } from "./thread-turn-resolver.js";
export { resolveThreadTurnRequest } from "./thread-turn-resolver.js";
