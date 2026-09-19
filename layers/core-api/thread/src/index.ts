/**
 * Barrel for @hyperidle/thread (core-api Layer, SQL-owning Service).
 *
 * Typed functions only — the barrel must not re-export the raw `threads`/
 * `messages` pgTable objects (Table ACL / Mechanism A). The three surviving
 * outside readers of the deleted `conversation` package (`search.ts`, the ws
 * authorizer, the routine scheduler binding) get their reads from here.
 *
 * @lore BC3 review fix: `updateThread`, `updateMessage`,
 * `resolveMessageIfUnresolved`, `searchThreadsByTitle` and `findMessage` are
 * unexported — no production code outside this module imported them (only
 * tests did; house rule: test-only reachable = dead). They still have
 * production callers INSIDE the module (`thread-actions.ts`, via the `store`
 * namespace import of `thread-service.js`, not through this barrel).
 * `findOrCreateDirectThread` had no caller anywhere, in or out of the
 * module, and its fixed `recipientId`-hosts shape didn't match
 * `send_message`'s actual rule (whichever party is the agent hosts —
 * `thread-actions.ts`'s single-recipient branch) — deleted rather than
 * exported. `findThreadForUpdate` (the row-locked read the join-on-post race
 * fix needs) is the same shape: a module-internal helper, no barrel export.
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
