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
 * AL6: Per-tool return predicate. True when `toolName` is a member of the
 * closed accepted-return set AND its per-tool argument predicate holds.
 *
 * v1: all three members are unconditionally terminal (`_args` unused).
 * Path A hook: when an argument-gated member (e.g. update_task_status→done)
 * is added, extend this function with a per-name predicate — do NOT widen
 * the set to "any tool with the right args".
 */
export function isReturnAction(toolName: string, _args?: Record<string, unknown>): boolean {
	return RETURN_ACTION_SET.has(toolName);
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
