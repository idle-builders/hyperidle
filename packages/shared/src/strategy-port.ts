/**
 * The Strategy Port — the Kernel's dispatch-time contract with any Strategy.
 *
 * Lives in @hyperidle/shared because both the Kernel (packages/server) and every
 * Strategy implementation (packages/fabric, packages/strategy-minimal, third-party)
 * already depend on shared. shared must stay db-agnostic — no @hyperidle/db dep
 * allowed here.
 *
 * @lore AK2: TDb is a generic type parameter (NOT an import of HyperIdleDb) so
 * @hyperidle/shared stays db-agnostic. Importing HyperIdleDb into shared would
 * invert the verified db→shared dependency direction (packages/db/package.json
 * depends on shared; shared must NOT depend on db). The Kernel binds TDb=HyperIdleDb
 * at every getActiveStrategy() call site. Strategy implementations annotate
 * themselves as Strategy<HyperIdleDb> and import HyperIdleDb from @hyperidle/db
 * (they already depend on db).
 */

import type { DecompositionTaskInput } from "./bet-decomposition.js";
import type { UserRole } from "./types.js";

/**
 * What the Kernel hands a Strategy to assemble context into a session's sandbox.
 *
 * The Kernel calls assembleContext at P6 (admission phase) with this request.
 * The Strategy is responsible for populating the sandbox's context/knowledge/work
 * directories and writing a .fabric/manifest.json (or an inert scaffold for
 * the minimal Strategy). The Kernel does not read the assembled content — the
 * agent reads it from disk inside the sandbox.
 */
export interface ContextAssemblyRequest<TDb> {
	readonly db: TDb;
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly taskId: string;
	readonly agentId: string;
	readonly agentRole: UserRole;
	/**
	 * @lore U1: a teams.id (field name kept for back-compat with productId in
	 * the Fabric adapter mapping: productId → teamId).
	 */
	readonly teamId: string;
	/**
	 * True for routine sessions: Strategy MUST NOT read task/bet context.
	 * Informational for the Fabric (which already handles this via stub taskId);
	 * load-bearing for a future Strategy that branches on session type.
	 */
	readonly isRoutine: boolean;
}

/**
 * Observable result of context assembly.
 *
 * @lore AK2: NARROWS the Fabric's ContextAssemblyResult { itemCount, manifest,
 * durationMs } — intentionally DROPS `manifest`. Both production call sites
 * (session-provisioning.ts ~L424, session-lifecycle.ts ~L176) call
 * `await assembleContext(...)` and DISCARD the return value entirely. The Kernel
 * never reads the manifest off the result (it reads .fabric/manifest.json off
 * disk when it needs it). This is a narrowing, NOT a mirror. If a future WP
 * (e.g. AK2b prompt-relocation) needs the manifest on the return value, widen
 * this type then — do not assume parity with ContextAssemblyResult.
 */
export interface ContextAssemblyOutcome {
	readonly itemCount: number;
	readonly durationMs: number;
}

/**
 * What the Kernel hands a Strategy to ingest a finished session's sandbox writes.
 *
 * The Kernel calls beginLearningIngestion at P7 (admission phase, after context
 * assembly) to start a live ingestion subscription. The Strategy watches the
 * sandbox for knowledge writes and persists them to the knowledge base.
 */
export interface IngestionRequest<TDb> {
	readonly db: TDb;
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly manifestPath: string;
}

/**
 * A live ingestion subscription. The Kernel owns its lifecycle and MUST dispose
 * it on EVERY teardown path (complete / crash / budget_exhausted). Mirrors
 * today's FileWatcher interface.
 *
 * Contract:
 * - dispose() MUST flush any pending captures.
 * - dispose() MUST NOT throw (best-effort; swallow ENOENT — the sandbox may
 *   already be gone on crash paths).
 */
export interface IngestionHandle {
	dispose(): void;
}

/**
 * AK6: A creation trigger handed to the active Strategy.
 *
 * Carries trigger CONTEXT from the Kernel, never an agent definition.
 * The Strategy reads this and returns AgentScaffoldSpec[].
 *
 * NOTE: `factory_bootstrap` is NOT a trigger here — factory bootstrap runs
 * at the leaf/desktop layer with no registry, so it uses the registry-free
 * `FactoryRosterSpec` injection seam (@hyperidle/shared factory-roster.ts),
 * NOT `scaffoldAgents`. The port covers the 3 server-side surfaces only.
 *
 * @lore AK6: ScaffoldRequest.trigger is a CLOSED set of 3 server-side surfaces.
 * Adding a creation surface requires adding to this union + KernelEvent (@lore O1).
 */
export interface ScaffoldRequest<TDb> {
	readonly db: TDb;
	/**
	 * Which creation surface fired.
	 * - team_scaffold: POST /api/teams (route + create-team tool)
	 * - agent_added:   add_agent tool (explicit role + optional name)
	 * - user_assistant: POST /api/users (lazy-create in assistant.ts)
	 */
	readonly trigger: "team_scaffold" | "agent_added" | "user_assistant";
	/** teams.id when trigger is team_scaffold | agent_added; else null. */
	readonly teamId: string | null;
	/** teamMembers.id (membership group) when team-scoped; else null. */
	readonly teamMembersId: string | null;
	/** Team display name (for persona naming) when team-scoped. */
	readonly teamName: string | null;
	/** Chosen team functions (drives roster composition) for team_scaffold. */
	readonly functions: readonly string[] | null;
	/** Explicit role for agent_added (the only surface that fixes the role up front). */
	readonly role: UserRole | null;
	/**
	 * Caller-supplied agent name for agent_added (the `add_agent` tool persists
	 * `input.name` — add-agent.ts:79). The Strategy passes it through; it may
	 * synthesize a name ONLY when null.
	 */
	readonly name: string | null;
	/** Owning human user id for user_assistant (drives the ast- id-hint). */
	readonly ownerUserId: string | null;
	/**
	 * Owning human's display name for user_assistant — lets the Strategy reproduce
	 * `${name}'s Assistant` byte-for-byte (users.ts:157 / assistant.ts:307,401).
	 */
	readonly ownerUserName: string | null;
}

/**
 * AK6: One agent the Strategy decides should exist.
 *
 * Carries the WHO (knowledge fields only), NEVER the HOW (mechanism fields).
 * The Kernel's persistScaffoldedAgents helper attaches kind, status, teamId,
 * harnessType, modelId, modelProvider, maxConcurrentSessions, createdAt.
 *
 * @lore AK6: Concept closure contract (hard-rule #5): NO harness/model/cost field
 * on this spec. A Strategy that sets harnessType or modelId is doing Kernel work.
 */
export interface AgentScaffoldSpec {
	readonly role: UserRole;
	readonly name: string;
	readonly agentCategory: "team" | "strategy" | "individual";
	/** The persona / AGENTS.md content. null = plain agent (Minimal Strategy). */
	readonly systemPrompt: string | null;
	/**
	 * Optional deterministic id the Kernel SHOULD use if free.
	 * Honored when (id is free) AND (prefix ∉ deny-set {system:}).
	 * Collision OR deny-prefix → fresh UUID.
	 * Legitimate strategy prefixes: ast-${userId}, seed-agent-*.
	 */
	readonly idHint?: string;
}

/**
 * AK7: A candidate handed to the Strategy for a bet_* surface.
 *
 * Carries role ONLY — the bet_* selectors (exact-role-match → index spread)
 * need nothing else. NO systemPrompt (Kernel never reads AGENTS.md; §2a).
 * NO skills/WIP (only routine_delegate consumes those via its own Fabric query).
 *
 * @lore AK7: bet_* selection is deliberately WIP-blind (concept §3a) to match AK3.
 */
export interface SelectionCandidate {
	readonly agentId: string;
	readonly role: UserRole;
}

/**
 * AK7: A selection request — the Kernel asks the active Strategy which agent
 * should own a unit of work. Carries the OCCASION (concept §1), never an answer.
 * The Strategy returns a chosen agent's users.id; the Kernel resolves + attaches.
 *
 * @lore AK7: ScaffoldRequest.trigger is a CLOSED set (mirrors @lore O1 / AK6).
 * Adding a selection surface requires adding to the `surface` union here.
 */
export interface SelectAgentRequest<TDb> {
	readonly db: TDb;
	/**
	 * Which selection surface fired. Closed set.
	 * - bet_task:          per-task owner during decomposition (replaces round-robin)
	 * - bet_decomposer:    the PM-style agent that decomposes a bet
	 * - routine_delegate:  a routine owner is at WIP; pick a delegate
	 */
	readonly surface: "bet_task" | "bet_decomposer" | "routine_delegate";
	/**
	 * teams.id whose roster the Kernel enumerated candidates from.
	 * Present for bet_* surfaces; null for routine_delegate (no teamId in scope).
	 */
	readonly teamId: string | null;
	/** The bet/routine the work is keyed to (for audit correlation). */
	readonly workKey: string;
	/**
	 * bet_* ONLY. Eligible team candidates enumerated by the Kernel (active, AI,
	 * category='team' agents in the team, ORDERED BY users.id). The Strategy PICKS
	 * from these. EMPTY for routine_delegate — that surface ignores `candidates`.
	 */
	readonly candidates: readonly SelectionCandidate[];
	/**
	 * Role hint for the work (a task's ownerRole, or 'product_manager' for a
	 * decomposer). The Strategy MAY honor it (exact-match) or override.
	 * null for routine_delegate.
	 */
	readonly roleHint: UserRole | null;
	/**
	 * bet_task ONLY. The decomposition loop index (`i`). Preserves AK3's exact
	 * `eligible[i % len]` round-robin spread across stateless per-task calls.
	 * null for bet_decomposer / routine_delegate.
	 *
	 * @lore AK7: Without spreadIndex, multi-task bets collapse all null-role tasks
	 * onto candidates[0] — the silent regression the golden test catches (§7).
	 */
	readonly spreadIndex: number | null;
	/**
	 * routine_delegate ONLY: the current owner to exclude.
	 * null for bet_* surfaces.
	 */
	readonly excludeAgentId: string | null;
	/**
	 * routine_delegate ONLY: the skill to match (runs findDelegate's exact
	 * userSkills-scoped query). null for bet_* surfaces.
	 */
	readonly skillId: string | null;
}

/**
 * AK7: The Strategy's answer. A chosen agent's users.id, or null = "no agent".
 * null → the calling flow takes its no-agent path (decomposition → blocked).
 * The Kernel load-and-validates the id (concept §3) before attaching.
 */
export interface SelectAgentOutcome {
	/** users.id of the chosen agent, or null if the Strategy declines to assign. */
	readonly agentId: string | null;
}

/**
 * AK8: The occasion handed to the Strategy when a bet enters decomposition.
 * Carries the bet + the Kernel-enumerated eligible candidates (mechanism), never an answer.
 * teamId/betId for correlation.
 *
 * @lore AK8: decomposeBet is a PLANNING call (occasion → decision), exactly like
 * selectAgent. The Kernel runs the PM turn as mechanism on behalf of the Strategy's
 * chosen agent — Execution is Kernel (§2a row 3).
 */
export interface DecomposeBetRequest<TDb> {
	readonly db: TDb;
	readonly teamId: string;
	readonly betId: string;
	readonly betDescription: string;
	readonly betDoneCondition: string | null;
	/** Eligible team candidates (active AI, category='team', orderBy users.id) —
	 *  same enumeration as selectAgent's `candidates`. The Strategy picks the decomposer. */
	readonly candidates: readonly SelectionCandidate[];
}

/**
 * AK8: The Strategy's decomposition decision.
 * - decomposerAgentId: which agent decomposes. null = no eligible decomposer → Kernel blocks.
 *   NOT pre-validated — the Kernel re-validates it against the enumerated candidates (membership +
 *   active-AI) before any session, since a third-party Strategy could return an off-team/inactive id.
 * - tasks: the breakdown IF the Strategy authored one. EMPTY ([]) = "Kernel, run your default turn
 *   with decomposerAgentId" (the AK3/Minimal fallback). NB: []-from-Strategy means "run turn";
 *   []-from-turn means blocked/empty (T5 @lore documents the asymmetry at both sites).
 *
 * @lore AK8: The empty-list asymmetry: plan.tasks===[] means "Strategy authored no breakdown →
 * fall through to override/turn", whereas an empty taskList produced by the turn means
 * blocked/empty. Same [] value, opposite meaning depending on origin.
 */
export interface DecompositionPlan {
	readonly decomposerAgentId: string | null;
	readonly tasks: readonly DecompositionTaskInput[];
}

/**
 * AR4b: The occasion handed to the active Strategy when the assistant turn is about
 * to run. The Strategy returns the assistant's formation (persona + draft tool surface)
 * for THIS turn — not a persistent mutation of the agent row.
 *
 * The Kernel calls formAssistant at turn time so switching the active strategy changes
 * the assistant's form without requiring a DB row update (AC3).
 *
 * @lore AR4b: This is a TURN-TIME consultation, not a creation-time one. The result
 * is applied per-turn (overrides systemPromptText in the assembled prompt assembly) and
 * is NOT persisted to the users row. The row is the Settings-configured harness/model/
 * baseline persona; the formation answer may override it for the turn.
 *
 * @lore AR4b: Strategy/Kernel boundary: the formation answer MUST NOT set harnessType
 * or modelId — those are Kernel/Settings. The formation carries only persona + tool
 * surface (the WHO), never the HOW. See concept §4 (FOUNDER-LOCKED boundary).
 */
export interface AssistantFormationRequest<TDb> {
	readonly db: TDb;
	/** The human user's id — drives the assistant id (ast-${userId}). */
	readonly userId: string;
	/** The thread the assistant is replying in. */
	readonly threadId: string;
}

/**
 * AR4b: The active Strategy's answer to a formation consultation.
 *
 * - `persona`: the system prompt for this turn. null = "use the agent row's systemPrompt
 *   as-is" (Minimal Strategy default). A non-null value overrides the row's systemPrompt
 *   for this turn's assembled prompt.
 * - `assistantDraftSurface`: which draft tool surface to build. "standard" = the
 *   canonical 2-tool surface (create_bet + edit_bet, via buildAssistantDraftRegistry).
 *   A future Fabric Strategy may return a different marker.
 *
 * @lore AR4b: `assistantDraftSurface` is a server-interpretable marker rather than
 * a ToolRegistry instance so @hyperidle/shared stays db-agnostic (ToolRegistry is a
 * server type that would invert the dependency direction). The Kernel (server-side)
 * resolves the marker to the actual ToolRegistry at turn time.
 */
export interface AssistantFormation {
	/**
	 * Turn-time persona override. null = no override; use the agent row's systemPrompt.
	 * The Minimal Strategy returns null (no knowledge, no persona override).
	 */
	readonly persona: string | null;
	/**
	 * Which draft tool surface to hand the assistant for this turn.
	 * "standard" = canonical 2-tool surface (create_bet + edit_bet).
	 *
	 * @lore AR4b: A marker rather than a ToolRegistry keeps @hyperidle/shared
	 * db-agnostic. The server-side assistant-turn.ts maps this to the actual
	 * ToolRegistry (buildAssistantDraftRegistry for "standard").
	 */
	readonly assistantDraftSurface: "standard";
}

/**
 * The Strategy Port. Exactly one Strategy is active per process.
 *
 * The Kernel calls this surface and NEVER imports a concrete Strategy
 * (that is the AC4 static contract, enforced by the ESLint no-restricted-imports
 * guard in packages/server/src/** except the composition root server-factory.ts).
 *
 * A reader can state the full contract from this one interface: on session admit,
 * the Kernel asks the active Strategy to (1) assemble context into the sandbox
 * and (2) begin watching the sandbox for learning ingestion. On teardown the
 * Kernel disposes the returned IngestionHandle.
 *
 * AK6 adds scaffoldAgents: on every agent-bearing creation surface, the Kernel
 * asks the active Strategy which agents to create (by returning AgentScaffoldSpec[]).
 * The Kernel persists the specs via persistScaffoldedAgents.
 *
 * AK7 adds selectAgent: on every selection surface, the Kernel asks the active
 * Strategy which agent should own a unit of work. The Strategy returns the chosen
 * agent's users.id (or null = no agent); the Kernel resolves + attaches.
 *
 * AR4b adds formAssistant: at turn time the Kernel asks the active Strategy for the
 * assistant's persona + draft tool surface. The Strategy returns the formation answer;
 * the Kernel applies it to the assembled prompt and tool registry.
 *
 * Error semantics:
 * - assembleContext may throw; the Kernel's Phase-6 try/catch reverts the task
 *   to `accepted` and rethrows (existing behaviour preserved).
 * - beginLearningIngestion MUST NOT throw synchronously; the returned handle's
 *   dispose() MUST NOT throw (best-effort flush).
 * - scaffoldAgents may throw for invalid input (e.g. agent_added with role null);
 *   the route's error handler surfaces a 400.
 * - selectAgent returns null to signal "no agent" — never throws for missing candidates.
 * - formAssistant MUST NOT throw (turn-time consultation; failure → missing formation).
 */
export interface Strategy<TDb> {
	assembleContext(req: ContextAssemblyRequest<TDb>): Promise<ContextAssemblyOutcome>;
	beginLearningIngestion(req: IngestionRequest<TDb>): IngestionHandle;
	/**
	 * AK6: The Strategy decides which agents a creation trigger produces.
	 *
	 * Returns specs (knowledge fields only); the Kernel persists + owns ids.
	 * This is a synchronous-within-creation-request call (concept hard-rule #7):
	 * the route awaits it before returning the created entity.
	 */
	scaffoldAgents(req: ScaffoldRequest<TDb>): Promise<readonly AgentScaffoldSpec[]>;
	/**
	 * AK7: The Strategy decides which agent owns a unit of work.
	 *
	 * Returns the chosen agent's users.id (or null = no agent). Synchronous-within-
	 * flow (like scaffoldAgents): the calling flow awaits it before provisioning.
	 * The Kernel resolves the returned id to a users row and attaches the session;
	 * the Strategy NEVER spawns/attaches a session and NEVER enforces cost.
	 *
	 * Generalizes the Fabric's findDelegate skill-match (routine-scheduler.ts:245):
	 * every selection surface now consults this one method.
	 */
	selectAgent(req: SelectAgentRequest<TDb>): Promise<SelectAgentOutcome>;
	/**
	 * AK8: The Strategy decides WHO decomposes and WHAT the breakdown is.
	 *
	 * Returns a DecompositionPlan: decomposerAgentId (null = no agent → Kernel blocks)
	 * + tasks (the breakdown IF the Strategy authored one; [] = Kernel runs its default
	 * PM turn). This is a planning call only — the Strategy NEVER spawns a session and
	 * NEVER enforces cost (strategy-port.ts hard rule).
	 *
	 * Turn-source precedence (Kernel-side):
	 *   1. plan.tasks.length > 0  → persist those tasks; skip override and real turn.
	 *   2. deps.runDecompositionTurn present → call it (protected-test seam).
	 *   3. else → real PM turn (AK3/Minimal default fallback).
	 *
	 * @lore AK8: []-from-Strategy means "run turn" (Minimal/Fabric v1 both return tasks:[]).
	 * []-from-turn means blocked/empty. Same value, opposite meaning — see DecompositionPlan.
	 */
	decomposeBet(req: DecomposeBetRequest<TDb>): Promise<DecompositionPlan>;

	/**
	 * AR4b: The Strategy decides the assistant's persona + draft tool surface at turn time.
	 *
	 * Called by the Kernel once per assistant turn, BEFORE provisionSession. The Strategy
	 * returns an AssistantFormation: persona (null = no override; use agent row's systemPrompt)
	 * + assistantDraftSurface marker ("standard" = canonical 2-tool surface).
	 *
	 * The Kernel applies the persona as systemPromptOverride in the conversational assembly
	 * and builds the ToolRegistry from the surface marker. Switching the active strategy
	 * changes the assistant's form for the NEXT turn (AC3).
	 *
	 * MUST NOT throw — a formation failure leaves the turn without a persona/surface.
	 * The Minimal Strategy returns { persona: null, assistantDraftSurface: "standard" }
	 * so existing behavior is preserved.
	 *
	 * @lore AR4b: This is the "thin addition" alongside scaffoldAgents (creation-time).
	 * scaffoldAgents fires at creation; formAssistant fires at EVERY turn. The Minimal
	 * Strategy's null-persona means "no formation knowledge, use agent row defaults" —
	 * the same pattern as scaffoldAgents returning systemPrompt:null for team agents.
	 */
	formAssistant(req: AssistantFormationRequest<TDb>): Promise<AssistantFormation>;
}
