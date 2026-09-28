import type { AgentHealthLevel } from "@hyperidle/domain-model";

export interface AgentActiveSession {
	readonly sessionId: string;
	readonly taskId: string;
	readonly startedAt: string;
}

export interface AgentSessionSummary {
	readonly sessionId: string;
	readonly taskId: string;
	readonly taskTitle: string;
	readonly outcome: string | null;
	readonly startedAt: string;
	readonly endedAt: string | null;
}

export interface AgentPerformanceStats {
	readonly totalSessions: number;
	readonly successCount: number;
	readonly successRate: number;
}

export interface AgentHealthSignals {
	readonly failureRate7d: number;
	readonly lastSessionCrashed: boolean;
	readonly harnessAvailable: boolean;
	readonly idleDurationMs: number | null;
	readonly degraded: boolean;
}

/** Input shape for `computeHealthSignals` — the three run fields it reads. */
export interface HealthSignalInput {
	readonly sessions: ReadonlyArray<{
		readonly startedAt: string;
		readonly endedAt: string | null;
		readonly outcome: string | null;
	}>;
	readonly harnessAvailable: boolean;
}

export function computeHealthSignals(input: HealthSignalInput): AgentHealthSignals {
	const { sessions: sessionRows, harnessAvailable } = input;

	// --- Failure rate and last session crash (last 7 days) ---
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).getTime();
	const recent7d = sessionRows.filter((s) => new Date(s.startedAt).getTime() >= sevenDaysAgo);

	let failureRate7d = 0;
	if (recent7d.length > 0) {
		const crashedCount = recent7d.filter((s) => s.outcome === "crashed").length;
		failureRate7d = crashedCount / recent7d.length;
	}

	// --- Last session crash (within 7 days only) ---
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
