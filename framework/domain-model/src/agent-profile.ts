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

/** Single verdict entry for the review track record display. */
export interface AgentVerdictEntry {
	readonly decision: string;
	readonly threadId: string;
	readonly createdAt: string;
}

/** Review track record — derived trust signal computed from verdict messages in a sliding window. */
export interface AgentReviewTrackRecord {
	/** Approval rate: approve / total. 0 when no verdicts. */
	readonly approvalRate: number;
	/** Total verdict count in the sliding window. */
	readonly totalVerdicts: number;
	/** Last N verdicts (newest first). N=10 for the profile page. */
	readonly recentVerdicts: AgentVerdictEntry[];
	/** Sliding window size in days (from factory settings). */
	readonly windowDays: number;
}

/** Full agent profile response from GET /api/agents/:id/profile — single endpoint, complete operational picture. */
export interface AgentProfileResponse {
	// --- Identity ---
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly agentCategory: string | null;
	/** Resolved team name via teamMembers→teams join. null when no team. */
	readonly teamName: string | null;
	/** The team ID. Used by the breadcrumb to link to /work/team/:teamId. null when no team. */
	readonly teamId: string | null;
	readonly createdAt: string;

	// --- Configuration ---
	/**
	 * The `agent_file` document that says who this agent is, or null
	 * if it has none. The profile links to it; the text lives in the document,
	 * which is read and edited like any other document.
	 */
	readonly identityDocumentId: string | null;
	readonly harnessType: string | null;
	readonly maxConcurrentSessions: number;
	/** MCP connection info (if configured). null in most cases. */
	readonly mcpSetup: null;

	// --- Health input the browser cannot compute ---
	/**
	 * True when the agent has no `harnessType` preference (any adapter works) OR
	 * when an adapter matching it is registered in the server's pool.
	 *
	 */
	readonly harnessAvailable: boolean;

	// --- Capabilities ---
	readonly harnessCapabilities: AgentHarnessCapabilities;

	// --- Review Track Record ---
	readonly reviewTrackRecord: AgentReviewTrackRecord;
}
