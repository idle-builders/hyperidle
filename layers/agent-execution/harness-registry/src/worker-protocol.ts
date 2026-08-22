/**
 * S2: Wire protocol types for server ↔ worker communication.
 *
 * WorkerToServerMessage — sent from remote worker to server.
 * ServerToWorkerMessage — sent from server to remote worker.
 *
 * Both are discriminated unions keyed on `type`.
 */

import type { HarnessEvent, SessionConfig, SessionResult } from "@hyperidle/harness-protocol";

// ── Worker → Server ───────────────────────────────────────────────────────────

export interface WorkerRegisterMessage {
	readonly type: "register";
	/** Stable worker identity (used as pool key). */
	readonly id: string;
	/** Human-readable name (e.g. "macbook-pro"). */
	readonly name: string;
	/** Model providers this worker can run (e.g. ["anthropic"]). */
	readonly modelProviders: readonly string[];
	/** Maximum concurrent sessions. */
	readonly maxConcurrent: number;
	/** X3: Harness type (e.g. "claude-code", "aider"). Optional for backward compat. */
	readonly harnessType?: string;
}

export interface WorkerEventMessage {
	readonly type: "event";
	readonly sessionId: string;
	readonly event: HarnessEvent;
}

export interface WorkerSessionResultMessage {
	readonly type: "session_result";
	readonly sessionId: string;
	readonly result: SessionResult;
}

export interface WorkerErrorMessage {
	readonly type: "error";
	readonly sessionId: string;
	readonly message: string;
}

/**
 * S4: Worker sends this to signal it is pausing — the server marks it as
 * paused in the pool so select() skips it until resume.
 */
export interface WorkerPauseMessage {
	readonly type: "pause";
}

/**
 * S4: Worker sends this to signal it is resuming — the server clears the
 * paused flag so select() considers it again.
 */
export interface WorkerResumeMessage {
	readonly type: "resume";
}

export type WorkerToServerMessage =
	| WorkerRegisterMessage
	| WorkerEventMessage
	| WorkerSessionResultMessage
	| WorkerErrorMessage
	| WorkerPauseMessage
	| WorkerResumeMessage;

// ── Server → Worker ───────────────────────────────────────────────────────────

export interface ServerDispatchMessage {
	readonly type: "dispatch";
	readonly sessionId: string;
	readonly config: SessionConfig;
}

export interface ServerStopMessage {
	readonly type: "stop";
	readonly sessionId: string;
}

/**
 * Sent by the server to acknowledge a WorkerRegisterMessage.
 *
 * @lore S2 reviewer warning: this message was missing from the original union
 * draft. The worker blocks after sending register until it receives "registered"
 * so that it knows the pool entry is live before accepting sessions.
 */
export interface ServerRegisteredMessage {
	readonly type: "registered";
}

export type ServerToWorkerMessage =
	| ServerDispatchMessage
	| ServerStopMessage
	| ServerRegisteredMessage;
