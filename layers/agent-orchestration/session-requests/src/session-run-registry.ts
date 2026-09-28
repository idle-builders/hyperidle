// @lore: abort — stopSession call is load-bearing; loop-flag alone does nothing for builtin adapters (tools run in their own loop)

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
 * was dispatched), false if there was no live entry (caller falls back to a guarded direct write).
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
