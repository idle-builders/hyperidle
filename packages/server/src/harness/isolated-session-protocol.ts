/**
 * S2: IPC message protocol shared by IsolatedHarnessAdapter (parent) and
 * isolated-session-worker (forked child). Type-only module — safe to import
 * from the main server (unlike the worker entrypoint, which must only be
 * executed via fork()).
 *
 * @lore AF4/§4e: the worker→parent and parent→worker IPC payloads are a
 * discriminated union on `type`. Narrowing via the guards below replaces the
 * previous `msg as { event: HarnessEvent }`-style casts, which TS2352-rejected
 * because `object & Record<"type", unknown>` does not overlap the target shape.
 * The guards preserve the exact runtime dispatch the `switch`/`if` chains already
 * implement, so session isolation is unchanged.
 */

import type { HarnessEvent, SessionConfig, SessionResult } from "@hyperidle/shared";

/** Parent → worker: start a session with the given config. */
export interface StartMessage {
	readonly type: "start";
	readonly config: SessionConfig;
}

/** Parent → worker: request a graceful early stop. */
export interface StopMessage {
	readonly type: "stop";
}

/** Worker → parent: a streamed harness event. */
export interface EventMessage {
	readonly type: "event";
	readonly event: HarnessEvent;
}

/** Worker → parent: the terminal session result. */
export interface SessionResultMessage {
	readonly type: "session_result";
	readonly result: SessionResult;
}

/** Narrow an unknown IPC payload to a typed message carrying a `type` field. */
function hasType(msg: unknown): msg is { readonly type: string } {
	return typeof msg === "object" && msg !== null && "type" in msg;
}

/** Type guard: parent-bound start message. */
export function isStartMessage(msg: unknown): msg is StartMessage {
	return hasType(msg) && msg.type === "start";
}

/** Type guard: parent-bound stop message. */
export function isStopMessage(msg: unknown): msg is StopMessage {
	return hasType(msg) && msg.type === "stop";
}

/** Type guard: worker-bound streamed event message. */
export function isEventMessage(msg: unknown): msg is EventMessage {
	return hasType(msg) && msg.type === "event";
}

/** Type guard: worker-bound terminal result message. */
export function isSessionResultMessage(msg: unknown): msg is SessionResultMessage {
	return hasType(msg) && msg.type === "session_result";
}
