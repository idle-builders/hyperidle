/**
 * AU26 J4 — the wire shape of an agent run as `agent-orchestration` serves it,
 * plus the pure derivations a UI runs over a set of them.
 *
 * Founder ruling (2026-08-04, verbatim): *"its all for UI? thats why
 * orchestration now has an api so that the ui can get the agent run state from
 * the orchestration directly and combine this information in the ui instead of
 * in the core api service."*
 *
 * So: core-api serves core's own data (identity, tasks, teams, bets),
 * `agent-orchestration` serves run state on its own API, and the screen puts the
 * two together. These types are the contract between them, and they live here
 * because BOTH the serving Layer and the browser need them and neither may
 * import the other.
 *
 * `computeHealthSignals` / `deriveHealthLevel` / `deriveHealthDetail` moved here
 * from `core-api/src/routes/agent-profile.ts` unchanged. They were always pure
 * functions over run rows; they only lived in a route because the route was
 * where the run rows were read. Now the browser reads the rows, so the browser
 * runs the functions — the agent profile and the team roster still show exactly
 * what they showed before, computed from exactly the same inputs.
 */

/** One agent run, as `GET /api/agent-orchestration/runs` returns it. */
export interface AgentRunSummary {
	readonly id: string;
	readonly agentId: string;
	readonly taskId: string | null;
	readonly startedAt: string;
	readonly endedAt: string | null;
	readonly state: string | null;
	readonly outcome: string | null;
	/** Decimal string as stored, or null. The task view parses it. */
	readonly effectivenessScore: string | null;
}

/** `GET /api/agent-orchestration/runs?task_id=…` / `?agent_ids=…`. Newest first. */
export interface AgentRunsResponse {
	readonly runs: ReadonlyArray<AgentRunSummary>;
}

/**
 * `GET /api/agent-orchestration/runs/active-counts[?agent_ids=…]`.
 * Agents with zero active runs are absent from the map.
 */
export interface AgentRunActiveCountsResponse {
	readonly counts: Readonly<Record<string, number>>;
}

/**
 * `GET /api/agent-orchestration/runs/latest-outcomes?task_ids=…`.
 * A task with no run is absent from the map.
 */
export interface AgentRunLatestOutcomesResponse {
	readonly outcomes: Readonly<Record<string, string | null>>;
}

// ---------------------------------------------------------------------------
// Health derivations (moved verbatim from core-api's agent-profile route)
// ---------------------------------------------------------------------------

import type { AgentHealthSignals } from "./agent-profile.js";
import type { AgentHealthLevel } from "./team.js";

/** Input shape for `computeHealthSignals` — the three run fields it reads. */
export interface HealthSignalInput {
	readonly sessions: ReadonlyArray<{
		readonly startedAt: string;
		readonly endedAt: string | null;
		readonly outcome: string | null;
	}>;
	readonly harnessAvailable: boolean;
}

/**
 * Compute health signals from raw run data.
 *
 * @lore AB1 A5: Per reviewer finding, health signal logic must have dedicated
 * unit tests.
 *
 * @lore AB1 F3/A3: idleDurationMs added per reviewer finding. Computed from
 * MAX(endedAt) of the most recent completed run.
 *
 * @lore AU26 J4: moved out of `core-api/src/routes/agent-profile.ts` so the
 * screens that render these signals can compute them from run rows they fetch
 * from `agent-orchestration` directly. The body is unchanged; only the
 * unused-in-body `harnessType` input field was dropped (it was never read).
 */
export function computeHealthSignals(input: HealthSignalInput): AgentHealthSignals {
	const { sessions: sessionRows, harnessAvailable } = input;

	// --- Failure rate and last session crash (last 7 days) ---
	// @lore AB1: Both failure rate AND lastSessionCrashed are scoped to the
	// 7-day window. Sessions older than 7 days do not contribute to any degraded
	// signal.
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).getTime();
	const recent7d = sessionRows.filter((s) => new Date(s.startedAt).getTime() >= sevenDaysAgo);

	let failureRate7d = 0;
	if (recent7d.length > 0) {
		const crashedCount = recent7d.filter((s) => s.outcome === "crashed").length;
		failureRate7d = crashedCount / recent7d.length;
	}

	// --- Last session crash (within 7 days only) ---
	// @lore AB1: "lastSessionCrashed" means the most recent OUTCOME was a crash.
	// When the most recent crashed session and most recent completed session have
	// the same startedAt (tie), we treat it as NOT crashed — a tie means neither
	// is "the" most recent and the agent is not clearly degraded.
	const recentCrashes = recent7d
		.filter((s) => s.outcome === "crashed")
		.map((s) => new Date(s.startedAt).getTime());
	const recentSuccesses = recent7d
		.filter((s) => s.outcome === "completed")
		.map((s) => new Date(s.startedAt).getTime());

	const latestCrashTime = recentCrashes.length > 0 ? Math.max(...recentCrashes) : null;
	const latestSuccessTime = recentSuccesses.length > 0 ? Math.max(...recentSuccesses) : null;

	const lastSessionCrashed: boolean =
		latestCrashTime !== null && (latestSuccessTime === null || latestCrashTime > latestSuccessTime);

	// --- Idle duration ---
	// @lore AB1 F3/A3: computed from ALL runs, not just the 7d window, so the
	// page shows how long since ANY run, not just a recent one.
	const allSortedByStart = [...sessionRows].sort(
		(a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
	);
	const endedSessions = allSortedByStart.filter((s) => s.endedAt !== null);
	let idleDurationMs: number | null = null;
	const mostRecentEnded = endedSessions[0];
	if (mostRecentEnded?.endedAt != null) {
		idleDurationMs = Date.now() - new Date(mostRecentEnded.endedAt).getTime();
	}

	const degraded = failureRate7d > 0.5 || lastSessionCrashed || !harnessAvailable;

	return { failureRate7d, lastSessionCrashed, harnessAvailable, idleDurationMs, degraded };
}

/**
 * Derive a 3-level health indicator from pre-computed health signals.
 *
 * - critical: failureRate7d > 0.5 (sustained crash pattern)
 * - warning: lastSessionCrashed = true OR harness unavailable
 * - healthy: no degradation
 *
 * @lore AB2: Reuses the same `AgentHealthSignals` `computeHealthSignals`
 * produces, so the team page shows exactly the same health state as the agent
 * profile page.
 *
 * @lore AB2 fix: accepts a partial signal shape so callers can pass
 * `{ failureRate7d, lastSessionCrashed }`. Derived directly from signals — it
 * does NOT rely on the pre-computed `degraded` field, which may be absent.
 */
export function deriveHealthLevel(
	signals: Pick<AgentHealthSignals, "failureRate7d" | "lastSessionCrashed"> & {
		readonly harnessAvailable?: boolean;
	},
): AgentHealthLevel {
	if (signals.failureRate7d > 0.5) return "critical";
	if (signals.lastSessionCrashed) return "warning";
	if (signals.harnessAvailable === false) return "warning";
	return "healthy";
}

/**
 * Build a human-readable detail string from health signals.
 * Returns "Healthy" when not degraded. Lists active problems otherwise.
 *
 * @lore AB2: Plain text so it can be used as a `title=` attribute on health dots.
 */
export function deriveHealthDetail(
	signals: Pick<AgentHealthSignals, "failureRate7d" | "lastSessionCrashed"> & {
		readonly harnessAvailable?: boolean;
	},
): string {
	const parts: string[] = [];
	if (signals.failureRate7d > 0.5) {
		parts.push(`High failure rate (${Math.round(signals.failureRate7d * 100)}%)`);
	}
	if (signals.lastSessionCrashed) {
		parts.push("Last session crashed");
	}
	if (signals.harnessAvailable === false) {
		parts.push("Harness unavailable");
	}
	return parts.length > 0 ? parts.join(". ") : "Healthy";
}
