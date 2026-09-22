/**
 * @lore AU19 Increment 3b: moved here unchanged from
 * `packages/server/src/services/session-run-registry.ts` — architecture §4's
 * roster explicitly lists this as one of `session-requests`' seed files.
 * Dependency-free (framework types only), so the move is a pure
 * relocation with zero port conversion. Every real consumer
 * (`session-provisioning.ts`, `routes/sessions-routes.ts`,
 * `policy-bindings.ts`) repoints its import to `@hyperidle/session-requests`.
 */

/**
 * AF7 §4/§5 — SessionRunRegistry.
 *
 * A process-singleton leaf module that tracks the live runtime entry for each
 * actively-running session so two collaborators can
 * cooperatively abort it WITHOUT importing each other:
 *   - the provisioning runtime (`runSession`) registers itself at harness-start
 *     and deregisters at teardown;
 *   - `PATCH /api/sessions/:id` (§4) and the handoff protocol (§5) call
 *     `abort(sessionId)` to request that the running harness stop.
 *
 * Abort is the PRIMARY revocation path. For the builtin harness it calls
 * `adapter.stopSession(handle)`, which sets the builtin session's internal
 * `aborted` flag and awaits its loop — halting `runLoop`/`executeToolCalls`
 * where builtin tools actually run (builtin executes tools internally, not via
 * the provisioning event loop, so a loop-break alone would NOT stop it). For
 * subprocess/remote adapters `stopSession` terminates the child / sends stop.
 * The provisioning event-loop break is SECONDARY (non-builtin `registry.invoke`).
 *
 * @lore AF7 §5: this MUST be a dependency-free leaf singleton so both the route
 * layer and the orchestrator share one instance without a circular import. Do
 * not import from the server barrel or from session-provisioning here.
 *
 * @lore AF7 §5: `abort` is the real tool-revocation. A builder who wires only
 * the provisioning loop-break flag and trusts "no further registry.invoke"
 * ships an abort that does NOTHING for builtin (builtin tools run inside its own
 * loop). The stopSession call below is load-bearing.
 */

import type { HarnessAdapter, SessionHandle } from "@hyperidle/harness-protocol";

/**
 * Why a runtime is being aborted: `"stop"` is a genuine ask — `stop_session`
 * or a task-kill cascade — the only reason a stopped session's row may read
 * "stopped". `"return"` is an adapter reporting its own turn is over (an
 * opencode session's own return tool call schedules this as a defensive
 * real-kill in case the process is still running); the harness ending its
 * own turn is not the same event as someone asking it to stop, so it must
 * never write "stopped" over a clean finish.
 */
export type SessionAbortReason = "stop" | "return";

/** One live session's abort affordances. */
interface SessionRunEntry {
	/**
	 * Secondary cooperative flag: flips a per-session boolean the provisioning
	 * event loop checks each iteration (matters only for non-builtin adapters,
	 * whose tools route through `registry.invoke`). Takes the same `reason`
	 * `abort` below receives, unchanged, so the provisioning runtime can tell
	 * a real stop apart from its own adapter's return.
	 */
	readonly signalAbort: (reason: SessionAbortReason) => void;
	readonly handle: SessionHandle;
	readonly adapter: HarnessAdapter;
}

const entries = new Map<string, SessionRunEntry>();

/** Register a live session's runtime entry. Replaces any prior entry. */
function register(sessionId: string, entry: SessionRunEntry): void {
	entries.set(sessionId, entry);
}

/** Remove a session's runtime entry (called at teardown). No-op if absent. */
function deregister(sessionId: string): void {
	entries.delete(sessionId);
}

/** Whether a live runtime entry exists for this session. */
function has(sessionId: string): boolean {
	return entries.has(sessionId);
}

/**
 * Abort a running session. Returns true if a runtime entry existed (the abort
 * was dispatched), false if there was no live entry (caller falls back to a
 * guarded direct write — see §4 PATCH).
 *
 * `reason` decides which caller this is — a real stop, or an adapter's own
 * defensive kill after it reported its turn over — and rides straight
 * through to `signalAbort` unchanged; this function never interprets it
 * itself. Primary: `adapter.stopSession(handle)` — halts the harness
 * (builtin's internal loop, subprocess child, or remote stop), unconditional
 * on `reason` because a live process gets killed either way. Secondary: flip
 * the provisioning loop's cooperative flag via `signalAbort`. The DB
 * terminal transition + `session_ended` emit are driven by the runtime
 * teardown (endSession/crashSession), NOT here — the registry only requests
 * the stop, it never writes terminal state.
 */
async function abort(sessionId: string, reason: SessionAbortReason): Promise<boolean> {
	const entry = entries.get(sessionId);
	if (!entry) return false;

	// Secondary: tell the provisioning event loop to stop (non-builtin invokes).
	entry.signalAbort(reason);

	// Primary: stop the harness. For builtin this sets its internal `aborted`
	// flag and awaits the loop, halting tool execution. stopSession is the real
	// revocation — do not remove it in favour of the loop flag alone.
	await entry.adapter.stopSession(entry.handle);
	return true;
}

export const sessionRunRegistry = {
	register,
	deregister,
	has,
	abort,
};
