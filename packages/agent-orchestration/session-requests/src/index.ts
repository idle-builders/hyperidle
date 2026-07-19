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
 * interim edge (`agent-selection`, not yet migrated) became injected DI
 * ports (Mechanism C, see `ports.ts`). The two `lifecycle-projection`
 * (`agent_lifecycle_inbox`) forward-reference ports resolved to that
 * Service's real exports at Increment 3d — see `ports.ts`'s top `@lore`.
 */

export {
	type ClaimRequestOptions,
	claimAgentSessionRequestById,
	claimNextAgentSessionRequest,
	createAgentSessionRequest,
	findAgentSessionRequestById,
	findAgentSessionRequestByIdempotencyKey,
	findAgentSessionRequestBySessionId,
	findAgentSessionRequestTerminationReasonInTx,
	isAgentSessionRequestClaimActive,
	listAgentSessionRequestsBySource,
	listRunningAgentSessionRequests,
	markRequestRunning,
	releaseRequestClaim,
	renewAgentSessionRequestLease,
	requestAgentSessionTermination,
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
	type CreateExplicitSessionStartInput,
	createExplicitSessionStart,
	findExplicitSessionStartById,
	findExplicitSessionStartByRequesterAndIdempotencyKey,
	markExplicitSessionStartAdmitted,
	markExplicitSessionStartFailed,
	projectExplicitSessionStartTerminalState,
} from "./explicit-session-starts.js";
/**
 * @lore AU20 Ag3a (TYPE-BUNDLE): The ~21 individual SessionRequests*Reader/
 * Writer structural-mirror types and the 4 per-function mini-bundle types
 * were collapsed into one DurableAgentQueueDeps contract. Internal files in
 * this package still import from "./ports.js" directly — only the barrel's
 * public surface changed. See ports.ts for the full rationale.
 */
export type { DurableAgentQueueDeps } from "./ports.js";
export { sessionRunRegistry } from "./session-run-registry.js";
