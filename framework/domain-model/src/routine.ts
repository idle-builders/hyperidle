/**
 * AA1 — Routine visibility & team scoping shared types.
 *
 * Wire types for routine endpoints returned by the server layer. Used by
 * the web layer for WorkTeam routines section (AC-1/AC-2/AC-3) and
 * WorkRoutine detail page (AC-5).
 */

/**
 * Routine lifecycle state. Supersedes the boolean `active` column for
 * three-value lifecycle tracking required by AC-3.
 *
 * - active: routine is enabled and scheduled to fire.
 * - paused: routine is temporarily suspended; will not fire until re-enabled.
 * - error: last run failed; routine is suspended until acknowledged.
 */
export type RoutineState = "active" | "paused" | "error";

export const ROUTINE_STATES: readonly RoutineState[] = ["active", "paused", "error"] as const;

/**
 * Outcome of a single routine run.
 *
 * - success: run completed without errors.
 * - error: run failed with an error.
 * - skipped: run was scheduled but skipped (WIP limit, etc).
 * - running: AA2: run is currently in progress (session active).
 * - timeout: AA2: run exceeded its time limit.
 *
 * @lore AU21 Increment 14a: `budget_exhausted`/`monthly_budget_exhausted` (AA3,
 * the per-run/per-month cost-cap outcomes) are deleted along with the cost-cap
 * gate that produced them — no replacement.
 */
export type RoutineRunOutcome = "success" | "error" | "skipped" | "running" | "timeout";

export const ROUTINE_RUN_OUTCOMES: readonly RoutineRunOutcome[] = [
	"success",
	"error",
	"skipped",
	"running",
	"timeout",
] as const;

/**
 * Card summary shape for a routine, returned inside GET /api/teams/:id.
 * Drives the routine row in the WorkTeam routines section (AC-1/AC-2).
 */
export interface RoutineCardSummary {
	id: string;
	name: string;
	state: RoutineState;
	/** Human-readable schedule label (e.g. "Every Monday at 10:00 AM"). */
	scheduleLabel: string;
	/** Name of the owning agent, resolved server-side from users.name. */
	agentName: string;
	/** Initials derived from agentName for avatar display. */
	agentInitials: string;
	lastRunAt: string | null;
	lastRunOutcome: RoutineRunOutcome | null;
	nextRunAt: string | null;
}

/**
 * Single run record returned inside RoutineDetail.runs (AC-5).
 */
export interface RoutineRunSummary {
	id: string;
	startedAt: string;
	endedAt: string | null;
	/** Duration in seconds, derived from startedAt - endedAt. Null when not yet ended. */
	durationSeconds: number | null;
	outcome: RoutineRunOutcome;
	errorMessage: string | null;
	/** AA2: agent-produced summary of this run. */
	summary?: string | null;
}

/**
 * Full routine info object inside RoutineDetail. Includes all fields
 * shown in the WorkRoutine detail page (AC-5).
 */
export interface RoutineInfo {
	id: string;
	name: string;
	/** BA1 D1: the instruction given to the owner agent when this routine fires. Renamed from `description`. */
	prompt: string | null;
	state: RoutineState;
	triggerType: string;
	triggerConfig: string | null;
	/** BA1 D2/D8: the event this routine listens to, for `triggerType:"event"`. Null otherwise. */
	eventType: string | null;
	scheduleLabel: string;
	ownerAgentId: string;
	agentName: string;
	agentInitials: string;
	/** BA1 D5: scope comes from the owner agent — null when the agent belongs to no team. */
	teamId: string | null;
	teamName: string | null;
	autonomyLevel: number | null;
	humanReview: boolean;
	lastRunAt: string | null;
	lastRunOutcome: RoutineRunOutcome | null;
	nextRunAt: string | null;
	createdAt: string | null;
	/** AA2: last successful run's summary. Null when no successful runs. */
	lastRunSummary: string | null;
	/** AV4: Whether the routine runs silently (no post per run). Defaults to false. */
	silent: boolean;
}

/**
 * Full detail shape for GET /api/routines/:id (AC-5).
 */
export interface RoutineDetail {
	routine: RoutineInfo;
	runs: RoutineRunSummary[];
}

/**
 * AA2: Cron presets for the schedule picker.
 */
export const SCHEDULE_PRESETS = [
	{ label: "Every hour", cron: "0 * * * *" },
	{ label: "Every day at 9am", cron: "0 9 * * *" },
	{ label: "Every weekday at 9am", cron: "0 9 * * 1-5" },
	{ label: "Every Monday at 9am", cron: "0 9 * * 1" },
	{ label: "Every month (1st at 9am)", cron: "0 9 1 * *" },
] as const;
