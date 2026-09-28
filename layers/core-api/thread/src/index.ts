/**
 * Barrel for @hyperidle/thread (core-api Layer, SQL-owning Service).
 * Typed functions only — must NOT re-export raw `threads`/`messages` pgTable objects (Table ACL, Mechanism A).
 */

export { createThreadActions, type ThreadActionsDeps } from "./thread-actions.js";
export type { MessageFilter, ThreadFilter, ThreadSearchRow } from "./thread-service.js";
export { findThread, listMessages, listThreads, searchConversations } from "./thread-service.js";
export type { BakedThreadTurnRequest, ThreadTurnResolverDeps } from "./thread-turn-resolver.js";
export { resolveThreadTurnRequest } from "./thread-turn-resolver.js";
