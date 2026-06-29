/**
 * AL6: The closed, enumerable set of "return to HyperIdle" actions. A turn that
 * ends without invoking one is `not-returned` (see return-gate.ts). This set is
 * CLOSED: membership is a fixed list of tool names, never "any tool". Adding a
 * member is a deliberate edit here. (AC2: HyperIdle enumerates valid turn endings
 * by reading RETURN_ACTION_NAMES.)
 *
 * @lore AL6: Lives in @hyperidle/shared so the tool layer, every adapter, and
 * the enforcement observer import one definition — no per-package copy that can
 * drift. The "closed, not open-ended" guarantee is enforced at the type level
 * (ReturnActionName is a finite union from an `as const` readonly tuple) and at
 * runtime via the closure test in return-actions.closure.test.ts (imports
 * RETURN_ACTION_NAMES + ALL_TOOL_DEFINITIONS and asserts every member maps to a
 * real registered tool — drift caught at CI time).
 *
 * v1 ships the name-only trio: submit_review / handoff_to / send_message.
 * update_task_status is deferred (concept §2.1 path B) — adding it later is a
 * one-tool edit, not a model change. The `_args` param in isReturnAction is
 * pre-wired for path A (argument-gated member) without widening the set.
 */

/** The three v1 return-action names as a frozen readonly tuple. */
export const RETURN_ACTION_NAMES = ["submit_review", "handoff_to", "send_message"] as const;

/** Finite union of all valid return-action tool names. */
export type ReturnActionName = (typeof RETURN_ACTION_NAMES)[number];

/** @internal Fast O(1) membership lookup. */
const RETURN_ACTION_SET: ReadonlySet<string> = new Set(RETURN_ACTION_NAMES);

/**
 * Strip a leading MCP namespace prefix from a tool name.
 *
 * CLI harnesses (claude/codex/opencode) route HyperIdle tools through the MCP
 * bridge, where they arrive NAMESPACED as `mcp__<server>__<bare-name>` (e.g.
 * `mcp__hyperidle__send_message`). The bare name is `send_message`. The builtin
 * harness calls bare names directly (no namespace). This helper normalises both
 * forms to the bare name so callers can do a single set lookup.
 *
 * Pattern: `mcp__<server>__<name>` → `<name>`. Any string not matching the
 * pattern is returned unchanged (idempotent for bare names and unknown forms).
 *
 * @lore AR2: Fixed here — AR1 surfaced the bug end-to-end (session verdicted
 * `not_returned` even when the agent genuinely called `send_message` via MCP).
 * AR1 could not fix it (test-honesty scope only; must not change production
 * behavior to make a test pass). AR2 (provisionSession-seam WP) owns the fix.
 */
function stripMcpNamespace(toolName: string): string {
	// `mcp__<server>__<bare>` — two leading double-underscore-delimited segments.
	const match = /^mcp__.+?__(.+)$/.exec(toolName);
	return match?.[1] ?? toolName;
}

/**
 * AL6: Per-tool return predicate. True when `toolName` is a member of the
 * closed accepted-return set AND its per-tool argument predicate holds.
 *
 * v1: all three members are unconditionally terminal (`_args` unused).
 * Path A hook: when an argument-gated member (e.g. update_task_status→done)
 * is added, extend this function with a per-name predicate — do NOT widen
 * the set to "any tool with the right args".
 *
 * @lore AR2: MCP-namespaced tool names (`mcp__hyperidle__send_message` etc.)
 * are normalised to their bare form before the set lookup so CLI+MCP sessions
 * are verdicted correctly. The builtin harness is unaffected (bare names pass
 * through `stripMcpNamespace` unchanged).
 */
export function isReturnAction(toolName: string, _args?: Record<string, unknown>): boolean {
	return RETURN_ACTION_SET.has(stripMcpNamespace(toolName));
}

/**
 * AL6: Exemption predicate for internal-extraction drains (concept §1.5).
 *
 * A session run is an internal-extraction drain — exempt from return
 * enforcement — when its SessionConfig.tools is empty. With no tools the
 * run structurally CANNOT invoke a return action; enforcing one is
 * impossible, not merely skipped.
 *
 * The other two legs of the §1.5 predicate (deterministic structured-output
 * contract; not acting on the user's behalf) are call-site contracts that the
 * empty-tools leg already implies for any platform-internal drain.
 *
 * @lore AL6: accepts `{ tools: readonly string[] }` (a structural subset of
 * SessionConfig) so it can be called without importing the full SessionConfig
 * type — keeping this helper usable in tests that construct minimal config
 * objects without satisfying the entire interface.
 */
export function isInternalExtractionDrain(config: { tools: readonly string[] }): boolean {
	return config.tools.length === 0;
}

/**
 * AL6 v2: The canonical forcing message re-injected when an agent attempts to
 * stop without returning. Single source of truth — used by the SDK Stop hook
 * callback, the builtin loop re-inject, and any future forcing path.
 *
 * @lore AL6 v2: This string is what the agent sees when forced to return.
 * All three return tools are named so the agent can choose the appropriate one.
 * The message is intentionally direct and action-oriented.
 */
export const AL6_FORCE_RETURN_MESSAGE =
	"You have not yet returned your work to HyperIdle. Before this turn can end you must call exactly one of: " +
	"submit_review (submit work for review), handoff_to (hand the task to another agent or a human), or " +
	"send_message (send your result to a thread). Choose the one that fits and call it now.";

/**
 * AL6 v2: Maximum number of force-continue re-injections per turn before
 * falling through to Tier-2 reject. N=2 matches the builtin's bounded-retry
 * discipline (one nudge, one recovery).
 *
 * @lore AL6 v2: After this budget is spent the forcing hook allows the stop
 * and the provisioning drain applies the not_returned outcome. The session
 * never loops forever and never hard-crashes losing mid-turn side-effects.
 */
export const AL6_MAX_FORCE_RETURNS = 2;

/**
 * AL6 v2: Pure helper — determines whether to inject the forcing message.
 *
 * Returns `AL6_FORCE_RETURN_MESSAGE` when:
 *   - No return action was seen this turn (gate.returned === false), AND
 *   - The force budget has not been spent (forceCount < AL6_MAX_FORCE_RETURNS).
 *
 * Returns `null` when:
 *   - A return was already seen (gate.returned === true) — no force needed, OR
 *   - Budget spent (forceCount >= AL6_MAX_FORCE_RETURNS) — fall through to Tier-2 reject.
 *
 * Pure: does NOT mutate the gate or forceCount. The caller increments forceCount
 * and re-prompts. This function is safe to call multiple times with the same inputs.
 */
export function shouldForceReturn(
	gate: { readonly returned: boolean },
	forceCount: number,
): string | null {
	if (gate.returned) return null; // return was seen — allow stop
	if (forceCount >= AL6_MAX_FORCE_RETURNS) return null; // budget spent — Tier-2 reject
	return AL6_FORCE_RETURN_MESSAGE;
}
