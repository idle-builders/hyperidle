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
 */
export type RoutineRunOutcome = "success" | "error" | "skipped";

export const ROUTINE_RUN_OUTCOMES: readonly RoutineRunOutcome[] = [
	"success",
	"error",
	"skipped",
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
}

/**
 * Full detail shape for GET /api/routines/:id (AC-5).
 */
export interface RoutineDetail {
	routine: RoutineInfo;
	runs: RoutineRunSummary[];
}
