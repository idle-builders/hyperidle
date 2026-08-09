/**
 * Per-session return-enforcement registry types + factory.
 *
 * A per-session key-value store: { gate, forceCount, exempt } keyed by
 * sessionId. Accessed by:
 *   - the return_status tool handler (reads ctx.sessionId → registry)
 *   - the in-process SDK Stop closure (reads registry directly)
 *   - the process-wrapper re-engage (reads registry for budget tracking)
 *   - the MCP bridge's /return-status route (mcp-provider)
 *
 * @lore AU19 Increment 4: reclassified from `packages/server/src/harness/
 * return-enforcement-registry.ts` to `@hyperidle/harness-protocol` — `harness-registry`
 * (owner, agent-execution) and `mcp-provider` (consumer, agent-execution) are
 * SIBLING Services; Mechanism C forbids a Service importing another Service
 * even within the same Layer, so the TYPE crosses via `@hyperidle/harness-protocol`
 * (§7.3 W4) while the concrete `createEnforcementRegistry()` factory stays
 * owned by `harness-registry` and is injected into `mcp-provider`'s
 * `createMcpRoute(bridgeRegistry, enforcementRegistry?)` by the composition
 * root — same idiom as `HttpError`/`CassetteMissError` (Increment 3h).
 */

/** The retained gate reference and per-session force tracking. */
export interface EnforcementEntry {
	/** Shared live reference to the drain-gate — mutated by the event-stream observer. */
	readonly gate: { returned: boolean };
	/** How many times the force-return hook has fired for this session. */
	forceCount: number;
	/** Exempt sessions (internal-extraction drains) skip enforcement entirely. */
	readonly exempt: boolean;
	/**
	 * AU27 Increment 3 (Decision 3) — the session's specific required return
	 * subset, when it has one (structural rule: `["reply"]` for a session
	 * whose output belongs in a calling thread and has no task — the
	 * assistant, post-AU27; unchanged `undefined` for every session that
	 * still satisfies the gate via plain membership in the full return set).
	 */
	readonly requiredReturnActions?: readonly string[];
}

export interface EnforcementRegistry {
	/**
	 * Register a new session. Overwrites any existing entry for the same sessionId
	 * (safe: re-registration on session restart carries forward state if needed).
	 */
	register(sessionId: string, entry: EnforcementEntry): void;
	/** Get the live entry for a session, or undefined if not registered. */
	get(sessionId: string): EnforcementEntry | undefined;
	/**
	 * Increment the forceCount for a session.
	 * No-op if the session is not registered (guards against late calls on
	 * sessions already cleaned up).
	 */
	incrementForce(sessionId: string): void;
	/**
	 * Unregister a session on teardown.
	 * No-op if the session is not registered.
	 */
	unregister(sessionId: string): void;
}
