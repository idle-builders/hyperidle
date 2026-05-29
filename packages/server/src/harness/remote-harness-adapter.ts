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
	WorkerRegisterMessage,
} from "@hyperidle/shared";

// Re-export so tests can import WorkerRegisterMessage from this module
export type { WorkerRegisterMessage };

/** Minimal WebSocket interface used by RemoteHarnessAdapter (avoids ws/DOM type coupling). */
interface WsLike {
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
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: this.registration.modelProviders,
		};
	}

	private handleMessage(data: string): void {
		let msg: unknown;
		try {
			msg = JSON.parse(data);
		} catch {
			return;
		}

		if (typeof msg !== "object" || msg === null || !("type" in msg)) return;

		const typed = msg as { type: string; sessionId?: string };
		const sessionId = typed.sessionId;
		if (!sessionId) return;

		const session = this.activeSessions.get(sessionId);
		if (!session) return;

		if (typed.type === "event") {
			const withEvent = typed as { event: HarnessEvent };
			session.pushEvent(withEvent.event);
		} else if (typed.type === "session_result") {
			const withResult = typed as { result: SessionResult };
			session.resolve(withResult.result);
		} else if (typed.type === "error") {
			const withMsg = typed as { message: string };
			session.pushEvent({ type: "error", message: withMsg.message, code: "WorkerError" });
			session.resolve({
				outcome: "crashed",
				cost: { minor: 0, currency: "USD" },
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
