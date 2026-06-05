/**
 * AB1 — Agent Profile wire types.
 *
 * 7 types that describe the GET /api/agents/:id/profile response shape.
 * These live in @hyperidle/shared so both server (response construction)
 * and web (hook/component consumption) share the same contract.
 *
 * @lore AB1: Per-session cost is null — sessions table lacks cost columns.
 * The field is present in the type for forward-compatibility; the server
 * always returns null. This is honest over fabricated.
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
	/**
	 * Per-session cost — always null because the sessions table lacks cost
	 * columns. Present for forward-compatibility.
	 * @lore AB1: Honest over fabricated.
	 */
	readonly cost: null;
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

/** One skill entry: usage stats from the userSkills table. */
export interface AgentSkillInfo {
	readonly skillId: string;
	readonly successCount: number;
	readonly failureCount: number;
	readonly lastUsedAt: string | null;
	readonly autonomyLevel: number;
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
	readonly createdAt: string;

	// --- Configuration ---
	readonly soulPrompt: string | null;
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

	// --- Skills ---
	readonly skills: AgentSkillInfo[];
}
