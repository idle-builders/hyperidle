/**
 * L13 — Read-side types for the Team page composite endpoint.
 *
 * These are wire types returned by GET /api/products and GET /api/products/:id.
 * The TeamDetail shape drives the WorkTeam page composition.
 *
 * @lore L13: Product = Team 1:1 invariant. The public identifier is always the
 * team id (formerly product id); the agent-membership group is an internal join key.
 *
 * @lore U1: File renamed from product.ts to team.ts. All Product* types renamed
 * to Team*. BetCardSummary.pitchTitle renamed to BetCardSummary.descriptionTitle.
 * deriveTitleFromPitch renamed to deriveTitle in format/bet.ts.
 */

import type { RoutineCardSummary } from "./routine.js";
import type { TaskState } from "./types.js";

/**
 * Status of a product team — derived server-side from active bet states
 * and capacity utilisation. Matches the StatusChip "Status" type used in
 * the design system (healthy | behind | blocked).
 *
 * @lore L13: "Status" from @hyperidle/design-system cannot be imported in
 * framework/domain-model (it must not depend on design-system). We redeclare the
 * relevant subset here to keep the wire contract in the domain model without a circular
 * dep. Both must stay in sync if the StatusChip type ever widens.
 *
 * @lore AU21 Increment 14a: this status used to also flip to "behind" on
 * cost-cap overrun (`costActualMinor >= costCapMinor`) — the cost-cap
 * feature is HARD-DELETED (founder, no replacement); status now derives
 * from capacity overrun and blocked tasks only.
 */
export type TeamStatus = "healthy" | "behind" | "blocked";

export interface TeamSummary {
	id: string;
	name: string;
	phase: string; // "shape" | "build" | "cool-down" | …
	status: TeamStatus; // derived server-side
	leadAgentId: string | null; // team_members.lead_agent_id; null on a freshly-created team
}

/** AB2: Operational status derived from session state. */
export type AgentOperationalStatus = "active" | "idle" | "error";

/** AB2: Health indicator level for display. */
export type AgentHealthLevel = "healthy" | "warning" | "critical";

export interface RosterMember {
	agentId: string;
	name: string;
	role: string; // agents.role
	isLead: boolean; // matches leadAgentId on the team
	/** AB3: "team" | "individual" | null. Null when category is unset. @lore BA9d: "strategy" removed. */
	agentCategory: string | null;
	/**
	 * Whether an adapter matching this agent's harness type is registered in the
	 * server's pool (or the agent has no preference).
	 *
	 * @lore AU26 J4: `operationalStatus`, `activeTaskTitle`, `activeTaskId`,
	 * `activeBetId`, `healthLevel` and `healthDetail` were REMOVED — core-api
	 * derived every one of them from `agent-orchestration`'s `sessions` table
	 * purely to render this roster. `WorkTeam.tsx` fetches the runs from that
	 * Layer's own API and derives them itself. `harnessAvailable` stays on the
	 * wire because it is NOT run state — it is a fact about the server process's
	 * adapter pool, which the browser cannot see, and it is an input to the same
	 * `computeHealthSignals` the browser now calls.
	 */
	harnessAvailable?: boolean;
}

/**
 * @lore AU21 Increment 14a: `costActual`/`costCap`/`betCostActual`/
 * `routineCostThisMonth` (all WireMoney|null, L17) are HARD-DELETED along
 * with the rest of the cost-cap/accounting feature — no replacement. `burn`
 * now carries only capacity utilisation.
 *
 * @lore BB1: `activeBets` counter DELETED — the WIP limit is now counted
 * live from tasks in `in_progress` (`countTeamTasksInProgress`). `capacity`
 * remains: it is the max concurrent in_progress tasks per team.
 */
export interface TeamBurn {
	capacity: number; // team_members.capacity (max concurrent in_progress tasks)
}

/**
 * Summary of one in_progress task for the team page.
 *
 * @lore BB1: Replaces `BetCardSummary` — a bet is now a root task. The card
 * shows any task currently in_progress (at any depth), not just root tasks.
 */
export interface TaskCardSummary {
	id: string;
	title: string;
	state: TaskState; // always "in_progress" for the active list, kept typed for callers
	progressDone: number; // count(subtasks where state='done')
	progressTotal: number; // count(subtasks)
}

export interface TeamDetail {
	team: TeamSummary;
	teamMembers: { id: string; formedAt: string; dissolvedAt: string | null };
	roster: RosterMember[]; // sorted: lead first, then by name asc
	burn: TeamBurn;
	/** @lore BB1: replaces `activeBets: BetCardSummary[]` — tasks in_progress at any depth. */
	tasksInProgress: TaskCardSummary[];
	/** AA1: routines belonging to this team, sorted by name asc. Absent in pre-AA1 fixtures. */
	routines?: RoutineCardSummary[];
}

/**
 * Shape returned by GET /api/products (the list endpoint used by Portfolio).
 * Extends TeamSummary with portfolio-level counters.
 */
/**
 * @lore BB1: `activeBets`→`tasksInProgress`, `shipped`→`tasksDone`.
 * Comments updated to remove "bets" terminology. The underlying counts now
 * reflect root tasks (parent_task_id IS NULL) with the corresponding states.
 */
export interface TeamListItem extends TeamSummary {
	tasksInProgress: number; // count of in_progress root tasks
	tasksDone: number; // count of done root tasks
	shipRate: string; // percentage string, e.g. "67%" or "—" when no history
	progress: { done: number; total: number }; // sum across in_progress tasks
	/** AA1: total routines belonging to this team (all states). */
	routineCount: number;
	/** AB2: total AI agents in the team. */
	agentCount: number;
	/**
	 * @lore AU26 J1: `activeAgentCount` and `agentHealthWarning` are DELETED.
	 * Both were derived in core-api from a raw `sessions` read and had zero
	 * production readers. Agent-run state belongs to `agent-orchestration`; a
	 * surface that wants it reads that Layer's own API and combines client-side.
	 */
}

export interface TeamListResponse {
	teams: TeamListItem[];
}

/**
 * POLISH-060 B3: Optional primary harness config for team creation.
 * When provided, all scaffolded agents use this harness/model.
 */
export interface PrimaryHarnessConfig {
	readonly harnessType: string;
	/**
	 * The model to run, when one was chosen. Absent leaves the harness on its own
	 * default — which is a real answer, not a missing one: a CLI that was never
	 * told a model runs whatever it is configured to run.
	 *
	 * @lore These used to be required, defaulted to a hardcoded Anthropic model
	 * whenever nothing was chosen. That default was invented, not observed: it
	 * named a model the selected harness might not serve, and it was written into
	 * every scaffolded agent's run config as though the user had picked it.
	 */
	readonly modelId?: string;
	readonly modelProvider?: string;
}

export interface CreateTeamRequest {
	name: string;
	repoPath?: string;
	/** AE2: optional free-text context about what is being built. */
	buildingContext?: string;
	/** AE2: human user id — seeds welcome message in thr-ast-{userId} when provided. */
	userId?: string;
	/**
	 * POLISH-060 B3: When set, all scaffolded agents carry this harness/model.
	 * Supplied by the onboarding flow after the user selects a primary harness.
	 * Omitting it stores none, and the adapter pool selects at admission.
	 *
	 * @lore This used to say "instead of the builtin/sonnet-4-6 default". There is
	 * no such default: the built-in harness is gone, and the model half of that
	 * pair was a hardcoded id nobody chose.
	 */
	primaryHarness?: PrimaryHarnessConfig;
}

export interface CreateTeamResponse {
	team: { id: string; name: string; phase: string };
	teamMembers: { id: string };
}
