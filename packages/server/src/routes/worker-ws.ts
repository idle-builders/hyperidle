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
import { z } from "zod";
import type { AdapterPool } from "../harness/adapter-pool.js";
import { RemoteHarnessAdapter } from "../harness/remote-harness-adapter.js";
import { constantTimeStringEqual } from "../middleware/timing-safe.js";

// ── Zod schemas for worker protocol messages ──────────────────────────────────

/**
 * @lore S2-F05: Worker WebSocket messages must be Zod-validated before processing
 * to prevent type-unsafe `as` casts from letting malformed messages through.
 * Validation rejects malformed messages early rather than propagating bad data
 * into session routing logic.
 */
const WorkerRegisterSchema = z.object({
	type: z.literal("register"),
	id: z.string().min(1),
	name: z.string().min(1),
	modelProviders: z.array(z.string()),
	maxConcurrent: z.number().int().positive(),
});

const WorkerEventSchema = z.object({
	type: z.literal("event"),
	sessionId: z.string().min(1),
	event: z.unknown(),
});

const WorkerSessionResultSchema = z.object({
	type: z.literal("session_result"),
	sessionId: z.string().min(1),
	result: z.unknown(),
});

const WorkerErrorSchema = z.object({
	type: z.literal("error"),
	sessionId: z.string().min(1),
	message: z.string(),
});

/** S4: pause/resume protocol messages */
const WorkerPauseSchema = z.object({ type: z.literal("pause") });
const WorkerResumeSchema = z.object({ type: z.literal("resume") });

const WorkerToServerMessageSchema = z.discriminatedUnion("type", [
	WorkerRegisterSchema,
	WorkerEventSchema,
	WorkerSessionResultSchema,
	WorkerErrorSchema,
	WorkerPauseSchema,
	WorkerResumeSchema,
]);

/**
 * Manages the lifecycle of a single worker WebSocket connection.
 * Exported so tests can exercise the message-handling logic without
 * spinning up a real WebSocket server.
 */
export class WorkerConnectionManager {
	private readonly pool: AdapterPool;
	private workerId: string | null = null;
	/** Set after registration — routes runtime messages to the adapter. */
	private adapter: RemoteHarnessAdapter | null = null;

	constructor(pool: AdapterPool) {
		this.pool = pool;
	}

	/**
	 * Handle an incoming message from the worker.
	 * The ws parameter must support send(data: string).
	 *
	 * Before registration: only `register` messages are processed.
	 * After registration: runtime messages (event, session_result, error)
	 * are dispatched directly to the RemoteHarnessAdapter.
	 *
	 * @lore S2-F07: Without this post-registration routing, runtime messages
	 * arriving via the Hono WS onMessage handler would be passed back to
	 * manager.onMessage() which previously ignored them — causing streamEvents()
	 * to hang forever as no session queue would ever receive data.
	 */
	onMessage(data: string, ws: { send(data: string): void }): void {
		let raw: unknown;
		try {
			raw = JSON.parse(data);
		} catch {
			return;
		}

		// Zod-validate before processing — rejects malformed messages
		const parsed = WorkerToServerMessageSchema.safeParse(raw);
		if (!parsed.success) {
			return;
		}

		const msg = parsed.data;

		if (msg.type === "register") {
			this.workerId = msg.id;

			// Create adapter; it owns the session routing map.
			// Pass ws as the WsLike interface — RemoteHarnessAdapter.dispatchMessage
			// is called below for post-registration messages so we do not rely on
			// ws.onmessage assignment (which WSContext may not support).
			this.adapter = new RemoteHarnessAdapter(ws as never, msg);
			this.pool.register(msg.id, this.adapter, {
				name: msg.name,
				kind: "remote",
				modelProviders: msg.modelProviders,
				maxConcurrent: msg.maxConcurrent,
			});

			// Acknowledge registration
			ws.send(JSON.stringify({ type: "registered" }));
		} else if (this.adapter !== null) {
			// S4: handle pause/resume messages — update pool state, don't dispatch
			if (msg.type === "pause" && this.workerId) {
				this.pool.pause(this.workerId);
			} else if (msg.type === "resume" && this.workerId) {
				this.pool.resume(this.workerId);
			} else if (msg.type !== "pause" && msg.type !== "resume") {
				// Route runtime messages (event, session_result, error) to the adapter.
				// Re-serialize the validated message so the adapter's handleMessage
				// parser receives clean JSON.
				this.adapter.dispatchMessage(JSON.stringify(msg));
			}
		}
	}

	/** Called when the WebSocket connection closes. */
	onClose(): void {
		if (this.workerId) {
			this.pool.unregister(this.workerId);
			this.workerId = null;
		}
		this.adapter = null;
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
