/**
 * Barrel for @hyperidle/thread (core-api Layer, SQL-owning Service).
 * Typed functions only — must NOT re-export raw `threads`/`messages` pgTable objects (table ownership).
 */

export {
	type AgentInboxTell,
	createThreadActions,
	type ThreadActionsDeps,
} from "./thread-actions.js";
export type {
	AppMessageRow,
	MessageFilter,
	ThreadFilter,
	ThreadSearchRow,
} from "./thread-service.js";
export {
	canRelayHuddleSignal,
	endLiveHuddles,
	findLiveHuddlesForPerson,
	findThread,
	listMessages,
	listThreads,
	searchAppMessages,
	searchConversations,
} from "./thread-service.js";
export { registerThreadSessionLiveUpdates } from "./thread-session-live-updates.js";
