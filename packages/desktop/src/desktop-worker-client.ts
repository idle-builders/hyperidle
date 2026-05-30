/**
 * S4: DesktopWorkerClient — manages the desktop worker WebSocket connection.
 *
 * Lifecycle:
 * 1. connect(): POST /api/auth/worker-token → get worker token
 * 2. Open WebSocket to /api/ws/worker?token=<token>
 * 3. Send WorkerRegisterMessage on open
 * 4. Wait for "registered" ack → status = connected
 * 5. Handle dispatch/stop messages from server
 * 6. Stream events back as WorkerEventMessage
 * 7. disconnect(): graceful shutdown (wait up to 60s for active sessions)
 *
 * @lore S4: No auto-reconnect in scope. If WS drops, status changes to
 * "disconnected". User must toggle off and on to reconnect.
 *
 * @lore S4 Decision 2: ClaudeAgentSdkAdapter is instantiated once and reused
 * across concurrent sessions — the adapter tracks sessions by ID in a Map and
 * is concurrent-safe.
 */

export interface DesktopWorkerClientOptions {
	serverUrl: string;
	credentialsPath: string;
	authKey: string; // shared_backend_key, used as X-API-Key for worker-token endpoint
	deviceId: string;
	machineName: string;
	modelProviders: string[];
	maxConcurrent: number;
}

/**
 * Worker status snapshot — mirrors WorkerStatus in packages/web/src/window.d.ts.
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
 * DesktopWorkerClient manages the lifecycle of the desktop worker.
 *
 * The second constructor parameter accepts typeof WebSocket for production
 * or a vi.fn() mock for tests. The mock must return a WebSocket-compatible
 * object when called (either via `new` or as a regular function).
 *
 * @lore S4: The wsConstructor is stored and called with `new` in production.
 * In tests, vi.fn().mockImplementation(() => mockInstance) is passed — vitest
 * mocks support `new` calls when the implementation returns an object.
 */
export class DesktopWorkerClient {
	private readonly options: DesktopWorkerClientOptions;
	private readonly wsConstructor: new (
		url: string,
		// biome-ignore lint/suspicious/noExplicitAny: supports both real WebSocket constructor and vi.fn() mocks
	) => any;

	private ws: WebSocket | null = null;
	private connected = false;
	private paused = false;
	private activeSessions = 0;
	private readonly listeners = new Set<(status: WorkerStatus) => void>();

	constructor(options: DesktopWorkerClientOptions, wsConstructorOverride?: typeof WebSocket) {
		this.options = options;
		// Use provided WebSocket constructor or the global one
		this.wsConstructor = (wsConstructorOverride ?? WebSocket) as unknown as new (
			url: string,
			// biome-ignore lint/suspicious/noExplicitAny: cast for vi.fn() mock compatibility
		) => any;
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

		// Step 1: get worker token
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

		// Step 2: open WebSocket
		// Convert http:// → ws:// and https:// → wss://
		const wsUrl =
			serverUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://") +
			`/api/ws/worker?token=${encodeURIComponent(workerToken)}`;

		return new Promise<void>((resolve, reject) => {
			const ws = new this.wsConstructor(wsUrl);
			this.ws = ws;

			ws.onopen = (): void => {
				// Step 3: send register message
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

				const typed = msg as { type: string };

				if (typed.type === "registered") {
					// Step 4: registration acknowledged
					this.connected = true;
					this.notifyListeners();
					resolve();
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
	 * Gracefully disconnect:
	 * 1. Stop accepting new work.
	 * 2. Wait up to 60s for active sessions to complete.
	 * 3. Close WebSocket.
	 */
	async disconnect(): Promise<void> {
		if (!this.ws) {
			return;
		}

		// If no active sessions, close immediately
		if (this.activeSessions === 0) {
			this.ws.close();
			this.connected = false;
			this.ws = null;
			this.notifyListeners();
			return;
		}

		// Wait up to 60s for active sessions to complete
		const deadline = Date.now() + 60_000;
		while (this.activeSessions > 0 && Date.now() < deadline) {
			await new Promise<void>((res) => setTimeout(res, 100));
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
