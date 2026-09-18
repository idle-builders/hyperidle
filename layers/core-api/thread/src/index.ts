/**
 * Barrel for @hyperidle/thread (core-api Layer, SQL-owning Service).
 *
 * Typed functions only — the barrel must not re-export the raw `threads`/
 * `messages` pgTable objects (Table ACL / Mechanism A). The three surviving
 * outside readers of the deleted `conversation` package (`search.ts`, the ws
 * authorizer, the routine scheduler binding) get their reads from here.
 *
 * @lore BC3 review fix: `findOrCreateDirectThread`, `updateThread`,
 * `updateMessage`, `resolveMessageIfUnresolved`, `searchThreadsByTitle` and
 * `findMessage` are unexported — no production code outside this module
 * imported them (only tests did; house rule: test-only reachable = dead).
 * `updateThread`/`updateMessage`/`resolveMessageIfUnresolved`/`findMessage`/
 * `searchThreadsByTitle` still have production callers INSIDE the module
 * (`thread-actions.ts`, via the `store` namespace import of
 * `thread-service.js`, not through this barrel). `findOrCreateDirectThread`
 * has no caller anywhere, in or out of the module — `send_message`'s
 * single-recipient branch inlines the same find-or-create logic itself
 * rather than calling it; left in place (not this brief's file to edit) and
 * reported.
 */

export { createThreadActions, type ThreadActionsDeps } from "./thread-actions.js";
export type { MessageFilter, ThreadFilter, ThreadSearchRow } from "./thread-service.js";
export {
	findThread,
	insertMessage,
	insertThread,
	listMessages,
	listThreads,
	searchConversations,
} from "./thread-service.js";
export type { BakedThreadTurnRequest, ThreadTurnResolverDeps } from "./thread-turn-resolver.js";
export { resolveThreadTurnRequest } from "./thread-turn-resolver.js";
