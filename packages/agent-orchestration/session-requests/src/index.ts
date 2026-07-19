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
 *
 * @lore AU20 Ag3a (TYPE-BUNDLE): The ~21 individual SessionRequests*Reader/
 * Writer structural-mirror types and the 4 per-function mini-bundle types
 * were collapsed into one DurableAgentQueueDeps contract. See ports.ts.
 *
 * @lore AU20 Ag3b (METHOD-COLLAPSE): 8-9 individual find-/is- methods collapsed
 * into `findSessionRequest(exec, query)` (discriminated by `query.by`). 7
 * transition verbs collapsed into `transitionSessionRequest(db, spec, deps?)` +
 * `transitionSessionRequestInTx(exec, spec, deps?)` (discriminated by `spec.to`
 * or `spec.target`). All old names removed from the barrel; callers use the new
 * parameterised API. Internal implementations remain in their source files.
 * `TerminalizeAgentSessionRequestInput` replaced by `SessionRequestInTxTransition`
 * (the terminal arms) plus `SessionRequestTransition` (the full union).
 */

// ---------------------------------------------------------------------------
// Lifecycle drain (AU20 B1a: folded from lifecycle-projection)
// ---------------------------------------------------------------------------
export {
	type AgentLifecycleInboxFact,
	deleteLifecycleInboxByRequestIds,
	insertLifecycleInboxFactIfAbsent,
	listProjectedLifecycleInboxBefore,
} from "./agent-lifecycle-inbox.js";
export {
	AGENT_LIFECYCLE_PROJECTORS,
	AGENT_LIFECYCLE_SOURCE_KINDS,
	AGENT_LIFECYCLE_TERMINAL_STATES,
	type AgentLifecycleFact,
	drainAgentLifecycleInbox,
	startAgentLifecycleProjectionDrain,
} from "./agent-lifecycle-projectors.js";
// ---------------------------------------------------------------------------
// session-requests — claim/create/list (unchanged surface)
// ---------------------------------------------------------------------------
export {
	type ClaimRequestOptions,
	claimAgentSessionRequestById,
	claimNextAgentSessionRequest,
	createAgentSessionRequest,
	listAgentSessionRequestsBySource,
	listRunningAgentSessionRequests,
	releaseRequestClaim,
	renewAgentSessionRequestLease,
} from "./agent-session-requests.js";
// ---------------------------------------------------------------------------
// agent-work-intent-worker (unchanged surface)
// ---------------------------------------------------------------------------
export {
	AGENT_WORK_INTENT_FAILURE_CODES,
	type AgentWorkIntentWorkerOptions,
	claimAgentWorkIntent,
	renewAgentWorkIntentLease,
	resolveAuthoritativeInput,
} from "./agent-work-intent-worker.js";
// ---------------------------------------------------------------------------
// agent-work-intents (find*/source removed; kept: record/drain/reap/constants)
// ---------------------------------------------------------------------------
export {
	AGENT_WORK_INTENT_KINDS,
	AGENT_WORK_RETENTION_BATCH_SIZE,
	AGENT_WORK_RETENTION_DAYS,
	type AgentWorkIntentDb,
	type AgentWorkIntentInput,
	type AgentWorkIntentKind,
	drainAgentWorkIntents,
	reapTerminalAgentWorkIntents,
	recordAgentWorkIntent,
} from "./agent-work-intents.js";
// ---------------------------------------------------------------------------
// explicit-session-starts (find*/mark*/project* removed; kept: create)
// ---------------------------------------------------------------------------
export {
	type CreateExplicitSessionStartInput,
	createExplicitSessionStart,
} from "./explicit-session-starts.js";
// ---------------------------------------------------------------------------
// Unified parameterised find (AU20 Ag3b)
// ---------------------------------------------------------------------------
export { findSessionRequest } from "./find-session-request.js";
// ---------------------------------------------------------------------------
// DI deps bundle (AU20 Ag3a)
// ---------------------------------------------------------------------------
export type {
	AgentLifecycleProjectionDeps,
	DurableAgentQueueDeps,
	LifecycleProjectionExplicitSessionStartWriter,
	LifecycleProjectionRoutineWriter,
	LifecycleProjectionWorkWriter,
} from "./ports.js";
// ---------------------------------------------------------------------------
// session-run-registry (unchanged)
// ---------------------------------------------------------------------------
export { sessionRunRegistry } from "./session-run-registry.js";
// ---------------------------------------------------------------------------
// Unified state-machine writer (AU20 Ag3b)
// ---------------------------------------------------------------------------
export {
	type SessionRequestExplicitStartTransition,
	type SessionRequestInTxTransition,
	type SessionRequestRunningTransition,
	type SessionRequestTerminalTransition,
	type SessionRequestTerminationRequestedTransition,
	type SessionRequestTransition,
	transitionSessionRequest,
	transitionSessionRequestInTx,
} from "./transition-session-request.js";
