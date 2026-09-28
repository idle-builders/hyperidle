/**
 * RemoteWorkerClient — manages the desktop worker WebSocket connection.
 * @lore: no auto-reconnect; if WS drops, status = disconnected; user must toggle off and on to reconnect
 * @lore: CliHarnessAdapter instantiated once, reused across concurrent sessions (session ID tracked in a Map)
 */

import type {
	HarnessAdapter,
	ServerDispatchMessage,
	ServerStopMessage,
	ServerToWorkerMessage,
	SessionHandle,
	WorkerErrorMessage,
	WorkerEventMessage,
	WorkerSessionResultMessage,
} from "@hyperidle/harness-protocol";

export interface RemoteWorkerClientOptions {
	serverUrl: string;
	credentialsPath: string;
	authKey: string; // shared_backend_key, used as X-API-Key for worker-token endpoint
	deviceId: string;
	machineName: string;
	modelProviders: string[];
	maxConcurrent: number;
	/**
	 * How long disconnect() waits for active sessions to complete before force-stopping them.
	 * Defaults to 60_000ms (60s) in production. Injectable for tests.
	 *
	 * @lore: disconnectTimeoutMs injectable — 60s real-time wait is not acceptable in unit tests
	 */
	disconnectTimeoutMs?: number;
}

/**
 * Worker status snapshot — mirrors WorkerStatus in layers/core-ui/src/window.d.ts.
 * Defined here (not imported from web) to avoid a cross-package dependency.
 * Keep in sync with web's WorkerStatus interface.
 */
export interface WorkerStatus {
	enabled: boolean;
	connected: boolean;
	paused: boolean;
	activeSessions: number;
	maxConcurrent: number;
	deviceId: string | null;
	modelProviders: string[];
}

/**
 * RemoteWorkerClient manages the lifecycle of the desktop worker.
 *
 * The second constructor parameter accepts typeof WebSocket for production
 * or a vi.fn() mock for tests. The mock must return a WebSocket-compatible
 * object when called (either via `new` or as a regular function).
 *
 * @lore: wsConstructor — stored and called with `new`; vi.fn().mockImplementation(() => mockInstance) works (vitest supports `new` when impl returns an object)
 */
export class RemoteWorkerClient {
	private readonly options: RemoteWorkerClientOptions;
	private readonly wsConstructor: new (
		url: string,
		// biome-ignore lint/suspicious/noExplicitAny: supports both real WebSocket constructor and vi.fn() mocks
	) => any;
	private readonly adapter: HarnessAdapter | null;

	private ws: WebSocket | null = null;
	private connected = false;
	private paused = false;
	private activeSessions = 0;
	/** Track active session handles so disconnect() can stop them on timeout. */
	private readonly sessionHandles = new Map<string, SessionHandle>();
	private readonly listeners = new Set<(status: WorkerStatus) => void>();

	constructor(
		options: RemoteWorkerClientOptions,
		wsConstructorOverride?: typeof WebSocket,
		adapter?: HarnessAdapter,
	) {
		this.options = options;
		// Use provided WebSocket constructor or the global one. `typeof WebSocket`
		// is assignable to the stored `new (url: string) => any` construct signature
		// (extra optional ctor params + WebSocket→any return), so no cast is needed.
		this.wsConstructor = wsConstructorOverride ?? WebSocket;
		this.adapter = adapter ?? null;
	}

	/**
	 * Connect to the server:
	 * 1. POST /api/auth/worker-token to get the worker token.
	 * 2. Open WebSocket to /api/ws/worker?token=<workerToken>.
	 * 3. Send WorkerRegisterMessage on open.
	 * 4. Wait for "registered" ack.
	 *
	 * Rejects if the token endpoint fails or WS fails to connect.
	 */
	async connect(): Promise<void> {
		const { serverUrl, authKey, deviceId, machineName, modelProviders, maxConcurrent } =
			this.options;

		const tokenRes = await fetch(`${serverUrl}/api/auth/worker-token`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": authKey,
			},
		});

		if (!tokenRes.ok) {
			throw new Error(
				`Worker token endpoint returned ${tokenRes.status}: ${JSON.stringify(await tokenRes.json())}`,
			);
		}

		const tokenBody = (await tokenRes.json()) as { token: string };
		const workerToken = tokenBody.token;

		const wsUrl =
			serverUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://") +
			`/api/ws/worker?token=${encodeURIComponent(workerToken)}`;

		return new Promise<void>((resolve, reject) => {
			const ws = new this.wsConstructor(wsUrl);
			this.ws = ws;

			ws.onopen = (): void => {
				ws.send(
					JSON.stringify({
						type: "register",
						id: deviceId,
						name: machineName,
						modelProviders,
						maxConcurrent,
					}),
				);
			};

			ws.onmessage = (event: MessageEvent): void => {
				const data = typeof event.data === "string" ? event.data : String(event.data);
				let msg: unknown;
				try {
					msg = JSON.parse(data);
				} catch {
					return;
				}

				const typed = msg as ServerToWorkerMessage;

				if (typed.type === "registered") {
					this.connected = true;
					this.notifyListeners();
					resolve();
					return;
				}

				if (!this.adapter) return;

				if (typed.type === "dispatch") {
					void this.handleDispatch(typed as ServerDispatchMessage);
				} else if (typed.type === "stop") {
					void this.handleStop(typed as ServerStopMessage);
				}
			};

			ws.onerror = (err: unknown): void => {
				if (!this.connected) {
					reject(err instanceof Error ? err : new Error("WebSocket connection failed"));
				}
			};

			ws.onclose = (): void => {
				if (!this.connected) {
					reject(new Error("WebSocket closed before registration was acknowledged"));
					return;
				}
				this.connected = false;
				this.ws = null;
				this.notifyListeners();
			};
		});
	}

	/**
	 * Handle a dispatch message from the server:
	 * 1. Start the session via the adapter.
	 * 2. Stream all events back as WorkerEventMessage.
	 * 3. On completion, send WorkerSessionResultMessage.
	 * 4. Decrement activeSessions.
	 */
	private async handleDispatch(msg: ServerDispatchMessage): Promise<void> {
		if (!this.adapter) return;
		const { sessionId, config } = msg;

		this.activeSessions++;
		this.notifyListeners();

		try {
			const handle = await this.adapter.startSession(config);
			this.sessionHandles.set(sessionId, handle);

			// @lore: return-relay — forwarding loop only; must NOT wire a ReturnGate; turn is gated once at the remote adapter's enforced drain
			for await (const event of this.adapter.streamEvents(handle)) {
				const eventMsg: WorkerEventMessage = { type: "event", sessionId, event };
				this.ws?.send(JSON.stringify(eventMsg));
			}

			const result = await this.adapter.stopSession(handle);
			this.sessionHandles.delete(sessionId);

			const resultMsg: WorkerSessionResultMessage = {
				type: "session_result",
				sessionId,
				result,
			};
			this.ws?.send(JSON.stringify(resultMsg));
		} catch (err: unknown) {
			this.sessionHandles.delete(sessionId);
			const errorMsg: WorkerErrorMessage = {
				type: "error",
				sessionId,
				message: err instanceof Error ? err.message : String(err),
			};
			this.ws?.send(JSON.stringify(errorMsg));
		} finally {
			this.activeSessions = Math.max(0, this.activeSessions - 1);
			this.notifyListeners();
		}
	}

	/**
	 * Handle a stop message from the server:
	 * Stop the running session and send back the result.
	 */
	private async handleStop(msg: ServerStopMessage): Promise<void> {
		if (!this.adapter) return;
		const { sessionId } = msg;
		const handle = this.sessionHandles.get(sessionId);
		if (!handle) return;

		try {
			const result = await this.adapter.stopSession(handle);
			this.sessionHandles.delete(sessionId);
			const resultMsg: WorkerSessionResultMessage = {
				type: "session_result",
				sessionId,
				result,
			};
			this.ws?.send(JSON.stringify(resultMsg));
		} catch (err: unknown) {
			this.sessionHandles.delete(sessionId);
			const errorMsg: WorkerErrorMessage = {
				type: "error",
				sessionId,
				message: err instanceof Error ? err.message : String(err),
			};
			this.ws?.send(JSON.stringify(errorMsg));
		} finally {
			this.activeSessions = Math.max(0, this.activeSessions - 1);
			this.notifyListeners();
		}
	}

	/**
	 * Gracefully disconnect:
	 * 1. Stop accepting new work.
	 * 2. Wait up to 60s for active sessions to complete.
	 * 3. If sessions still running after timeout, force-stop them.
	 * 4. Close WebSocket.
	 */
	async disconnect(): Promise<void> {
		if (!this.ws) {
			return;
		}

		if (this.activeSessions === 0) {
			this.ws.close();
			this.connected = false;
			this.ws = null;
			this.notifyListeners();
			return;
		}

		const timeoutMs = this.options.disconnectTimeoutMs ?? 60_000;
		const deadline = Date.now() + timeoutMs;
		while (this.activeSessions > 0 && Date.now() < deadline) {
			await new Promise<void>((res) => setTimeout(res, 100));
		}

		if (this.activeSessions > 0 && this.adapter) {
			const stopPromises: Promise<void>[] = [];
			for (const [sessionId, handle] of this.sessionHandles) {
				stopPromises.push(
					this.adapter.stopSession(handle).then(() => {
						this.sessionHandles.delete(sessionId);
					}),
				);
			}
			await Promise.allSettled(stopPromises);
			this.activeSessions = 0;
		}

		if (this.ws) {
			this.ws.close();
			this.connected = false;
			this.ws = null;
		}
		this.notifyListeners();
	}

	/** Send pause message to server — server marks this worker as paused in the pool. */
	pause(): void {
		this.paused = true;
		this.ws?.send(JSON.stringify({ type: "pause" }));
		this.notifyListeners();
	}

	/** Send resume message to server — server clears paused flag. */
	resume(): void {
		this.paused = false;
		this.ws?.send(JSON.stringify({ type: "resume" }));
		this.notifyListeners();
	}

	/** Snapshot of current worker status. */
	getStatus(): WorkerStatus {
		return {
			enabled: this.connected,
			connected: this.connected,
			paused: this.paused,
			activeSessions: this.activeSessions,
			maxConcurrent: this.options.maxConcurrent,
			deviceId: this.options.deviceId,
			modelProviders: this.options.modelProviders,
		};
	}

	/**
	 * Subscribe to status changes. Returns an unsubscribe function.
	 */
	onStatusChange(callback: (status: WorkerStatus) => void): () => void {
		this.listeners.add(callback);
		return () => {
			this.listeners.delete(callback);
		};
	}

	private notifyListeners(): void {
		const status = this.getStatus();
		for (const listener of this.listeners) {
			listener(status);
		}
	}
}
