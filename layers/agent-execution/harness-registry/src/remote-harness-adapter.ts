/**
 * RemoteHarnessAdapter — delegates session execution to a connected worker
 * over a WebSocket using the ServerToWorkerMessage / WorkerToServerMessage wire protocol.
 */

import { randomUUID } from "node:crypto";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
	WorkerRegisterMessage,
} from "@hyperidle/harness-protocol";

/**
 * Inbound messages from a remote worker over the WS transport. All carry a
 * `sessionId` to route to the originating session.
 *
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

	// biome-ignore lint/suspicious/useAwait: this.ws.send() below can throw synchronously; async is what turns that throw into a rejected promise for callers.
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

		return (async function* (
			adapter: RemoteHarnessAdapter,
		): AsyncGenerator<HarnessEvent, void, unknown> {
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

	// biome-ignore lint/suspicious/useAwait: this.ws.send() below can throw synchronously; async is what turns that throw into a rejected promise for callers.
	async stopSession(handle: SessionHandle): Promise<SessionResult> {
		const sessionId = handle.sessionId;

		this.ws.send(JSON.stringify({ type: "stop", sessionId }));

		return new Promise<SessionResult>((resolve, reject) => {
			const existing = this.activeSessions.get(sessionId);
			if (existing) {
				const patched: ActiveSession = {
					...existing,
					resolve,
					reject,
				};
				this.activeSessions.set(sessionId, patched);
			} else {
				this.activeSessions.set(sessionId, {
					sessionId,
					resolve,
					reject,
					pushEvent: () => {
						// This path never streams intermediate events — stopSession only cares about the final result.
					},
					close: () => reject(new Error("WebSocket closed before session result")),
				});
			}
		});
	}

	getCapabilities(): HarnessCapabilities {
		// @lore: remote mcpSupport false — adapter is a local proxy; conservatively false so provisioner falls back to event-stream interception
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: this.registration.modelProviders,
			mcpSupport: false,
			returnEnforcement: "process-reengage",
		};
	}

	/**
	 * Dispatch an incoming message to the appropriate active session.
	 * Exposed as public so the WS route layer can forward messages without coupling to the internal session map.
	 * @lore: dispatchMessage — subsequent WS messages must go here; without this streamEvents() hangs because the route-layer onmessage never reaches the adapter
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
		for (const session of this.activeSessions.values()) {
			session.close();
		}
		this.activeSessions.clear();
	}
}
