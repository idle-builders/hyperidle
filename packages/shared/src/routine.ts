/**
 * AA1 — Routine visibility & team scoping shared types.
 *
 * Wire types for routine endpoints returned by the server layer. Used by
 * the web layer for WorkTeam routines section (AC-1/AC-2/AC-3) and
 * WorkRoutine detail page (AC-5).
 */

import type { WireMoney } from "./types/money.js";

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
 * - skipped: run was scheduled but skipped (cost cap, WIP limit, etc).
 * - running: AA2: run is currently in progress (session active).
 * - timeout: AA2: run exceeded its time limit.
 * - budget_exhausted: AA3: run terminated because per-run cost cap was hit.
 * - monthly_budget_exhausted: AA3: run skipped because monthly cost cap was reached.
 */
export type RoutineRunOutcome =
	| "success"
	| "error"
	| "skipped"
	| "running"
	| "timeout"
	| "budget_exhausted"
	| "monthly_budget_exhausted";

export const ROUTINE_RUN_OUTCOMES: readonly RoutineRunOutcome[] = [
	"success",
	"error",
	"skipped",
	"running",
	"timeout",
	"budget_exhausted",
	"monthly_budget_exhausted",
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
	/** Cumulative cost of all routine runs. Null when no runs exist. */
	costActual: WireMoney | null;
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
	cost: WireMoney | null;
	errorMessage: string | null;
	/** AA2: agent-produced summary of this run. */
	summary?: string | null;
}

/**
 * AA3: Budget stats for a routine. Returned as part of RoutineDetail.
 */
export interface RoutineBudget {
	/** Mean of completed routineRuns.costMinor (where costMinor > 0). Null when no runs with cost. */
	avgCostPerRun: WireMoney | null;
	/** SUM routineRuns.costMinor for the current calendar month. Null when no runs this month with cost. */
	costThisMonth: WireMoney | null;
	/** From routines.costCapPerRunMinor. Null = no cap. */
	costCapPerRun: WireMoney | null;
	/** From routines.costCapMonthlyMinor. Null = no cap. */
	costCapMonthly: WireMoney | null;
	/** Last completed run cost / per-run cap * 100. Null when no per-run cap or no last run cost. */
	perRunUtilizationPercent: number | null;
	/** This month cost / monthly cap * 100. Null when no monthly cap or no spend this month. */
	monthlyUtilizationPercent: number | null;
}

/**
 * Full routine info object inside RoutineDetail. Includes all fields
 * shown in the WorkRoutine detail page (AC-5).
 */
export interface RoutineInfo {
	id: string;
	name: string;
	description: string | null;
	state: RoutineState;
	triggerType: string;
	triggerConfig: string | null;
	scheduleLabel: string;
	ownerAgentId: string;
	agentName: string;
	agentInitials: string;
	teamId: string;
	teamName: string;
	autonomyLevel: number | null;
	humanReview: boolean;
	delegationAllowed: boolean;
	lastRunAt: string | null;
	lastRunOutcome: RoutineRunOutcome | null;
	nextRunAt: string | null;
	costActual: WireMoney | null;
	createdAt: string | null;
	/** AA2: per-run cost cap. Null = no cap. */
	costCapPerRun: WireMoney | null;
	/** AA3: monthly cost cap. Null = no cap. */
	costCapMonthly: WireMoney | null;
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
	/** AA3: Budget stats computed server-side. */
	budget: RoutineBudget;
}

/**
 * AA2: Wire type for POST /api/routines request body.
 */
export interface RoutineCreatePayload {
	name: string;
	description?: string;
	teamId: string;
	ownerAgentId: string;
	triggerType: "calendar";
	/** JSON: { cron: "<expression>" } */
	triggerConfig: string;
	costCapPerRunMinor?: number | null;
	/** AA3: Optional per-month cost cap in minor units. Null removes the cap. */
	costCapMonthlyMinor?: number | null;
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
