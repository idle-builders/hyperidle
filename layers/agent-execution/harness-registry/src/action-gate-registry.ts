/**
 * Per-session action gate registry.
 *
 * Tracks the gate rules, pending blocks, single-use clearances, and native
 * session IDs for each active session. Modelled after EnforcementRegistry.
 *
 * @lore BA2: Clearances are in-memory (not persisted) because they are
 * single-use and session-scoped. The plan described file-based clearances
 * ("rewrite the sandbox's hook config"), but server-side in-memory clearances
 * are equivalent: they expire when the session unregisters and need no table,
 * no state machine, and no persistence beyond the session lifetime.
 *
 * @lore BA2 single-use-keyed-to-action: a clearance is keyed to a SPECIFIC
 * tool name. The hook checks the tool being called, not "the next call".
 * First attempt let the first harmless read consume the pass; this fixes that.
 *
 * @lore BA2 no-extra-clearance-from-ordinary-review: only a review whose
 * pendingBlock was set by /action-check may trigger a clearance. An ordinary
 * review (no pendingBlock) must not mint one — enforced by the caller checking
 * `get(sessionId)?.pendingBlock` before recording and later clearing.
 */

export interface GateRule {
	readonly id: string;
	readonly pattern: string;
	readonly description: string;
}

export interface PendingBlock {
	readonly ruleId: string;
	readonly rulePattern: string;
	readonly blockedTool: string;
}

export interface ActionGateEntry {
	readonly rules: readonly GateRule[];
	pendingBlock: PendingBlock | null;
	/** Single-use clearances keyed by tool name. */
	readonly clearances: Set<string>;
	/** The harness's native session ID, captured after startSession. */
	nativeSessionId: string | null;
	/** The sandbox path for this session. */
	readonly sandboxPath: string;
}

export interface ActionGateRegistry {
	/**
	 * Register a new session with its resolved rules and sandbox path.
	 * Overwrites any existing entry (safe on session restart).
	 */
	register(
		sessionId: string,
		entry: { readonly rules: readonly GateRule[]; readonly sandboxPath: string },
	): void;
	/** Get the live entry for a session, or undefined if not registered. */
	get(sessionId: string): ActionGateEntry | undefined;
	/** Record the pending block (called by /action-check on deny). */
	setPendingBlock(sessionId: string, block: PendingBlock): void;
	/** Clear the pending block (called after recording a gate review). */
	clearPendingBlock(sessionId: string): void;
	/** Add a single-use clearance for a specific tool (called on approval). */
	addClearance(sessionId: string, toolName: string): void;
	/**
	 * Check if a clearance exists for this tool and consume it.
	 * Returns true if a clearance was found and consumed.
	 */
	checkAndConsumeClearance(sessionId: string, toolName: string): boolean;
	/** Store the harness-native session ID after startSession. */
	setNativeSessionId(sessionId: string, nativeSessionId: string): void;
	/** Unregister a session on teardown. No-op if not registered. */
	unregister(sessionId: string): void;
}

export function createActionGateRegistry(): ActionGateRegistry {
	const entries = new Map<string, ActionGateEntry>();

	return {
		register(sessionId, { rules, sandboxPath }) {
			entries.set(sessionId, {
				rules,
				sandboxPath,
				pendingBlock: null,
				clearances: new Set(),
				nativeSessionId: null,
			});
		},

		get(sessionId) {
			return entries.get(sessionId);
		},

		setPendingBlock(sessionId, block) {
			const entry = entries.get(sessionId);
			if (entry) entry.pendingBlock = block;
		},

		clearPendingBlock(sessionId) {
			const entry = entries.get(sessionId);
			if (entry) entry.pendingBlock = null;
		},

		addClearance(sessionId, toolName) {
			const entry = entries.get(sessionId);
			if (entry) entry.clearances.add(toolName);
		},

		checkAndConsumeClearance(sessionId, toolName) {
			const entry = entries.get(sessionId);
			if (!entry) return false;
			if (entry.clearances.has(toolName)) {
				entry.clearances.delete(toolName);
				return true;
			}
			return false;
		},

		setNativeSessionId(sessionId, nativeSessionId) {
			const entry = entries.get(sessionId);
			if (entry) entry.nativeSessionId = nativeSessionId;
		},

		unregister(sessionId) {
			entries.delete(sessionId);
		},
	};
}
