/**
 * S2: RemoteHarnessAdapter — delegates session execution to a connected worker
 * over a WebSocket using the ServerToWorkerMessage / WorkerToServerMessage
 * wire protocol.
 *
 * @lore S2: Each RemoteHarnessAdapter instance wraps a single WebSocket
 * connection. The adapter is registered in AdapterPool when the worker sends
 * WorkerRegisterMessage, and unregistered when the connection closes.
 */

import { randomUUID } from "node:crypto";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";
import type { WorkerRegisterMessage } from "@hyperidle/harness-protocol";

/**
 * Inbound messages from a remote worker over the WS transport. All carry a
 * `sessionId` to route to the originating session.
 *
 * @lore AF4/§4e: narrowing on `type` replaces the previous
 * `typed as { event: HarnessEvent }`-style casts (TS2352: the source
 * `{ type: string; sessionId?: string }` does not overlap the target). The
 * guards preserve the exact runtime dispatch; remote-session routing is
 * unchanged.
 */
interface RemoteEventMessage {
	readonly type: "event";
	readonly sessionId: string;
	readonly event: HarnessEvent;
}
interface RemoteSessionResultMessage {
	readonly type: "session_result";
	readonly sessionId: string;
	readonly result: SessionResult;
}
interface RemoteErrorMessage {
	readonly type: "error";
	readonly sessionId: string;
	readonly message: string;
}
type RemoteWorkerMessage = RemoteEventMessage | RemoteSessionResultMessage | RemoteErrorMessage;

function asRemoteWorkerMessage(msg: unknown): RemoteWorkerMessage | null {
	if (typeof msg !== "object" || msg === null || !("type" in msg)) return null;
	const m = msg as { type: unknown; sessionId?: unknown };
	if (typeof m.sessionId !== "string") return null;
	if (m.type === "event" || m.type === "session_result" || m.type === "error") {
		return msg as RemoteWorkerMessage;
	}
	return null;
}

/** Minimal WebSocket interface used by RemoteHarnessAdapter (avoids ws/DOM type coupling). */
export interface WsLike {
	send(data: string): void;
	close(): void;
	onmessage: ((evt: { data: string }) => void) | null;
	onclose: (() => void) | null;
	onerror: ((err: Error) => void) | null;
}

/** Internal queue for messages arriving from the remote worker. */
interface ActiveSession {
	readonly sessionId: string;
	readonly resolve: (result: SessionResult) => void;
	readonly reject: (err: Error) => void;
	readonly pushEvent: (event: HarnessEvent) => void;
	close: () => void;
}

export class RemoteHarnessAdapter implements HarnessAdapter {
	private readonly ws: WsLike;
	private readonly registration: WorkerRegisterMessage;
	private readonly activeSessions = new Map<string, ActiveSession>();

	constructor(ws: WsLike, registration: WorkerRegisterMessage) {
		this.ws = ws;
		this.registration = registration;

		// Wire incoming messages to the active sessions map
		this.ws.onmessage = (evt) => {
			this.handleMessage(evt.data);
		};

		this.ws.onclose = () => {
			this.handleClose();
		};

		this.ws.onerror = () => {
			this.handleClose();
		};
	}

	// biome-ignore lint/suspicious/useAwait: interface HarnessAdapter requires async signature
	async startSession(config: SessionConfig): Promise<SessionHandle> {
		const sessionId = randomUUID();

		this.ws.send(
			JSON.stringify({
				type: "dispatch",
				sessionId,
				config,
			}),
		);

		return { sessionId };
	}

	streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent> {
		const sessionId = handle.sessionId;

		// biome-ignore lint/suspicious/useAwait: async generator requires async keyword
		return (async function* (
			adapter: RemoteHarnessAdapter,
		): AsyncGenerator<HarnessEvent, void, unknown> {
			// Build a queue so incoming WS messages can be pushed to the generator
			const queue: Array<HarnessEvent | null> = []; // null = done sentinel
			let resolve: (() => void) | null = null;

			function waitForMore(): Promise<void> {
				return new Promise<void>((r) => {
					resolve = r;
				});
			}

			function notify(): void {
				const r = resolve;
				resolve = null;
				r?.();
			}

			const session: ActiveSession = {
				sessionId,
				resolve: () => {
					queue.push(null); // result signals done
					notify();
				},
				reject: (err: Error) => {
					queue.push({ type: "error", message: err.message, code: "RemoteError" });
					queue.push(null);
					notify();
				},
				pushEvent: (event: HarnessEvent) => {
					queue.push(event);
					notify();
				},
				close: () => {
					queue.push(null);
					notify();
				},
			};

			adapter.activeSessions.set(sessionId, session);

			try {
				while (true) {
					if (queue.length === 0) {
						await waitForMore();
					}
					const item = queue.shift();
					if (item === undefined) continue;
					if (item === null) break;
					yield item;
				}
			} finally {
				adapter.activeSessions.delete(sessionId);
			}
		})(this);
	}

	async stopSession(handle: SessionHandle): Promise<SessionResult> {
		const sessionId = handle.sessionId;

		this.ws.send(JSON.stringify({ type: "stop", sessionId }));

		// Wait for the worker to send session_result
		return new Promise<SessionResult>((resolve, reject) => {
			// If session already active (via streamEvents), patch its resolve
			const existing = this.activeSessions.get(sessionId);
			if (existing) {
				// Replace the resolve/reject so stopSession's promise gets the result
				const patched: ActiveSession = {
					...existing,
					resolve,
					reject,
				};
				this.activeSessions.set(sessionId, patched);
			} else {
				// Create a minimal session entry just to capture the result
				this.activeSessions.set(sessionId, {
					sessionId,
					resolve,
					reject,
					pushEvent: () => {},
					close: () => reject(new Error("WebSocket closed before session result")),
				});
			}
		});
	}

	getCapabilities(): HarnessCapabilities {
		// X5: mcpSupport: false — remote workers declare their own MCP capabilities
		// via the worker protocol; this adapter is a local proxy and conservatively
		// declares false so the provisioner falls back to event-stream interception.
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: this.registration.modelProviders,
			mcpSupport: false,
			// Remote has no in-process hook. HyperIdle can re-engage by
			// re-dispatching the provisioning config over the WS connection (process-wrapper
			// re-engage pattern). Non-conforming workers degrade to not_returned after budget.
			// @lore "process-reengage" for remote — HyperIdle re-dispatches
			// provisioning over WS when the session ends without return. Same semantics as
			// the opencode re-spawn, but via WS protocol instead of spawn().
			returnEnforcement: "process-reengage",
		};
	}

	/**
	 * Dispatch an incoming message from the worker to the appropriate active session.
	 *
	 * Called by WorkerConnectionManager for runtime messages (event, session_result, error)
	 * that arrive after registration. Exposed as public so the WS route layer can forward
	 * messages to the adapter without coupling to its internal session map.
	 *
	 * @lore S2-F07: WorkerConnectionManager routes the initial `register` message itself
	 * (to create this adapter). All subsequent messages must be dispatched here so
	 * streamEvents() generators receive them. Without this, streamEvents() hangs forever
	 * because the WS onmessage handler in the route layer never reached the adapter.
	 */
	dispatchMessage(data: string): void {
		this.handleMessage(data);
	}

	private handleMessage(data: string): void {
		let msg: unknown;
		try {
			msg = JSON.parse(data);
		} catch {
			return;
		}

		const parsed = asRemoteWorkerMessage(msg);
		if (!parsed) return;

		const session = this.activeSessions.get(parsed.sessionId);
		if (!session) return;

		if (parsed.type === "event") {
			session.pushEvent(parsed.event);
		} else if (parsed.type === "session_result") {
			session.resolve(parsed.result);
		} else {
			session.pushEvent({ type: "error", message: parsed.message, code: "WorkerError" });
			session.resolve({
				outcome: "crashed",
				tokenUsage: { byTier: {} },
			});
		}
	}

	private handleClose(): void {
		// Terminate all active sessions
		for (const session of this.activeSessions.values()) {
			session.close();
		}
		this.activeSessions.clear();
	}
}
