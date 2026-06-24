/**
 * AL6: Per-turn return gate observer.
 *
 * Pure, allocation-light, harness-agnostic observer that records whether any
 * consumed HarnessEvent was a return action (a member of the closed
 * RETURN_ACTION_NAMES set). Threaded into the two enforced turn drain loops
 * (session-provisioning.ts:760 and assistant-turn.ts) — NOT wired into the
 * exempt extraction drain (bet-decomposition.ts) or forwarding relays.
 *
 * @lore AL6: Observer-in-loop vs wrapper-iterable: observer = +1 line per
 * existing drain loop, zero duplication. A re-yielding generator wrapper
 * would duplicate per-event branch logic (cost/tool/error) or force every
 * consumer through a new signature — higher coupling, more migration.
 */

import type { HarnessEvent } from "@hyperidle/shared";
import { isReturnAction } from "@hyperidle/shared";

/** AL6: Per-turn observer. Pure, allocation-light, harness-agnostic. */
export interface ReturnGate {
	/** Call for every consumed HarnessEvent. Records whether a return action was seen. */
	observe(event: HarnessEvent): void;
	/** True once any consumed tool_call satisfied isReturnAction. */
	readonly returned: boolean;
}

/**
 * Create a fresh ReturnGate for one turn. One gate per drain — gates are
 * independent (no shared state).
 */
export function createReturnGate(): ReturnGate {
	let Returned = false;
	return {
		observe(event: HarnessEvent): void {
			if (event.type === "tool_call" && isReturnAction(event.toolName, event.args)) {
				Returned = true;
			}
		},
		get returned(): boolean {
			return Returned;
		},
	};
}

/**
 * AL6: Outcome of evaluating the gate at stream-exhaust.
 *   "returned"     — a return action was seen, OR the end-reason is exempt.
 *   "not_returned" — no return action seen on a normal (completed) turn.
 */
export type ReturnVerdict = "returned" | "not_returned";

/**
 * Evaluate the gate ONLY on normal completion. Crashed / stopped (aborted) /
 * budget_exhausted end-reasons are exempt (concept §3.3) — the agent was
 * prevented from finishing, not refusing to return.
 *
 * @lore AL6: `aborted` maps to `"stopped"` here. In session-provisioning.ts
 * the `aborted` flag causes a `break` into the SAME teardown path as normal
 * completion — there is NO separate `aborted` teardown branch. The caller
 * (runSession) must read the `aborted` flag at evaluation time to supply
 * `"stopped"` instead of `"completed"` so an intentional handoff-abort is
 * never spuriously flagged as `not_returned`.
 */
export function evaluateReturn(
	gate: ReturnGate,
	endReason: "completed" | "crashed" | "stopped" | "budget_exhausted",
): ReturnVerdict {
	// All non-completed end-reasons are exempt — the agent was prevented from
	// finishing, not choosing to skip the return.
	if (endReason !== "completed") return "returned";
	return gate.returned ? "returned" : "not_returned";
}
