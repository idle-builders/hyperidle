/**
 * @lore AU44-b8: Agent health types and derivation functions moved from
 * framework/domain-model to core-ui. The browser is the only consumer — it
 * fetches run rows from agent-orchestration directly (AU26 J4) and derives
 * health itself. Audit rows 6-8: MERGE → core-ui.
 *
 * AgentActiveSession / AgentSessionSummary / AgentPerformanceStats /
 * AgentHealthSignals moved from framework/domain-model/src/agent-profile.ts.
 *
 * HealthSignalInput / computeHealthSignals / deriveHealthLevel / deriveHealthDetail
 * moved from framework/domain-model/src/agent-run-view.ts.
 *
 * AgentHealthLevel stays in framework/domain-model/src/team.ts (it is part of
 * the TeamMember public API). We import it from there.
 */

import type { AgentHealthLevel } from "@hyperidle/domain-model";

// ---------------------------------------------------------------------------
// Types (moved from framework/domain-model/src/agent-profile.ts)
// ---------------------------------------------------------------------------

/**
 * Active session info, derived by the profile page from the runs it fetches
 * from `agent-orchestration` (AU26 J4). No longer served by core-api.
 */
export interface AgentActiveSession {
	readonly sessionId: string;
	readonly taskId: string;
	/**
	 * The betId of the task associated with this session.
	 * Required to construct a valid /work/bet/:betId/task/:taskId link.
	 * @lore AB1 M1: betId added per reviewer finding — the bet route expects betId, not taskId.
	 */
	readonly betId: string;
	readonly startedAt: string;
}

/**
 * One entry in the agent's recent run history, as the profile page assembles it
 * (AU26 J4: run rows from `agent-orchestration`, task titles from core-api).
 */
export interface AgentSessionSummary {
	readonly sessionId: string;
	readonly taskId: string;
	readonly taskTitle: string;
	readonly outcome: string | null;
	readonly startedAt: string;
	readonly endedAt: string | null;
}

/**
 * Aggregate performance statistics across all runs for this agent, derived by
 * the profile page (AU26 J4).
 */
export interface AgentPerformanceStats {
	readonly totalSessions: number;
	readonly successCount: number;
	/** 0–1 ratio. 0 when no sessions exist. */
	readonly successRate: number;
}

/**
 * Health signals computed on-demand from the agent's session history
 * and pool availability.
 *
 * @lore AB1: Computed per-request, not cached. Health is a live view.
 * @lore AB1 F3/A3: idleDurationMs added per reviewer finding.
 */
export interface AgentHealthSignals {
	/** Fraction of sessions in the last 7 days that crashed. 0 when no sessions. */
	readonly failureRate7d: number;
	/** True when the most recent completed session outcome is "crashed". */
	readonly lastSessionCrashed: boolean;
	/**
	 * True when the agent has no harnessType preference (any adapter works)
	 * OR when an adapter matching the agent's harnessType is registered in the pool.
	 * False (degraded) when the required harness type is not available.
	 */
	readonly harnessAvailable: boolean;
	/**
	 * Milliseconds since the most recent session ended.
	 * null when no sessions exist or the most recent session is still active.
	 */
	readonly idleDurationMs: number | null;
	/**
	 * True when any of the following hold:
	 *   - failureRate7d > 0.5
	 *   - lastSessionCrashed = true
	 *   - harnessAvailable = false
	 */
	readonly degraded: boolean;
}

// ---------------------------------------------------------------------------
// Derivation functions (moved from framework/domain-model/src/agent-run-view.ts)
// ---------------------------------------------------------------------------

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
