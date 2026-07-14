/**
 * Barrel for @hyperidle/session-requests (agent-orchestration Layer).
 *
 * Typed functions only. This barrel MUST NOT re-export a raw pgTable object —
 * that would let a consumer obtain a table transitively and defeat Table ACL
 * (Mechanism A). Consumers get typed functions; `agentWorkIntents`/
 * `agentSessionRequests`/`explicitSessionStarts` stay private to this Service.
 *
 * @lore AU19 Increment 3b: real cut-over — `agent-work-intents.ts`/
 * `agent-session-requests.ts`/`agent-work-intent-worker.ts`/
 * `session-run-registry.ts` moved here from `packages/server/src/services/`
 * (behavior-preserving move, aside from the DI-port signature additions
 * documented in `ports.ts`). Real outbound edges (`routine`, `work`,
 * `conversation`, `users`, `org`, `review`, `trigger-resolution`) plus one
 * interim edge (`agent-selection`, not yet migrated) and two interim
 * forward-references (`lifecycle-projection`'s `agent_lifecycle_inbox`,
 * not yet migrated) became injected DI ports (Mechanism C, see `ports.ts`).
 */

export {
	type ClaimRequestOptions,
	claimAgentSessionRequestById,
	claimNextAgentSessionRequest,
	createAgentSessionRequest,
	findAgentSessionRequestById,
	findAgentSessionRequestByIdempotencyKey,
	findAgentSessionRequestBySessionId,
	isAgentSessionRequestClaimActive,
	listAgentSessionRequestsBySource,
	listRunningAgentSessionRequests,
	markRequestRunning,
	releaseRequestClaim,
	renewAgentSessionRequestLease,
	type TerminalizeAgentSessionRequestInput,
	terminalizeAgentSessionRequest,
	terminalizeAgentSessionRequestInTx,
} from "./agent-session-requests.js";
export {
	AGENT_WORK_INTENT_FAILURE_CODES,
	type AgentWorkIntentWorkerOptions,
	claimAgentWorkIntent,
	renewAgentWorkIntentLease,
	resolveAuthoritativeInput,
} from "./agent-work-intent-worker.js";
export {
	AGENT_WORK_INTENT_KINDS,
	AGENT_WORK_RETENTION_BATCH_SIZE,
	AGENT_WORK_RETENTION_DAYS,
	type AgentWorkIntentDb,
	type AgentWorkIntentInput,
	type AgentWorkIntentKind,
	drainAgentWorkIntents,
	findAgentWorkIntentByKindAndSource,
	findAgentWorkIntentSourceByRequestId,
	reapTerminalAgentWorkIntents,
	recordAgentWorkIntent,
} from "./agent-work-intents.js";
export {
	findExplicitSessionStartById,
	markExplicitSessionStartAdmitted,
	markExplicitSessionStartFailed,
} from "./explicit-session-starts.js";
export type {
	AgentWorkIntentReapDeps,
	AgentWorkIntentWorkerDeps,
	MarkRequestRunningDeps,
	SessionRequestsAgentSelectionOutcome,
	SessionRequestsAgentSelectionRequest,
	SessionRequestsAgentSelector,
	SessionRequestsConversationReader,
	SessionRequestsGrantedProposedCall,
	SessionRequestsKnowledgeReader,
	SessionRequestsLifecycleInboxFact,
	SessionRequestsLifecycleInboxReaper,
	SessionRequestsLifecycleInboxWriter,
	SessionRequestsReviewReader,
	SessionRequestsRoutineReader,
	SessionRequestsRoutineRunPatch,
	SessionRequestsSelectionCandidate,
	SessionRequestsTeamReader,
	SessionRequestsTriggerHistoryWriter,
	SessionRequestsTriggerInput,
	SessionRequestsTriggerResolver,
	SessionRequestsUserReader,
	SessionRequestsWorkReader,
	TerminalizeSessionRequestDeps,
} from "./ports.js";
export { sessionRunRegistry } from "./session-run-registry.js";
