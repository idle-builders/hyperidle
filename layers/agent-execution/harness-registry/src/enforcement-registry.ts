/**
 * Per-session return-enforcement registry types + factory.
 *
 * A per-session key-value store: { gate, forceCount, exempt } keyed by
 * sessionId. Accessed by:
 *   - the return_status tool handler (reads ctx.sessionId → registry)
 *   - the in-process SDK Stop closure (reads registry directly)
 *   - the process-wrapper re-engage (reads registry for budget tracking)
 *   - the MCP bridge's /return-status route (mcp-provider)
 */

/** The retained gate reference and per-session force tracking. */
export interface EnforcementEntry {
	/** Shared live reference to the drain-gate — mutated by the event-stream observer. */
	readonly gate: { returned: boolean };
	/** How many times the force-return hook has fired for this session. */
	forceCount: number;
	/** Exempt sessions (internal-extraction drains) skip enforcement entirely. */
	readonly exempt: boolean;
	/** When present, narrows the gate predicate — only a tool call naming one of these flips `returned`. Absent = any return-set member satisfies. */
	readonly requiredReturnActions?: readonly string[];
}

export interface EnforcementRegistry {
	/** Overwrites any existing entry — safe for re-registration on session restart. */
	register(sessionId: string, entry: EnforcementEntry): void;
	get(sessionId: string): EnforcementEntry | undefined;
	/** No-op if session not registered (late calls after cleanup are safe). */
	incrementForce(sessionId: string): void;
	/** No-op if session not registered. */
	unregister(sessionId: string): void;
}
