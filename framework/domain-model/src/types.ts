/**
 * The full set of legal task lifecycle states. The `TaskState` union is
 * derived from this constant so the runtime list (used by Zod enums at
 * route boundaries) and the type checker cannot drift.
 *
 * @lore I2 V1: previously the route schema accepted `z.string()`, which let
 * invalid states fall through to the state-machine and surface as 409. Routes
 * must use `z.enum(TASK_STATES)` so bad input is a 400 from validation.
 */
export const TASK_STATES = [
	"proposed",
	"accepted",
	"hold",
	"in_progress",
	"blocked",
	"review",
	"done",
	"killed",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

/**
 * AI4: Human-readable labels for each TaskState. Exhaustive `Record` so adding
 * a 9th TaskState is a TS error until labelled here.
 *
 * @lore AC1: "met_with_rework"→"Rework" and "partially_met"→"Partial" preserve
 * WorkBet's pre-existing abbreviations. Labels render verbatim into DOM;
 * CSS `uppercase` in StatusChip provides visual uppercasing (Decision 1a).
 */
export const TASK_STATE_LABEL: Record<TaskState, string> = {
	proposed: "Planned",
	// @lore BB1: `accepted` used to read "Planned" too, so the State dropdown
	// listed "Planned" twice and the two states were indistinguishable — picking
	// the wrong one silently set a different state. They are genuinely different:
	// `proposed` is drafted and not yet picked up, `accepted` is committed to an
	// owner and counts against the team's concurrent-task limit.
	accepted: "Accepted",
	hold: "On hold",
	in_progress: "In progress",
	blocked: "Blocked",
	review: "In review",
	done: "Done",
	killed: "Killed",
};

export interface HealthResponse {
	status: "ok";
	timestamp: string;
}

/**
 * @lore nested-knowledge-items: collapsed onto the single four-value ladder —
 * `proposed | active | stale | archived` — that `KNOWLEDGE_STATUSES`
 * (`./knowledge.ts`) now also is. There were two status vocabularies (kernel
 * vs. app-runtime) saying the same thing under different names (`draft` vs
 * `captured`, both "not yet vouched for"); one lifecycle now, no gatekeeping.
 *
 * @lore O1: moved as part of kernel/strategy separation, historically.
 */
export const KERNEL_KNOWLEDGE_STATUSES = ["proposed", "active", "stale", "archived"] as const;
export type KernelKnowledgeStatus = (typeof KERNEL_KNOWLEDGE_STATUSES)[number];

/**
 * @lore BB1: `BET_STATUSES`, `BetStatus`, and `BET_STATUS_LABEL` are DELETED.
 * A bet was a root task; the task state vocabulary (TASK_STATES) is the only
 * work vocabulary. Old mapping: draft→proposed, active→in_progress,
 * completed→done, killed→killed.
 */

export type ModelTier = "reasoning" | "workhorse" | "fast";

/**
 * X3: Runtime-safe tuple of all valid ModelTier values.
 * Used for Zod enum schemas at API boundaries so validation does not require
 * an unsafe `as` cast. ModelTier already exists as a type; MODEL_TIERS is the
 * corresponding const tuple for runtime use.
 */
export const MODEL_TIERS = ["reasoning", "workhorse", "fast"] as const;

export type TriggerType = "heartbeat" | "calendar" | "event" | "continuous";

/**
 * AB0: Agent categories. Closed enum.
 * - team: bound to a team, domain specialist
 * - individual: bound to a human user (or a factory-wide agent not tied to one team)
 *
 * @lore AB0: Replaces the KERNEL_USER_ROLES / FABRIC_USER_ROLES split which was
 * about system layer, not agent category. The category system is orthogonal to
 * the role system.
 * @lore AD8a: Renamed "personal" → "individual". Migration 0027_AD8a_agent_type_rename.sql
 * updates existing DB rows.
 * @lore BA9d: "strategy" removed. Migration 0065 migrates all strategy rows to "individual".
 * The five seeded facilitators are dropped from factory-state.ts; factory-wide roles
 * (facilitator, scout, infra, platform) now use "individual".
 */
export const AGENT_CATEGORIES = ["team", "individual"] as const;
export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

/**
 * The harness types an adapter can register under, and therefore the only
 * values `agent_run_config.harness_type` can usefully hold: pinning an agent
 * to anything else means the pool can never select for it and every run of
 * that agent fails.
 *
 * Selection compares this string for exact equality (`adapter-pool.ts`'s
 * `select`), so a near-miss is as fatal as nonsense. The demo world seeded
 * `"claude"` against an adapter registered as `"claude-code"`, which made its
 * builder agent permanently unrunnable — a typo no type caught, because every
 * declaration on the path was a bare `string`. Both the registration side and
 * every writer now spell the vocabulary from here.
 */
// @lore `"builtin"` led this list. HyperIdle ran agents in-process against a
// model gateway it held the key for; it does not any more — you bring a harness,
// and the harness brings its login. A vocabulary that still named it would make
// an unrunnable value look sanctioned, which is the exact drift the
// harness-type-vocabulary tests exist to catch.
export const HARNESS_TYPES = ["claude-code", "codex", "opencode", "cursor-agent"] as const;
export type HarnessType = (typeof HARNESS_TYPES)[number];

/**
 * AB0: Agent role is an open string. The role catalog in agent-roles.ts provides
 * known roles with metadata, but any non-empty string is a valid role.
 *
 * @lore AB0: This replaces the closed USER_ROLES tuple. The old 6-value enum
 * could not accommodate new domain-specific roles (designer, QA, ops, etc.)
 * without code changes. Open string + catalog avoids the enum expansion problem.
 */
/**
 * P2: OrgChart edge mechanisms.
 * "direct" = edge targets a specific userId,
 * "function" = edge targets a role string,
 * "team" = edge targets a teamId.
 */
export const ORG_EDGE_MECHANISMS = ["direct", "function", "team"] as const;
export type OrgEdgeMechanism = (typeof ORG_EDGE_MECHANISMS)[number];

/**
 * Kernel-level scope kinds for knowledge items. Closed enum — adding a new
 * scope kind requires a concept-doc update per the Q2 contract.
 *
 * @lore Q2: scope_kind lives on the kernel knowledgeItems table so every
 * item knows where it belongs, regardless of which strategy fabric is active.
 * The fabric maps scope_kind → layer via scopeToLayer() in packages/server/src/knowledge/types.ts.
 *
 * @lore AU26 F2 (founder ruling, 2026-08-04): `"filesystem"` is REMOVED. AV3
 * had added it so a knowledge item could hang off a repo/doc-set, and that one
 * usage was the only reason the `filesystems` record had to stay core-owned
 * while its mounting engine lived in agent-orchestration. A filesystem is an
 * agent's execution environment, not a place knowledge lives — the founder
 * ruled the scope out and the record whole into agent-orchestration. There is
 * no production data, so nothing is migrated.
 */
/**
 * @lore BB1: `"bet"` is GONE. A bet is a task with no parent now, so knowledge
 * produced under a bet is knowledge produced under a task. Migration 0068
 * re-scoped every `"bet"` row to `"task"`; the scope_id did not change, because
 * each bet became a root task keeping its own id.
 *
 * @lore nested-knowledge-items: `"product"`, `"practice"` and `"task"` are
 * GONE too. `product`/`practice` were the layer vocabulary wearing a scope
 * costume — "Product" and "Practices" are now knowledge items near the root,
 * not scope values; where an item sits in the tree says what it is about,
 * `scope` says only who sees it. `task` left because a task's knowledge
 * parents onto the task directly (`parentKind='task'`) and never appears in
 * the scope column at all — task/bet-scoped knowledge never had a "how far
 * does it reach" question `scope` answers. Scope is now closed to exactly
 * three concentric rings: factory (everyone) > team (a team) > user (one
 * person).
 */
export const SCOPE_KINDS = ["factory", "team", "user"] as const;

export type ScopeKind = (typeof SCOPE_KINDS)[number];

/**
 * Scope kinds that require an external scopeId.
 * "factory" and "user" are self-referential/global — they never need an id.
 *
 * @lore Q2: Extracted to @hyperidle/domain-model so the web dialogs (KnowledgeCreateDialog,
 * ScopeChangeDialog) and the server route (knowledge.ts) share a single source of truth.
 * @lore nested-knowledge-items: `"product"`/`"practice"`/`"task"` removed with
 * the scope kinds themselves.
 */
export const SCOPES_REQUIRING_ID: ReadonlySet<ScopeKind> = new Set<ScopeKind>(["team"]);

/**
 * Maps a raw scopeKind from the API to the user-facing bucket label.
 * factory → "Shared", team → "Team", user → "Private".
 * Anything else → "Shared" (safe fallback).
 *
 * @lore AV3: SSOT for scope label mapping — lives beside ScopeKind so the
 * server (core-api) and the web (core-ui) import the same function rather than
 * inlining copies that can drift. Moved from @hyperidle/presentation-format
 * (dissolved) and core-ui/scope-labels.ts in AU44 review.
 */
export function scopeKindToLabel(scopeKind: string): string {
	if (scopeKind === "user") return "Private";
	if (scopeKind === "team") return "Team";
	return "Shared";
}

/**
 * AC1: Closed enum of task outcome verdicts.
 * Adding a fifth value is a concept change, not a type change.
 *
 * @lore AC1: Records whether the task's done condition was met during review.
 * NOT set automatically by the state machine — must be explicitly recorded by
 * a human or evaluator agent.
 */
export const TASK_OUTCOME_VERDICTS = [
	"met",
	"met_with_rework",
	"partially_met",
	"not_met",
] as const;
export type TaskOutcomeVerdict = (typeof TASK_OUTCOME_VERDICTS)[number];

/**
 * AI4: Human-readable labels for each TaskOutcomeVerdict (AC2, AC5).
 *
 * @lore AC1: "met_with_rework"→"Rework" and "partially_met"→"Partial" preserve
 * WorkBet's pre-existing abbreviated rendering (not a truncation error).
 */
export const TASK_OUTCOME_VERDICT_LABEL: Record<TaskOutcomeVerdict, string> = {
	met: "Met",
	met_with_rework: "Rework",
	partially_met: "Partial",
	not_met: "Not met",
};

/**
 * AI4: Human-readable labels for each AgentOperationalStatus (Decision 3a, AC2).
 * AgentOperationalStatus type lives in `team.ts` (pre-existing).
 */
export const AGENT_OPERATIONAL_STATUS_LABEL: Record<"active" | "error" | "idle", string> = {
	active: "Active",
	error: "Error",
	idle: "Idle",
};

/**
 * "not_returned" is a non-completed outcome for a turn that exhausted its
 * stream without a return action (after force budget spent, or on a Tier-2
 * harness). Every switch(outcome) consumer MUST handle this member — see the
 * exhaustiveness guard in session-lifecycle.ts.
 *
 * @lore BC1: relocated from the deleted domain-model events fork (`events.ts`)
 * — this was the fork's only surviving export. core-ui reads it via the
 * `@hyperidle/domain-model` barrel (it cannot reach `@hyperidle/event-bus`),
 * and `framework/event-bus/src/events.ts` imports it back from here, so it
 * lives in this general types module rather than moving to event-bus.
 */
export type SessionOutcome = "completed" | "crashed" | "stopped" | "not_returned";
