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

// @lore AU44-b8: HealthSignalInput, computeHealthSignals, deriveHealthLevel,
// deriveHealthDetail moved to layers/core-ui/src/hooks/agent-health.ts.
// The browser is the sole consumer (AU26 J4 — profile page fetches run rows
// from agent-orchestration directly and derives health in the browser).
// AgentHealthSignals and AgentActiveSession/AgentSessionSummary/AgentPerformanceStats
// moved with them from framework/domain-model/src/agent-profile.ts.
