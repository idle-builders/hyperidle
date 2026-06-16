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
 * Error semantics:
 * - assembleContext may throw; the Kernel's Phase-6 try/catch reverts the task
 *   to `accepted` and rethrows (existing behaviour preserved).
 * - beginLearningIngestion MUST NOT throw synchronously; the returned handle's
 *   dispose() MUST NOT throw (best-effort flush).
 * - scaffoldAgents may throw for invalid input (e.g. agent_added with role null);
 *   the route's error handler surfaces a 400.
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
}
