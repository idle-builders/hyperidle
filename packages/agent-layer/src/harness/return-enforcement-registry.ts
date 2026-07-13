/**
 * AL6 v4-final — Per-session return-enforcement registry.
 *
 * A per-session key-value store:
 *   { gate, forceCount, exempt }
 * keyed by sessionId. Replaces the v3 loopForceCount (which lived on the
 * outer re-prompt loop stack) with a registry accessible by:
 *   - the hyperidle_return_status tool handler (reads ctx.sessionId → registry)
 *   - the in-process SDK Stop closure (reads registry directly)
 *   - the process-wrapper re-engage (reads registry for budget tracking)
 *
 * @lore AL6 v4-final: The registry is the single source of truth for
 * "how many times has this session been forced to return" and "is it exempt".
 * v3 stored loopForceCount on the stack of the while(true) loop (now deleted).
 * v4 stores it here so any code path (SDK hook, process wrapper, bridge callback)
 * can read and mutate it without needing access to the provisioning call frame.
 */

/** The retained gate reference and per-session force tracking. */
export interface EnforcementEntry {
	/** Shared live reference to the drain-gate — mutated by the event-stream observer. */
	readonly gate: { returned: boolean };
	/** How many times the force-return hook has fired for this session. */
	forceCount: number;
	/** Exempt sessions (internal-extraction drains) skip enforcement entirely. */
	readonly exempt: boolean;
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

/**
 * Create a fresh, isolated enforcement registry.
 * One per server process is enough (sessionIds are globally unique UUIDs),
 * but `createEnforcementRegistry()` is exposed as a factory so tests can
 * create isolated instances without shared state leaking between test cases.
 */
export function createEnforcementRegistry(): EnforcementRegistry {
	const store = new Map<string, EnforcementEntry>();

	return {
		register(sessionId, entry) {
			store.set(sessionId, entry);
		},

		get(sessionId) {
			return store.get(sessionId);
		},

		incrementForce(sessionId) {
			const entry = store.get(sessionId);
			if (entry) {
				entry.forceCount += 1;
			}
		},

		unregister(sessionId) {
			store.delete(sessionId);
		},
	};
}

/**
 * The process-level singleton registry.
 * Imported by the MCP bridge and the SDK Stop closure.
 * Tests use `createEnforcementRegistry()` instead (isolated per test).
 */
export const enforcementRegistry: EnforcementRegistry = createEnforcementRegistry();
