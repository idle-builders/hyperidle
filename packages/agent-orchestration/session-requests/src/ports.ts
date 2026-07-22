/**
 * `session-requests` Service (agent-orchestration) — outbound composition-
 * boundary (Mechanism C) DI ports, per architecture §10.2's census (as
 * refined during this migration — the census is "a floor, refinable during
 * migration", §14).
 *
 * @lore AU19 Increment 3b: `agent-work-intent-worker.ts`'s `drainAgentWorkIntents`/
 * `resolveAuthoritativeInput` real outbound edges — `routine`, `work`,
 * `conversation`, `users`, `org` (census correction below), `trigger-resolution`,
 * `review` (census correction below), and `knowledge` (census correction
 * below) — are ORDINARY same-layer/downward
 * edges (not §10.3 against-grain; `session-requests` is agent-orchestration,
 * same or below every one of these targets). Each becomes an injected DI
 * port wired by `packages/server` (the composition root — routes/services
 * haven't physically moved into `@hyperidle/core-api`/`@hyperidle/agent-orchestration`
 * Layer packages yet, Increment 5).
 *
 * **RESOLVED at Increment 3e:** `agent-selection` is now a real package
 * (`@hyperidle/agent-selection`). `packages/server`'s
 * `session-requests-bindings.ts` wires `SessionRequestsAgentSelector` to
 * the shared composition-root `AgentSelectionService` singleton instead of
 * the deleted flat module.
 *
 * Two more ports forward-reference `lifecycle-projection`: the
 * `agent_lifecycle_inbox` table is architecture §4's roster-assigned
 * `lifecycle-projection` table, but `session-requests` is the durable
 * single-terminal-writer into it (`terminalizeAgentSessionRequestInTx`) and
 * its own retention reaper deletes projected rows from it
 * (`reapTerminalAgentWorkIntents`) — moving those two functions here without
 * a port would make `session-requests` a nested-package raw accessor of a
 * table it does not own (Table ACL / Mechanism A failure).
 *
 * **RESOLVED at Increment 3d:** `lifecycle-projection` is now a real
 * package. `packages/server`'s `session-requests-bindings.ts` wires these
 * two ports to `@hyperidle/lifecycle-projection`'s real exports
 * (`insertLifecycleInboxFactIfAbsent`/`listProjectedLifecycleInboxBefore`/
 * `deleteLifecycleInboxByRequestIds`) instead of raw table ops — a genuinely
 * NEW `session-requests → lifecycle-projection` edge (§10.2, appended by
 * that migration), same shape as the `policy`/`work` against-grain-port
 * precedent even though this specific edge is NOT against-grain (both
 * Services are agent-orchestration) — it was simply forward-referencing,
 * now closed. The port interfaces below are unchanged (only the concrete
 * wiring moved) — no signature here needed to change.
 *
 * Census corrections surfaced migrating for real (§14 sanctions updating the
 * census as a "floor, refinable during migration"):
 *  1. `session-requests → org` (`teamMembers`, ×1) was MISSING from the
 *     original census — `resolveAuthoritativeInput`'s `bet_decomposition`
 *     branch read `teamMembers` directly via a raw `.select(...).where(eq(
 *     teamMembers.teamId, ...))` for the membership-group read. Converted to
 *     `SessionRequestsTeamReader`, wired to `org`'s real
 *     `getTeamMembersByTeamId` — same 1:1-invariant equivalence as
 *     `trigger-resolution`'s own census correction (`ports.ts` top `@lore`).
 *  2. `session-requests → review` (`proposedCalls ⋈ tailoredGrants`, ×1) was
 *     MISSING — `resolveAuthoritativeInput`'s `reengagement` branch read both
 *     tables directly via a raw join (both `review`-owned, `TABLE_OWNER`).
 *     `review` gained a new exported reader, `findGrantedProposedCall`,
 *     purpose-built for this exact query — converted to
 *     `SessionRequestsReviewReader`, wired to that real export.
 *  3. `session-requests → trigger-resolution` (`triggerResolutionHistory`,
 *     ×1, `markRequestRunning`'s post-admission session-id backfill) was
 *     flagged (not counted) at Increment 3a as a NEW edge the original
 *     census missed (a raw table write into a table `trigger-resolution` now
 *     owns, not a function call) — see `agent-session-requests.ts`'s
 *     (pre-move) `@lore` at that call site. `trigger-resolution` gained a
 *     new exported writer, `recordSessionForResolutionHistory`, purpose-built
 *     for this exact update — converted to
 *     `SessionRequestsTriggerHistoryWriter`, wired to that real export.
 *  4. `session-requests → knowledge` (`knowledgeItems`, ×1) was MISSING —
 *     `resolveAuthoritativeInput`'s `knowledge_action` branch read
 *     `knowledgeItems` directly (`knowledge`-owned, `TABLE_OWNER`). Converted
 *     to `SessionRequestsKnowledgeReader`, wired to `knowledge`'s real
 *     `findById` export (`knowledge-repository.ts`).
 *  5. `session-requests → agent-selection`/`session-requests → trigger-resolution`
 *     (the `resolveAuthoritativeInput`/`createTriggeredAgentSessionRequest`
 *     edges) were already counted in the original 6-edge/6-call census
 *     (`routine`, `work`, `agent-selection`, `conversation`, `trigger-resolution`,
 *     `users` — architecture §10.1's per-source table).
 *
 * Types are declared locally (structural mirrors of the target Service's own
 * types, or typed directly off `@hyperidle/db` row types per §7.3 W4) rather
 * than imported from the target package — a Service NEVER imports another
 * Service, even for a type-only reference.
 */

import type {
	AgentSessionRequest,
	Bet,
	KnowledgeItem,
	Message,
	NewRoutineRun,
	ProposedCall,
	Routine,
	RoutineRun,
	TailoredGrant,
	Task,
	TeamMember,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	TriggerEventType,
	TriggerResolutionResult,
} from "@hyperidle/shared";

// ---------------------------------------------------------------------------
// routine — SessionRequestsRoutineReader (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Narrowed patch shape `resolveAuthoritativeInput`'s `routine_run` failure branch actually writes. */
export interface SessionRequestsRoutineRunPatch {
	readonly outcome: NewRoutineRun["outcome"];
	readonly endedAt: string;
	readonly errorMessage: string | null;
}

/** Port for `routine`'s read/write surface this Service calls directly today. */
export interface SessionRequestsRoutineReader {
	getRoutineRunById(db: WriteExecutor, id: string): Promise<RoutineRun | undefined>;
	getRoutineById(db: WriteExecutor, id: string): Promise<Routine | undefined>;
	updateRoutineRunIfRunning(
		db: WriteExecutor,
		id: string,
		patch: SessionRequestsRoutineRunPatch,
	): Promise<void>;
}

// ---------------------------------------------------------------------------
// work — SessionRequestsWorkReader (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `work`'s read surface this Service calls directly today. */
export interface SessionRequestsWorkReader {
	getTaskById(db: WriteExecutor, id: string): Promise<Task | undefined>;
	getBetById(db: WriteExecutor, id: string): Promise<Bet | undefined>;
}

// ---------------------------------------------------------------------------
// agent-selection — SessionRequestsAgentSelector (ordinary downward edge,
// RESOLVED at Increment 3e — see this file's top `@lore`)
// ---------------------------------------------------------------------------

interface SessionRequestsRoutineSelectionRequest {
	readonly db: WriteExecutor;
	readonly surface: "routine_delegate";
	readonly teamId: string | null;
	readonly workKey: string;
	readonly excludeAgentId: string;
	readonly skillId: string;
}

/** Agent-selection capabilities needed while draining routine work. */
export interface SessionRequestsAgentSelector {
	isAtCapacity(db: WriteExecutor, agentId: string): Promise<boolean>;
	selectAgent(
		req: SessionRequestsRoutineSelectionRequest,
	): Promise<{ readonly agentId: string | null }>;
}

// ---------------------------------------------------------------------------
// conversation — SessionRequestsConversationReader (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `conversation`'s read surface this Service calls directly today. */
export interface SessionRequestsConversationReader {
	getMessageById(db: WriteExecutor, id: string): Promise<Message | undefined>;
}

// ---------------------------------------------------------------------------
// users — SessionRequestsUserReader (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `users`' read surface this Service calls directly today. */
export interface SessionRequestsUserReader {
	getUserById(db: WriteExecutor, id: string): Promise<User | undefined>;
	listUsersByTeam(db: WriteExecutor, teamMembersId: string): Promise<User[]>;
}

// ---------------------------------------------------------------------------
// org — SessionRequestsTeamReader (census correction #1, ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `org`'s `teamMembers`-by-`teamId` read (census correction #1, see this file's top `@lore`). */
export interface SessionRequestsTeamReader {
	getTeamMembersByTeamId(db: WriteExecutor, teamId: string): Promise<TeamMember | undefined>;
}

// ---------------------------------------------------------------------------
// knowledge — SessionRequestsKnowledgeReader (census correction #4, ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `knowledge`'s full-row read (census correction #4, see this file's top `@lore`). */
export interface SessionRequestsKnowledgeReader {
	findById(db: WriteExecutor, id: string): Promise<KnowledgeItem | null>;
}

// ---------------------------------------------------------------------------
// review — SessionRequestsReviewReader (census correction #2, ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** A granted proposed call plus its tailored grant — `review`-owned rows (census correction #2). */
export interface SessionRequestsGrantedProposedCall {
	readonly call: ProposedCall;
	readonly grant: TailoredGrant;
}

/** Port for `review`'s granted-proposed-call read (census correction #2, see this file's top `@lore`). */
export interface SessionRequestsReviewReader {
	findGrantedProposedCall(
		db: WriteExecutor,
		proposedCallId: string,
	): Promise<SessionRequestsGrantedProposedCall | undefined>;
}

// ---------------------------------------------------------------------------
// trigger-resolution — SessionRequestsTriggerResolver +
// SessionRequestsTriggerHistoryWriter (ordinary same-layer edges, real targets)
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/trigger-resolution`'s `TriggeredSessionRequestInput`. */
export interface SessionRequestsTriggerInput {
	readonly eventType: TriggerEventType;
	readonly sourceKind: AgentSessionSourceKind;
	readonly sourceId: string;
	readonly streamId: string;
	readonly defaultAgentId: string;
	readonly idempotencyKey: string;
	readonly sourceCorrelation: AgentSessionSourceCorrelation;
	readonly buildSourceCorrelation?: (
		resolution: TriggerResolutionResult,
	) => AgentSessionSourceCorrelation;
	readonly teamId?: string;
	readonly userId?: string;
	readonly taskId?: string | null;
	readonly payload?: Record<string, unknown>;
}

/**
 * Port for `trigger-resolution`'s `createTriggeredAgentSessionRequest` — the
 * composition root closes over `trigger-resolution`'s own `TriggerResolutionDeps`
 * (including that Service's OWN `sessionRequests` port, now wired to this
 * Service's real exports — see `session-requests-bindings.ts`), so this
 * Service's port stays a plain `(db, input) => result` shape with no
 * knowledge of `trigger-resolution`'s internal deps shape (Mechanism C).
 */
export interface SessionRequestsTriggerResolver {
	resolveAndCreate(
		db: WriteExecutor,
		input: SessionRequestsTriggerInput,
	): Promise<{
		readonly request: AgentSessionRequest;
		readonly resolution: TriggerResolutionResult;
	}>;
}

/** Port for `trigger-resolution`'s post-admission session-id backfill (census correction #3). */
export interface SessionRequestsTriggerHistoryWriter {
	recordSessionForResolutionHistory(
		db: WriteExecutor,
		requestId: string,
		sessionId: string,
	): Promise<void>;
}

// ---------------------------------------------------------------------------
// Aggregate deps bundles (per registration entry point)
// ---------------------------------------------------------------------------

/** Deps `resolveAuthoritativeInput`/`drainAgentWorkIntents` need — every real outbound edge the worker has. */
export interface AgentWorkIntentWorkerDeps {
	readonly routine: SessionRequestsRoutineReader;
	readonly work: SessionRequestsWorkReader;
	readonly agentSelection: SessionRequestsAgentSelector;
	readonly conversation: SessionRequestsConversationReader;
	readonly users: SessionRequestsUserReader;
	readonly teams: SessionRequestsTeamReader;
	readonly review: SessionRequestsReviewReader;
	readonly knowledge: SessionRequestsKnowledgeReader;
	readonly triggerResolver: SessionRequestsTriggerResolver;
}

/** Deps `markRequestRunning` needs. */
export interface MarkRequestRunningDeps {
	readonly triggerHistory: SessionRequestsTriggerHistoryWriter;
}

// ---------------------------------------------------------------------------
// DurableAgentQueueDeps — the single exported deps contract (AU20 Ag3a).
//
// @lore AU20 Ag3a (TYPE-BUNDLE): The ~21 individual SessionRequests*Reader/
// Writer structural-mirror types are internal plumbing. This single type is
// what the composition root declares; TypeScript structural typing ensures it
// satisfies every function-level mini-bundle automatically. The individual
// SessionRequests* types stay in this file as internal building blocks; they
// are NOT re-exported from index.ts.
//
// @lore AU20 B1a: `lifecycleInbox` removed — `agentLifecycleInbox` is now
// owned directly by session-requests (folded from lifecycle-projection).
// `terminalizeAgentSessionRequestInTx` and `reapTerminalAgentWorkIntents`
// call the inbox functions directly instead of through a DI port.
// ---------------------------------------------------------------------------

/**
 * Single deps contract for the durable-agent-queue service.
 *
 * Extends `AgentWorkIntentWorkerDeps` and adds `triggerHistory` for
 * `markRequestRunning`. TypeScript structural typing means a
 * `DurableAgentQueueDeps` value also satisfies `AgentWorkIntentWorkerDeps`
 * and `MarkRequestRunningDeps` — no runtime wrapping needed at any call site.
 */
export interface DurableAgentQueueDeps extends AgentWorkIntentWorkerDeps {
	readonly triggerHistory: SessionRequestsTriggerHistoryWriter;
}

// ---------------------------------------------------------------------------
// AgentLifecycleProjectionDeps — DI ports for the lifecycle drain (AU20 B1a:
// folded from lifecycle-projection/src/ports.ts into this file).
// ---------------------------------------------------------------------------

/** Port for `projectRoutine`'s `routine_runs` terminal-outcome projection. */
export interface LifecycleProjectionRoutineWriter {
	updateRoutineRunIfRunning(
		exec: WriteExecutor,
		id: string,
		patch: {
			readonly outcome: "success" | "error";
			readonly endedAt: string;
			readonly sessionId: string | null;
			readonly errorMessage: string | null;
		},
	): Promise<void>;
}

/** Port for `projectDecomposition`'s `bets.decomposition_status` terminal-outcome projection. */
export interface LifecycleProjectionWorkWriter {
	updateBetDecompositionStatusIfRunning(
		exec: WriteExecutor,
		id: string,
		patch: {
			readonly decompositionStatus: "done" | "blocked";
			readonly decompositionBlockerReason: string | null;
		},
	): Promise<void>;
}

/** Port for `projectExplicitStart`'s `explicit_session_starts` terminal-outcome projection. */
export interface LifecycleProjectionExplicitSessionStartWriter {
	projectTerminalState(
		exec: WriteExecutor,
		requestId: string,
		patch: {
			readonly status: "completed" | "failed" | "cancelled";
			readonly sessionId: string | null;
			readonly failureCode: string | null;
		},
	): Promise<void>;
}

/** Deps `drainAgentLifecycleInbox`/`AGENT_LIFECYCLE_PROJECTORS` need — every real outbound edge. */
export interface AgentLifecycleProjectionDeps {
	readonly routine: LifecycleProjectionRoutineWriter;
	readonly work: LifecycleProjectionWorkWriter;
	readonly explicitSessionStarts: LifecycleProjectionExplicitSessionStartWriter;
}
