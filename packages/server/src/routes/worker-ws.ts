/**
 * S2: Worker WebSocket route — handles remote worker connections.
 *
 * Workers connect via GET /ws/worker?token=<HYPERIDLE_WORKER_TOKEN>.
 * On connection, the worker sends WorkerRegisterMessage to identify itself.
 * The server registers a RemoteHarnessAdapter in AdapterPool and sends
 * ServerRegisteredMessage as acknowledgment.
 * On close, the adapter is unregistered.
 */

import type { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";
import type { AdapterPool } from "../harness/adapter-pool.js";
import type { WorkerRegisterMessage } from "../harness/remote-harness-adapter.js";
import { RemoteHarnessAdapter } from "../harness/remote-harness-adapter.js";
import { constantTimeStringEqual } from "../middleware/timing-safe.js";

/**
 * Manages the lifecycle of a single worker WebSocket connection.
 * Exported so tests can exercise the message-handling logic without
 * spinning up a real WebSocket server.
 */
export class WorkerConnectionManager {
	private readonly pool: AdapterPool;
	private workerId: string | null = null;

	constructor(pool: AdapterPool) {
		this.pool = pool;
	}

	/**
	 * Handle an incoming message from the worker.
	 * The ws parameter must support send(data: string).
	 */
	onMessage(data: string, ws: { send(data: string): void }): void {
		let msg: unknown;
		try {
			msg = JSON.parse(data);
		} catch {
			return;
		}

		if (typeof msg !== "object" || msg === null || !("type" in msg)) return;
		const typed = msg as { type: string };

		if (typed.type === "register") {
			const regMsg = msg as WorkerRegisterMessage;
			this.workerId = regMsg.id;

			// Create a WSContext-compatible adapter for RemoteHarnessAdapter
			// The ws object passed here is the actual WSContext
			const adapter = new RemoteHarnessAdapter(ws as never, regMsg);
			this.pool.register(regMsg.id, adapter, {
				name: regMsg.name,
				kind: "remote",
				modelProviders: regMsg.modelProviders,
				maxConcurrent: regMsg.maxConcurrent,
			});

			// Acknowledge registration
			ws.send(JSON.stringify({ type: "registered" }));
		}
	}

	/** Called when the WebSocket connection closes. */
	onClose(): void {
		if (this.workerId) {
			this.pool.unregister(this.workerId);
			this.workerId = null;
		}
	}
}

/**
 * Register the /ws/worker WebSocket route on the Hono app.
 *
 * Auth: workers authenticate via ?token query param checked against
 * HYPERIDLE_WORKER_TOKEN env var. Invalid or missing tokens receive 401.
 *
 * Returns a disposer function (noop — pool cleanup happens on WS close).
 */
export function registerWorkerWsRoute(
	app: Hono,
	pool: AdapterPool,
	upgradeWebSocket: UpgradeWebSocket,
): () => void {
	// Auth middleware: validate worker token before upgrade
	app.use("/ws/worker", async (c, next) => {
		const expectedToken = process.env.HYPERIDLE_WORKER_TOKEN;
		const providedToken = c.req.query("token");

		if (
			!(expectedToken && providedToken && constantTimeStringEqual(providedToken, expectedToken))
		) {
			return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
		}

		await next();
	});

	app.get(
		"/ws/worker",
		upgradeWebSocket(() => {
			const manager = new WorkerConnectionManager(pool);

			return {
				onMessage(event: MessageEvent, ws: WSContext): void {
					const data = typeof event.data === "string" ? event.data : String(event.data);
					manager.onMessage(data, ws);
				},
				onClose(): void {
					manager.onClose();
				},
			};
		}),
	);

	return () => {
		// No-op: pool cleanup happens via onClose callbacks
	};
}
