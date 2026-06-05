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

import { sessions, tasks, teamMembers, teams, userSkills, users } from "@hyperidle/db";
import type {
	AgentActiveSession,
	AgentHarnessCapabilities,
	AgentHealthSignals,
	AgentPerformanceStats,
	AgentProfileResponse,
	AgentSessionSummary,
	AgentSkillInfo,
	HarnessCapabilities,
} from "@hyperidle/shared";
import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import type { AdapterPool } from "../harness/adapter-pool.js";
import type { HyperIdleEnv } from "../middleware/auth.js";

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
	adapterPool: AdapterPool | undefined,
): Promise<Response> {
	const agentId = c.req.param("id");

	// 1. Fetch the agent (kind='ai', not system)
	const [agent] = await db.select().from(users).where(eq(users.id, agentId)).limit(1);

	if (!agent || agent.kind !== "ai") {
		return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
	}

	// 2. Resolve team name via teamMembers→teams join
	let teamName: string | null = null;
	if (agent.teamId) {
		const [tmRow] = await db
			.select({ teamName: teams.name })
			.from(teamMembers)
			.innerJoin(teams, eq(teamMembers.teamId, teams.id))
			.where(eq(teamMembers.id, agent.teamId))
			.limit(1);
		teamName = tmRow?.teamName ?? null;
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

	// 4. Active session
	const activeSessionRow = allSessions.find((s) => s.state === "active") ?? null;
	let activeSession: AgentActiveSession | null = null;
	if (activeSessionRow) {
		activeSession = {
			sessionId: activeSessionRow.id,
			taskId: activeSessionRow.taskId,
			startedAt: activeSessionRow.startedAt,
		};
	}

	// 5. Recent sessions (last 10, newest first) — fetch task titles
	const recentSessionRows = allSessions.slice(0, 10);
	const recentSessions: AgentSessionSummary[] = await Promise.all(
		recentSessionRows.map(async (s) => {
			const [taskRow] = await db
				.select({ title: tasks.title })
				.from(tasks)
				.where(eq(tasks.id, s.taskId))
				.limit(1);
			return {
				sessionId: s.id,
				taskId: s.taskId,
				taskTitle: taskRow?.title ?? s.taskId,
				outcome: s.outcome,
				startedAt: s.startedAt,
				endedAt: s.endedAt,
				cost: null,
			} satisfies AgentSessionSummary;
		}),
	);

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
	const rawCaps = adapterPool?.getCapabilitiesByType(agent.harnessType ?? null) ?? null;
	const harnessCapabilities = mapCapabilities(rawCaps);

	// 9. Skills from userSkills table
	const skillRows = await db.select().from(userSkills).where(eq(userSkills.userId, agentId));

	const skills: AgentSkillInfo[] = skillRows.map((s) => ({
		skillId: s.skillId,
		successCount: s.successCount,
		failureCount: s.failureCount,
		lastUsedAt: s.lastUsedAt,
		autonomyLevel: s.autonomyLevel,
	}));

	const profile: AgentProfileResponse = {
		id: agent.id,
		name: agent.name,
		role: agent.role,
		agentCategory: agent.agentCategory ?? null,
		teamName,
		createdAt: agent.createdAt,
		soulPrompt: agent.soulPrompt ?? null,
		harnessType: agent.harnessType ?? null,
		modelTierPreference: agent.modelTierPreference ?? null,
		maxConcurrentSessions: agent.maxConcurrentSessions,
		mcpSetup: null,
		activeSession,
		recentSessions,
		performance,
		healthSignals,
		harnessCapabilities,
		skills,
	};

	return c.json(profile);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine if the agent's required harness type is available in the pool.
 *
 * @lore AB1 AC-10: When agent has no harnessType preference (null), any adapter
 * will do — harness is available if the pool has any adapter at all.
 * When agent requires a specific harnessType, check if that type is registered.
 * When no pool is configured (kernel-only mode), always returns true so the
 * profile page doesn't false-alarm in tests that don't pass an adapterPool.
 */
function resolveHarnessAvailable(
	harnessType: string | null | undefined,
	adapterPool: AdapterPool | undefined,
): boolean {
	if (!adapterPool) return true;
	if (!harnessType) {
		// No preference — any adapter will do
		return adapterPool.size > 0;
	}
	// Specific type required — check if it's registered
	return adapterPool.getCapabilitiesByType(harnessType) !== null;
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
