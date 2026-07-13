/**
 * AB1 — GET /api/agents/:id/profile route handler.
 *
 * Returns a complete operational picture of an AI agent in one response:
 * identity, configuration, skills, recent activity, performance, health,
 * and harness capabilities.
 *
 * @lore AB1 A1: Handler is in a separate file (not inlined in agents.ts) to
 * keep agents.ts focused on CRUD. The profile handler is imported and mounted
 * by the agents route factory.
 *
 * @lore AB1 A2: The `status` field on users (active/paused/retired) is config
 * status. Operational status (active/idle/error) is derived on the frontend:
 *   active  = activeSession !== null
 *   error   = recent session crashed (frontend: lastSessionCrashed)
 *   idle    = otherwise
 *
 * @lore AB1: Per-session cost is always null — sessions table lacks cost
 * columns. Honest over fabricated.
 */

import { sessions, teamMembers, teams } from "@hyperidle/db";
import type {
	AgentActiveSession,
	AgentHarnessCapabilities,
	AgentHealthLevel,
	AgentHealthSignals,
	AgentPerformanceStats,
	AgentProfileResponse,
	AgentReviewTrackRecord,
	AgentSessionSummary,
	HarnessCapabilities,
} from "@hyperidle/shared";
import * as work from "@hyperidle/work";
import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { computeApprovalRate } from "../services/approval-rate.js";
import {
	type HarnessCapabilityReader,
	harnessCapabilitiesForType,
	registeredHarnessCount,
} from "../services/harness-capability-read-model.js";
import { getUserById } from "../services/user-store.js";

// ---------------------------------------------------------------------------
// Health signal computation (exported for unit tests — see A5 finding)
// ---------------------------------------------------------------------------

/** Input shape for computeHealthSignals — allows unit testing in isolation. */
export interface HealthSignalInput {
	sessions: Array<{
		startedAt: string;
		endedAt: string | null;
		outcome: string | null;
	}>;
	harnessType: string | null;
	harnessAvailable: boolean;
}

/**
 * Compute health signals from raw session data.
 * Exported so unit tests can exercise the computation without a DB.
 *
 * @lore AB1 A5: Per reviewer finding, health signal logic must have dedicated
 * unit tests. Exporting from this module enables isolated testing via
 * health-signals.test.ts.
 *
 * @lore AB1 F3/A3: idleDurationMs added per reviewer finding. Computed from
 * MAX(sessions.endedAt) of the most recent completed session.
 */
export function computeHealthSignals(input: HealthSignalInput): AgentHealthSignals {
	const { sessions: sessionRows, harnessAvailable } = input;

	// --- Failure rate and last session crash (last 7 days) ---
	// @lore AB1: Both failure rate AND lastSessionCrashed are scoped to the
	// 7-day window. Sessions older than 7 days do not contribute to any degraded
	// signal. This matches the test expectations ("excludes sessions older than
	// 7 days from failure rate" → degraded=false).
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).getTime();
	const recent7d = sessionRows.filter((s) => {
		const started = new Date(s.startedAt).getTime();
		return started >= sevenDaysAgo;
	});

	let failureRate7d = 0;
	if (recent7d.length > 0) {
		const crashedCount = recent7d.filter((s) => s.outcome === "crashed").length;
		failureRate7d = crashedCount / recent7d.length;
	}

	// --- Last session crash (within 7 days only) ---
	// Determine if the last crash is MORE RECENT than the last success.
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

	// lastSessionCrashed is true only when the most recent crash is strictly
	// more recent than the most recent success (or when there are only crashes)
	const lastSessionCrashed: boolean =
		latestCrashTime !== null && (latestSuccessTime === null || latestCrashTime > latestSuccessTime);

	// --- Idle duration ---
	// Find the most recent session (all time) that has ended — not scoped to 7d
	// @lore AB1 F3/A3: idleDurationMs is computed from all sessions, not just 7d,
	// so the page shows how long since ANY session, not just recent ones.
	const allSortedByStart = [...sessionRows].sort(
		(a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
	);
	const endedSessions = allSortedByStart.filter((s) => s.endedAt !== null);
	let idleDurationMs: number | null = null;
	if (endedSessions.length > 0) {
		const mostRecentEnded = endedSessions[0];
		if (mostRecentEnded?.endedAt !== null && mostRecentEnded?.endedAt !== undefined) {
			idleDurationMs = Date.now() - new Date(mostRecentEnded.endedAt).getTime();
		}
	}

	// --- Degraded check ---
	const degraded = failureRate7d > 0.5 || lastSessionCrashed || !harnessAvailable;

	return {
		failureRate7d,
		lastSessionCrashed,
		harnessAvailable,
		idleDurationMs,
		degraded,
	};
}

// ---------------------------------------------------------------------------
// AB2: Health level and detail derivation (exported for teams-routes.ts)
// ---------------------------------------------------------------------------

/**
 * Derive a 3-level health indicator from pre-computed health signals.
 *
 * - critical: failureRate7d > 0.5 (sustained crash pattern)
 * - warning: lastSessionCrashed = true OR harness unavailable (single crash / infra issue)
 * - healthy: no degradation
 *
 * @lore AB2: Reuses the same AgentHealthSignals computed by computeHealthSignals
 * so the team page shows exactly the same health state as the agent profile page.
 *
 * @lore AB2 fix: The function accepts a partial signal shape (Pick) so unit tests
 * can pass { failureRate7d, lastSessionCrashed } without the full AgentHealthSignals
 * (which also requires harnessAvailable, idleDurationMs, degraded). Derived directly
 * from signals — does NOT rely on the pre-computed `degraded` field to avoid returning
 * "healthy" when degraded is absent (undefined).
 */
export function deriveHealthLevel(
	signals: Pick<AgentHealthSignals, "failureRate7d" | "lastSessionCrashed">,
): AgentHealthLevel {
	if (signals.failureRate7d > 0.5) return "critical";
	if (signals.lastSessionCrashed) return "warning";
	// Check harnessAvailable only when the full signal shape is provided
	const fullSignals = signals as Partial<AgentHealthSignals>;
	if (fullSignals.harnessAvailable === false) return "warning";
	return "healthy";
}

/**
 * Build a human-readable detail string from health signals.
 * Returns "Healthy" when not degraded. Lists active problems otherwise.
 *
 * @lore AB2: Plain text so it can be used as title= attribute on health dots.
 *
 * @lore AB2 fix: Accepts partial signal shape (same as deriveHealthLevel) so
 * unit tests can pass { failureRate7d, lastSessionCrashed } without the full
 * AgentHealthSignals. Derives problems directly from signal values.
 */
export function deriveHealthDetail(
	signals: Pick<AgentHealthSignals, "failureRate7d" | "lastSessionCrashed">,
): string {
	const parts: string[] = [];
	if (signals.failureRate7d > 0.5) {
		parts.push(`High failure rate (${Math.round(signals.failureRate7d * 100)}%)`);
	}
	if (signals.lastSessionCrashed) {
		parts.push("Last session crashed");
	}
	// Check harnessAvailable only when the full signal shape is provided
	const fullSignals = signals as Partial<AgentHealthSignals>;
	if (fullSignals.harnessAvailable === false) {
		parts.push("Harness unavailable");
	}
	return parts.length > 0 ? parts.join(". ") : "Healthy";
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/agents/:id/profile.
 * Returns AgentProfileResponse for a valid AI agent.
 * Returns 404 for non-existent IDs or human users.
 */
export async function handleAgentProfile(
	c: Context<HyperIdleEnv>,
	db: import("@hyperidle/db").HyperIdleDb,
	adapterPool: HarnessCapabilityReader | undefined,
): Promise<Response> {
	const agentId = c.req.param("id");
	if (!agentId) {
		return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
	}

	// 1. Fetch the agent (kind='ai', not system)
	const agent = await getUserById(db, agentId);

	if (!agent || agent.kind !== "ai") {
		return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
	}

	// 2. Resolve team name and team ID via teamMembers→teams join
	// @lore AB1 S4: teamId is included in the response so the frontend breadcrumb
	// can link to /work/team/:teamId for team agents instead of always /work/portfolio.
	let teamName: string | null = null;
	let resolvedTeamId: string | null = null;
	if (agent.teamId) {
		const [tmRow] = await db
			.select({ teamName: teams.name, teamId: teams.id })
			.from(teamMembers)
			.innerJoin(teams, eq(teamMembers.teamId, teams.id))
			.where(eq(teamMembers.id, agent.teamId))
			.limit(1);
		teamName = tmRow?.teamName ?? null;
		resolvedTeamId = tmRow?.teamId ?? null;
	}

	// 3. Fetch all sessions for this agent (needed for active check + recent + performance + health)
	const allSessions = await db
		.select({
			id: sessions.id,
			taskId: sessions.taskId,
			startedAt: sessions.startedAt,
			endedAt: sessions.endedAt,
			state: sessions.state,
			outcome: sessions.outcome,
		})
		.from(sessions)
		.where(eq(sessions.agentId, agentId))
		.orderBy(desc(sessions.startedAt));

	// 4. Active session — include betId for correct /work/bet/:betId/task/:taskId link
	// @lore AB1 M1: The bet route expects betId, not taskId. We JOIN tasks to get betId.
	const activeSessionRow = allSessions.find((s) => s.state === "active") ?? null;
	let activeSession: AgentActiveSession | null = null;
	if (activeSessionRow?.taskId) {
		const activeTaskRow = await work.getTaskById(db, activeSessionRow.taskId);
		activeSession = {
			sessionId: activeSessionRow.id,
			taskId: activeSessionRow.taskId,
			betId: activeTaskRow?.betId ?? "",
			startedAt: activeSessionRow.startedAt,
		};
	}

	// 5. Recent sessions (last 10, newest first) — fetch task titles in one JOIN query
	// @lore AB1 S2: Replaced N+1 pattern (one query per session) with a single Drizzle
	// query that JOINs sessions with tasks. For up to 10 sessions this is at most 1 query.
	const recentSessionRows = allSessions.slice(0, 10);
	let recentSessions: AgentSessionSummary[] = [];
	if (recentSessionRows.length > 0) {
		const taskBackedSessionRows = recentSessionRows.flatMap((s) =>
			s.taskId ? [{ ...s, taskId: s.taskId }] : [],
		);
		const taskIds = taskBackedSessionRows.map((s) => s.taskId);
		const taskTitleRows = await work.listTasksByIds(db, taskIds);
		const taskTitleMap = new Map(taskTitleRows.map((t) => [t.id, t.title]));
		recentSessions = taskBackedSessionRows.map((s) => ({
			sessionId: s.id,
			taskId: s.taskId,
			taskTitle: taskTitleMap.get(s.taskId) ?? s.taskId,
			outcome: s.outcome,
			startedAt: s.startedAt,
			endedAt: s.endedAt,
			cost: null,
		})) satisfies AgentSessionSummary[];
	}

	// 6. Performance aggregates (from all sessions)
	const totalSessions = allSessions.length;
	const successCount = allSessions.filter((s) => s.outcome === "completed").length;
	const successRate = totalSessions > 0 ? successCount / totalSessions : 0;
	const performance: AgentPerformanceStats = { totalSessions, successCount, successRate };

	// 7. Health signals
	// Determine harness availability from adapter pool
	const harnessAvailable = resolveHarnessAvailable(agent.harnessType, adapterPool);
	const healthSignals = computeHealthSignals({
		sessions: allSessions.map((s) => ({
			startedAt: s.startedAt,
			endedAt: s.endedAt,
			outcome: s.outcome,
		})),
		harnessType: agent.harnessType,
		harnessAvailable,
	});

	// 8. Harness capabilities
	const rawCaps = harnessCapabilitiesForType(adapterPool, agent.harnessType ?? null);
	const harnessCapabilities = mapCapabilities(rawCaps);

	// 9. Review track record (replaces skills)
	// @lore AD4: Skills removed. Trust is now computed from verdict message history.
	// @lore AU18: `trust_window_days` settability via factory_settings is retired
	// (plan §3/§10 — no production/eval writer ever existed). Fixed default.
	const windowDays = TRUST_WINDOW_DAYS;
	const trackRecordResult = await computeApprovalRate(db, agentId, windowDays, 10);

	const reviewTrackRecord: AgentReviewTrackRecord = {
		approvalRate: trackRecordResult.approvalRate,
		totalVerdicts: trackRecordResult.totalVerdicts,
		recentVerdicts: trackRecordResult.recentVerdicts.map((v) => ({
			decision: v.decision,
			threadId: v.threadId,
			createdAt: v.createdAt,
		})),
		windowDays,
	};

	const profile: AgentProfileResponse = {
		id: agent.id,
		name: agent.name,
		role: agent.role,
		agentCategory: agent.agentCategory ?? null,
		teamName,
		teamId: resolvedTeamId,
		createdAt: agent.createdAt,
		systemPrompt: agent.systemPrompt ?? null,
		harnessType: agent.harnessType ?? null,
		modelTierPreference: agent.modelTierPreference ?? null,
		maxConcurrentSessions: agent.maxConcurrentSessions,
		mcpSetup: null,
		activeSession,
		recentSessions,
		performance,
		healthSignals,
		harnessCapabilities,
		reviewTrackRecord,
	};

	return c.json(profile);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @lore AU18: was settable via `factory_settings.trust_window_days` — now the fixed default. */
const TRUST_WINDOW_DAYS = 30;

/**
 * Determine if the agent's required harness type is available in the pool.
 *
 * @lore AB1 AC-10: When agent has no harnessType preference (null), any adapter
 * will do — harness is available if the pool has any adapter at all.
 * When agent requires a specific harnessType, check if that type is registered.
 * When no pool is configured (kernel-only mode), always returns true so the
 * profile page doesn't false-alarm in tests that don't pass an adapterPool.
 *
 * @lore AB2: Exported so teams-routes.ts can reuse the same availability logic
 * when computing operational status for each roster member. Avoids duplicating
 * the harness-pool check across two routes.
 */
export function resolveHarnessAvailable(
	harnessType: string | null | undefined,
	adapterPool: HarnessCapabilityReader | undefined,
): boolean {
	if (!adapterPool) return true;
	if (!harnessType) {
		// No preference — any adapter will do
		return registeredHarnessCount(adapterPool) > 0;
	}
	// Specific type required — check if it's registered
	return harnessCapabilitiesForType(adapterPool, harnessType) !== null;
}

/**
 * Map HarnessCapabilities to the UI-friendly AgentHarnessCapabilities shape.
 * When no capabilities are available (null), defaults to all-false.
 */
function mapCapabilities(caps: HarnessCapabilities | null): AgentHarnessCapabilities {
	if (!caps) {
		return {
			toolUse: false,
			mcpSupport: false,
			fileEditing: false,
			subAgents: false,
		};
	}
	return {
		// "tool use" = preCompactionTrigger is a rough proxy for a capable harness
		// A harness with preCompactionTrigger is always tool-capable
		toolUse: caps.preCompactionTrigger,
		mcpSupport: caps.mcpSupport,
		// File editing capability — subAgents implies it indirectly; assume capable
		// if the harness supports subAgents (Claude Code, builtin)
		fileEditing: caps.subAgents,
		subAgents: caps.subAgents,
	};
}
