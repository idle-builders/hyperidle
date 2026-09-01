/**
 * Action gate store — per-session rule registry consulted by `/action-check`.
 *
 * The store is an in-memory map: sessionId → resolved ActionRule[]. Rules are
 * provisioned at session-start and released at session-end. The `/action-check`
 * route calls `check()` per tool-use hook invocation.
 *
 * Pattern matching:
 *   "*"               → matches every tool name (wildcard)
 *   "bash"            → exact match on the tool name (case-insensitive)
 *   "bash:git push"   → prefix match: tool name starts with "bash" (ignores specifier —
 *                       gate scripts carry the full tool_input for context, but the
 *                       route receives only the name from the hook stdin)
 *
 * @lore BA2: The store is separate from EnforcementRegistry to keep the gate
 * (per-call PreToolUse) and the return enforcement (per-turn Stop) concerns
 * independent. Each store entry holds rules exactly as `resolveActionRules` returned
 * them — no pre-indexing, since the rule set is small (typically 0–10 entries per session).
 */

export interface GateRule {
	readonly id: string;
	readonly pattern: string;
	readonly description: string;
}

export interface GateCheckResult {
	readonly allowed: true;
}

export interface GateDenyResult {
	readonly allowed: false;
	readonly ruleId: string;
	readonly description: string;
}

export type GateResult = GateCheckResult | GateDenyResult;

/**
 * One action a rule blocked: the rule that matched and the tool it matched on.
 *
 * @lore BA2: The tool name is half of the identity on purpose. A clearance keyed
 * only to the rule would be spent by any call the rule covers, and a clearance
 * keyed to "the next call" was the defect that made an approved action get denied
 * again while a harmless read consumed the pass.
 */
export interface DeniedAction {
	readonly ruleId: string;
	readonly toolName: string;
}

export interface ActionGateStore {
	/**
	 * Store the resolved rules for a session. Called at provisioning time.
	 * Calling set() with an empty array is valid — the session is ungated.
	 */
	set(sessionId: string, rules: readonly GateRule[]): void;
	/**
	 * Evaluate whether the given tool name is allowed in this session.
	 * Returns `{ allowed: true }` when no rule matches, or when the session
	 * has no rules registered.
	 */
	check(sessionId: string, toolName: string): GateResult;
	/**
	 * The action this session was last denied, if any.
	 *
	 * Read when the agent files a review, so the review can be tied to the block
	 * that caused it. A session that was never denied returns undefined, which is
	 * what stops an ordinary review from clearing anything.
	 */
	pendingDenial(sessionId: string): DeniedAction | undefined;
	/**
	 * Let one attempt at `action` through, once.
	 *
	 * Called when a human approves the review the denial produced. The pass is
	 * spent by that action and no other, so the resumed session's first call —
	 * typically a harmless read — cannot consume it.
	 */
	clear(sessionId: string, action: DeniedAction): void;
	/**
	 * Release a session's rule set, its pending denial and any unspent clearance
	 * when the session ends.
	 */
	delete(sessionId: string): void;
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/**
 * Test whether a rule pattern matches a tool name.
 *
 * Matching rules (evaluated in order, first match wins):
 *   1. `*` matches everything.
 *   2. The pattern is compared case-insensitively against the full tool name.
 *   3. The pattern is compared case-insensitively against the tool name up to
 *      the first `_` or `:` — so "bash" matches "bash:git push" and "bash_run".
 *
 * @lore BA2: The gate script receives the tool name from hook stdin (e.g.
 * "Bash", "Write", "mcp__hyperidle__reply"). Pattern comparison is
 * case-insensitive to avoid "bash" vs "Bash" mismatches across harnesses.
 */
function matchesPattern(pattern: string, toolName: string): boolean {
	if (pattern === "*") return true;
	const lower = toolName.toLowerCase();
	const pat = pattern.toLowerCase();
	if (lower === pat) return true;
	// Prefix match up to delimiter — "bash" matches "bash:git push" and "bash_run"
	return lower.startsWith(`${pat}:`) || lower.startsWith(`${pat}_`);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function sameAction(a: DeniedAction, b: DeniedAction): boolean {
	return a.ruleId === b.ruleId && a.toolName.toLowerCase() === b.toolName.toLowerCase();
}

export function createActionGateStore(): ActionGateStore {
	const map = new Map<string, readonly GateRule[]>();
	const denials = new Map<string, DeniedAction>();
	const clearances = new Map<string, DeniedAction>();

	return {
		set(sessionId, rules) {
			map.set(sessionId, rules);
		},

		check(sessionId, toolName) {
			const rules = map.get(sessionId);
			if (!rules?.length) return { allowed: true };
			for (const rule of rules) {
				if (!matchesPattern(rule.pattern, toolName)) continue;

				// A human cleared exactly this action. Spend the pass and let it by.
				const cleared = clearances.get(sessionId);
				if (cleared && sameAction(cleared, { ruleId: rule.id, toolName })) {
					clearances.delete(sessionId);
					return { allowed: true };
				}

				denials.set(sessionId, { ruleId: rule.id, toolName });
				return { allowed: false, ruleId: rule.id, description: rule.description };
			}
			return { allowed: true };
		},

		pendingDenial(sessionId) {
			return denials.get(sessionId);
		},

		clear(sessionId, action) {
			clearances.set(sessionId, action);
		},

		delete(sessionId) {
			map.delete(sessionId);
			denials.delete(sessionId);
			clearances.delete(sessionId);
		},
	};
}
