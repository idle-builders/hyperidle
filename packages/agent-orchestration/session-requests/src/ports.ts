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
 * Layer packages yet, Increment 5). `agent-selection` has NOT migrated yet
 * (later in this same Increment 3) — its port is wired INTERIM to
 * `packages/server`'s still-flat `services/agent-selection.ts`, same shape as
 * `trigger-resolution`'s own interim `sessionRequests` port before this
 * increment (`@hyperidle/trigger-resolution`'s `ports.ts` top `@lore`).
 *
 * Two more ports are genuinely forward-referencing a Service that has not
 * migrated yet (`lifecycle-projection`, later in Increment 3): the
 * `agent_lifecycle_inbox` table is architecture §4's roster-assigned
 * `lifecycle-projection` table, but `session-requests` is the durable
 * single-terminal-writer into it (`terminalizeAgentSessionRequestInTx`) and
 * its own retention reaper deletes projected rows from it
 * (`reapTerminalAgentWorkIntents`) — moving those two functions here without
 * a port would make `session-requests` a nested-package raw accessor of a
 * table it does not own (Table ACL / Mechanism A failure). Wired INTERIM to
 * `packages/server`'s raw table ops (zero behavior change) until
 * `lifecycle-projection` is a real package, matching the `policy`/`work`
 * against-grain-port precedent's shape even though this specific edge is NOT
 * against-grain (both Services are agent-orchestration) — it is simply
 * forward-referencing.
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
	UserRole,
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
// INTERIM target — agent-selection migrates later in Increment 3)
// ---------------------------------------------------------------------------

/** Structural mirror of `agent-selection.ts`'s (pre-migration) `SelectionCandidate`. */
export interface SessionRequestsSelectionCandidate {
	readonly agentId: string;
	readonly role: UserRole;
}

/** Structural mirror of `agent-selection.ts`'s (pre-migration) `SelectAgentRequest`. */
export interface SessionRequestsAgentSelectionRequest {
	readonly db: WriteExecutor;
	readonly surface: "bet_task" | "bet_decomposer" | "routine_delegate";
	readonly teamId: string | null;
	readonly workKey: string;
	readonly candidates: readonly SessionRequestsSelectionCandidate[];
	readonly roleHint: UserRole | null;
	readonly spreadIndex: number | null;
	readonly excludeAgentId: string | null;
	readonly skillId: string | null;
}

/** Structural mirror of `agent-selection.ts`'s (pre-migration) `SelectAgentOutcome`. */
export interface SessionRequestsAgentSelectionOutcome {
	readonly agentId: string | null;
}

/** Port for `agent-selection`'s WIP-check + default-selection surface this Service calls directly today. */
export interface SessionRequestsAgentSelector {
	isAgentAtWipLimit(db: WriteExecutor, agentId: string): Promise<boolean>;
	selectAgentByAppDefaults(
		req: SessionRequestsAgentSelectionRequest,
	): Promise<SessionRequestsAgentSelectionOutcome>;
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
// agent_lifecycle_inbox — SessionRequestsLifecycleInbox (INTERIM — forward
// references the not-yet-migrated `lifecycle-projection` Service; see this
// file's top `@lore`)
// ---------------------------------------------------------------------------

/** The one durable terminal fact `terminalizeAgentSessionRequestInTx` appends. */
export interface SessionRequestsLifecycleInboxFact {
	readonly requestId: string;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly state: string;
	readonly sessionId: string | null;
	readonly failureCode: string | null;
	readonly occurredAt: string;
}

/** Port for `agent_lifecycle_inbox`'s single-terminal-writer append. */
export interface SessionRequestsLifecycleInboxWriter {
	insertIfAbsent(tx: WriteExecutor, fact: SessionRequestsLifecycleInboxFact): Promise<void>;
}

/** Port for the retention reaper's projected-row sweep of `agent_lifecycle_inbox`. */
export interface SessionRequestsLifecycleInboxReaper {
	listProjectedBefore(
		tx: WriteExecutor,
		cutoff: string,
		batchSize: number,
	): Promise<ReadonlyArray<{ readonly requestId: string }>>;
	deleteByRequestIds(tx: WriteExecutor, requestIds: readonly string[]): Promise<void>;
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

/** Deps `reapTerminalAgentWorkIntents` needs. */
export interface AgentWorkIntentReapDeps {
	readonly lifecycleInbox: SessionRequestsLifecycleInboxReaper;
}

/** Deps `terminalizeAgentSessionRequestInTx`/`terminalizeAgentSessionRequest` need. */
export interface TerminalizeSessionRequestDeps {
	readonly lifecycleInbox: SessionRequestsLifecycleInboxWriter;
}

/** Deps `markRequestRunning` needs. */
export interface MarkRequestRunningDeps {
	readonly triggerHistory: SessionRequestsTriggerHistoryWriter;
}
