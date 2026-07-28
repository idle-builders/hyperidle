/**
 * Barrel for @hyperidle/conversation (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `threads`/
 * `messages` pgTable objects — that would let a consumer obtain a table
 * transitively and defeat Table ACL (Mechanism A). Consumers get typed
 * functions; the tables stay private to this Service.
 *
 * @lore AU19 Increment 1e: this is the real cut-over — `conversation-store.ts`
 * moved here unchanged (behavior-preserving move) from
 * `packages/server/src/services/`. `conversation` has ZERO real outbound
 * Service edges per architecture §10.1/§10.2's census (no `| conversation |`
 * source row exists anywhere in the 110-edge census — every edge to
 * `conversation` is inbound) — a pure leaf domain like `users`/`knowledge`, so
 * no `ports.ts` / Mechanism C DI is needed for this Service's own outbound
 * composition. `conversation`'s many inbound consumers (`notifications`,
 * `policy`, `realtime`, `review`, `dispatch`, `session-requests`, `tools`, plus
 * every `packages/server` route that reads or writes a thread/message row)
 * are all repointed to this package's real exports at their call sites.
 * `work-service.ts`'s comments referencing `conversation-store` are prose
 * only (no import) — Work never imports Conversation directly (§10.2 has no
 * `work → conversation` edge).
 *
 * @lore AU20 Am5: redesigned from 29 bespoke functions to ~14 general ones.
 * Removed: `getThreadById`, `getThreadByDirectKey`, `getFirstThreadByHost`,
 * `getFirstPinnedThreadByHost`, `getThreadIdsByHost`, `listThreadsByHost`,
 * `listThreadsByHostKind`, `listThreadsByParticipant`, `listThreadsByRecency`,
 * `listThreadMetaByIds`, `getMessageById`, `getMessageByClientKey`,
 * `listMessagesByThread`, `getMessagesByThreadIds`, `listUnresolvedReviewThreadIds`,
 * `listVerdictItemIds`, `listInitiatedVerdictMessages`,
 * `listVerdictMessagesByItemIds`, `listInboxBySenderExclusion`,
 * `listInboxByParticipantProbe`, `VerdictMessageRow`, `MessageListOpts`.
 * Replaced by: `findThread`, `listThreads`, `findMessage`, `listMessages`,
 * `listInbox` with `ThreadFilter`, `MessageFilter`, `InboxFilter`.
 */

// -- assistant-turn resolver (AU21 §6 Decision B — emit-time resolve+bake) --
export type {
	AssistantTurnResolverDeps,
	BakedAssistantTurnRequest,
} from "./assistant-turn-resolver.js";
export {
	AssistantTurnSourceUnavailableError,
	resolveAssistantTurnRequest,
} from "./assistant-turn-resolver.js";
// Filter types
// Shared row types
export type {
	ArtifactThreadSummaryRow,
	InboxFilter,
	InboxRow,
	MessageFilter,
	ThreadFilter,
	ThreadSearchRow,
} from "./conversation-store.js";
// CRUD writes
// DM composite
// General reads
// Joined / aggregate surfaces
export {
	countThreads,
	findMessage,
	findOrCreateDirectThread,
	findThread,
	getArtifactThreadSummaries,
	insertMessage,
	insertThread,
	listInbox,
	listMessages,
	listThreads,
	resolveMessageIfUnresolved,
	searchConversations,
	updateMessage,
	updateThread,
} from "./conversation-store.js";
