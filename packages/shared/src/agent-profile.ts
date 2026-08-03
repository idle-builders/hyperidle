/**
 * AB1 — Agent Profile wire types.
 *
 * 7 types that describe the GET /api/agents/:id/profile response shape.
 * These live in @hyperidle/shared so both server (response construction)
 * and web (hook/component consumption) share the same contract.
 *
 * @lore AU21 Increment 14a: `AgentSessionSummary.cost` (always-null
 * placeholder, sessions table never had cost columns) is HARD-DELETED along
 * with the rest of the cost-cap feature — no replacement.
 *
 * @lore AB1: Operational status is derived on the frontend, not stored:
 *   active  = activeSession !== null
 *   error   = recent session crashed
 *   idle    = otherwise
 * The `status` field on users (active/paused/retired) is config status,
 * not operational status (reviewer finding A2).
 */

/** Active session info returned when the agent has a running session. */
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

/** One entry in the agent's recent session history. */
export interface AgentSessionSummary {
	readonly sessionId: string;
	readonly taskId: string;
	readonly taskTitle: string;
	readonly outcome: string | null;
	readonly startedAt: string;
	readonly endedAt: string | null;
}

/** Aggregate performance statistics across all sessions for this agent. */
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

/**
 * Harness capability flags derived from the adapter's getCapabilities() call.
 * Mapped from HarnessCapabilities to a UI-friendly shape.
 */
export interface AgentHarnessCapabilities {
	readonly toolUse: boolean;
	readonly mcpSupport: boolean;
	readonly fileEditing: boolean;
	readonly subAgents: boolean;
}

/**
 * Single verdict entry for the review track record display.
 * @lore AD4: Derived from verdict messages attributed to the agent.
 */
export interface AgentVerdictEntry {
	readonly decision: string;
	readonly threadId: string;
	readonly createdAt: string;
}

/**
 * Review track record — derived trust signal replacing per-skill autonomy level.
 * @lore AD4: Computed from verdict messages in a sliding window. Replaces AgentSkillInfo.
 */
export interface AgentReviewTrackRecord {
	/** Approval rate: (approve + approve-with-comments) / total. 0 when no verdicts. */
	readonly approvalRate: number;
	/** Total verdict count in the sliding window. */
	readonly totalVerdicts: number;
	/** Last N verdicts (newest first). N=10 for the profile page. */
	readonly recentVerdicts: AgentVerdictEntry[];
	/** Sliding window size in days (from factory settings). */
	readonly windowDays: number;
}

/**
 * Full agent profile response from GET /api/agents/:id/profile.
 *
 * Single-endpoint, complete operational picture in one response.
 * @lore AB1: Single endpoint (not multiple) per architecture plan decision.
 */
export interface AgentProfileResponse {
	// --- Identity ---
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly agentCategory: string | null;
	/** Resolved team name via teamMembers→teams join. null when no team. */
	readonly teamName: string | null;
	/**
	 * The team ID for the agent's team membership. null when no team.
	 * Used by the breadcrumb to link back to /work/team/:teamId for team agents.
	 * @lore AB1 S4: Added per reviewer finding — breadcrumb must link to team page, not portfolio.
	 */
	readonly teamId: string | null;
	readonly createdAt: string;

	// --- Configuration ---
	/** @lore AK1: Renamed per AK1 harness-vocab plan. */
	readonly systemPrompt: string | null;
	readonly harnessType: string | null;
	readonly modelTierPreference: string | null;
	readonly maxConcurrentSessions: number;
	/** MCP connection info (if configured). null in most cases. */
	readonly mcpSetup: null;

	// --- Status ---
	/** Active session info. null when agent is idle. */
	readonly activeSession: AgentActiveSession | null;

	// --- Sessions ---
	readonly recentSessions: AgentSessionSummary[];

	// --- Performance ---
	readonly performance: AgentPerformanceStats;

	// --- Health ---
	readonly healthSignals: AgentHealthSignals;

	// --- Capabilities ---
	readonly harnessCapabilities: AgentHarnessCapabilities;

	// --- Review Track Record ---
	/** @lore AD4: Replaces skills field. Computed from verdict message history. */
	readonly reviewTrackRecord: AgentReviewTrackRecord;
}
