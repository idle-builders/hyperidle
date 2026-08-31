/**
 * AB1 — Agent Profile wire types.
 *
 * 7 types that describe the GET /api/agents/:id/profile response shape.
 * These live in @hyperidle/domain-model so both server (response construction)
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

// @lore AU44-b8: AgentActiveSession, AgentSessionSummary, AgentPerformanceStats,
// and AgentHealthSignals moved to layers/core-ui/src/hooks/agent-health.ts.
// The browser is the sole consumer (AU26 J4). computeHealthSignals/deriveHealthLevel/
// deriveHealthDetail moved with them.

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
	/**
	 * The `agent_file` knowledge document that says who this agent is, or null
	 * if it has none. The profile links to it; the text lives in the document,
	 * which is read and edited like any other knowledge.
	 */
	readonly identityKnowledgeId: string | null;
	readonly harnessType: string | null;
	readonly modelTierPreference: string | null;
	readonly maxConcurrentSessions: number;
	/** MCP connection info (if configured). null in most cases. */
	readonly mcpSetup: null;

	// --- Health input the browser cannot compute ---
	/**
	 * True when the agent has no `harnessType` preference (any adapter works) OR
	 * when an adapter matching it is registered in the server's pool.
	 *
	 * @lore AU26 J4: `activeSession`, `recentSessions`, `performance` and
	 * `healthSignals` were REMOVED from this response — every one of them was
	 * derived in core-api from `agent-orchestration`'s `sessions` table. The
	 * profile page fetches the runs from that Layer's own API and derives all
	 * four itself with `computeHealthSignals` (`@hyperidle/domain-model`). This one
	 * field stays because it is NOT run state: it is a fact about the adapter
	 * pool the server process holds, which the browser cannot see.
	 */
	readonly harnessAvailable: boolean;

	// --- Capabilities ---
	readonly harnessCapabilities: AgentHarnessCapabilities;

	// --- Review Track Record ---
	/** @lore AD4: Replaces skills field. Computed from verdict message history. */
	readonly reviewTrackRecord: AgentReviewTrackRecord;
}
