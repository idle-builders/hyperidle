/**
 * Barrel for @hyperidle/thread (core-api Layer, SQL-owning Service).
 *
 * Typed functions only — the barrel must not re-export the raw `threads`/
 * `messages` pgTable objects (Table ACL / Mechanism A). The three surviving
 * outside readers of the deleted `conversation` package (`search.ts`, the ws
 * authorizer, the routine scheduler binding) get their reads from here.
 */

export { createThreadActions, type ThreadActionsDeps } from "./thread-actions.js";
export type { MessageFilter, ThreadFilter, ThreadSearchRow } from "./thread-service.js";
export {
	findMessage,
	findOrCreateDirectThread,
	findThread,
	insertMessage,
	insertThread,
	listMessages,
	listThreads,
	resolveMessageIfUnresolved,
	searchConversations,
	searchThreadsByTitle,
	updateMessage,
	updateThread,
} from "./thread-service.js";
export type { BakedThreadTurnRequest, ThreadTurnResolverDeps } from "./thread-turn-resolver.js";
export { resolveThreadTurnRequest } from "./thread-turn-resolver.js";
