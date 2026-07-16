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
 *
 * @lore AU19 Increment 4: `EnforcementEntry`/`EnforcementRegistry` TYPES
 * reclassified to `@hyperidle/shared` (re-exported here unchanged) — both
 * `mcp-provider` (its `/return-status` route) and `tool-provider`
 * (`return-status-tool.ts`) are SIBLING agent-execution Services that need
 * this type, and Mechanism C forbids a Service importing another Service
 * even within the same Layer. `harness-registry` stays the sole owner of the
 * concrete `createEnforcementRegistry()` factory + the process singleton.
 */

import type { EnforcementEntry, EnforcementRegistry } from "@hyperidle/shared";

export type { EnforcementEntry, EnforcementRegistry } from "@hyperidle/shared";

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
