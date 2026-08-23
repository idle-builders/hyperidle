/** Consolidated private remote-worker ingress. */
/**
 * @lore AU26 B1a: the local `constantTimeStringEqual` this file used to declare
 * existed only because `run-orchestration` could not import core-api's copy.
 * A1 removed that reason — the primitive now lives in `@hyperidle/domain-model`,
 * which both apps may import — so the second hand-rolled copy is deleted, not
 * kept in sync.
 */

import { constantTimeStringEqual } from "@hyperidle/domain-model";
import type { HarnessAdapter } from "@hyperidle/harness-protocol";
import type { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";
import { z } from "zod";

interface RunOrchestrationRemoteWorkerAdapter {
	dispatchMessage(data: string): void;
}
interface RunOrchestrationAdapterPool {
	has(id: string): boolean;
	register(
		id: string,
		adapter: HarnessAdapter & RunOrchestrationRemoteWorkerAdapter,
		meta: {
			name: string;
			kind: "remote";
			type?: string;
			modelProviders: readonly string[];
			maxConcurrent: number;
		},
	): void;
	unregister(id: string): void;
	pause(id: string): void;
	resume(id: string): void;
}
interface RunOrchestrationRemoteHarnessAdapterFactory {
	create(
		ws: unknown,
		registration: { readonly id: string; readonly [key: string]: unknown },
	): HarnessAdapter & RunOrchestrationRemoteWorkerAdapter;
}

// ---- worker ingress ----

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
	harnessType: z.string().optional(),
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
 * Module-level registry of live worker sockets, keyed by worker id.
 * Used to probe incumbent liveness before accepting a duplicate-id register.
 *
 * @lore AF11 Hole 3: AdapterPool only stores HarnessAdapter entries (no WS ref).
 * We track WS readyState separately so liveness can be determined without coupling
 * the pool to WebSocket internals. A worker id maps to its socket's isLive() probe.
 *
 * Why module-level: WorkerConnectionManager instances are ephemeral (one per WS
 * connection). The registry must survive across manager instances to detect
 * cross-connection id collisions.
 */
const LIVE_WORKER_SOCKETS = new Map<string, { isLive: () => boolean }>();

/**
 * Manages the lifecycle of a single worker WebSocket connection.
 * Exported so tests can exercise the message-handling logic without
 * spinning up a real WebSocket server.
 */
class WorkerConnectionManager {
	private readonly pool: RunOrchestrationAdapterPool;
	private readonly adapterFactory: RunOrchestrationRemoteHarnessAdapterFactory;
	private workerId: string | null = null;
	/** Set after registration — routes runtime messages to the adapter. */
	private adapter: ReturnType<RunOrchestrationRemoteHarnessAdapterFactory["create"]> | null = null;

	constructor(
		pool: RunOrchestrationAdapterPool,
		adapterFactory: RunOrchestrationRemoteHarnessAdapterFactory,
	) {
		this.pool = pool;
		this.adapterFactory = adapterFactory;
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
			// AF11 Hole 3: reject duplicate-active-id to prevent identity hijack.
			// A second connection claiming an in-use worker id is rejected unless the
			// incumbent socket is already dead (closed/closing) — in which case it is
			// a legitimate reconnect and the stale entry is evicted.
			//
			// @lore AF11: LIVE_WORKER_SOCKETS probes incumbent WS readyState independently
			// of AdapterPool. Pool entries are keyed by id; socket liveness is not stored
			// in the pool. The two registries are kept in sync by onClose cleanup.
			if (this.pool.has(msg.id)) {
				const incumbent = LIVE_WORKER_SOCKETS.get(msg.id);
				if (incumbent?.isLive()) {
					// Incumbent is live → reject the new registration (identity hijack attempt)
					ws.send(JSON.stringify({ type: "register_rejected", reason: "id_in_use" }));
					return;
				}
				// Incumbent socket is dead → evict stale entry and accept reconnect
				this.pool.unregister(msg.id);
				LIVE_WORKER_SOCKETS.delete(msg.id);
			}

			this.workerId = msg.id;

			// Register the ws socket liveness probe for future duplicate-id detection.
			// readyState 1 = OPEN; any other value (2=CLOSING, 3=CLOSED) means dead.
			// WSContext may not expose readyState; fall back to "live unless proven dead".
			const wsWithReadyState = ws as { send(data: string): void; readyState?: number };
			LIVE_WORKER_SOCKETS.set(msg.id, {
				isLive: () => {
					const rs = wsWithReadyState.readyState;
					return rs === undefined || rs === 1; // undefined = can't probe → assume live
				},
			});

			// Create adapter; it owns the session routing map.
			// Pass ws as the WsLike interface — RemoteHarnessAdapter.dispatchMessage
			// is called below for post-registration messages so we do not rely on
			// ws.onmessage assignment (which WSContext may not support).
			this.adapter = this.adapterFactory.create(ws, msg);
			this.pool.register(msg.id, this.adapter, {
				name: msg.name,
				kind: "remote",
				type: msg.harnessType, // X3: worker-specified harness type (optional)
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
			LIVE_WORKER_SOCKETS.delete(this.workerId);
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
function registerWorkerWsRoute(
	app: Hono,
	pool: RunOrchestrationAdapterPool,
	adapterFactory: RunOrchestrationRemoteHarnessAdapterFactory,
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
			const manager = new WorkerConnectionManager(pool, adapterFactory);

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

interface WorkerIngress {
	register(app: Hono, upgradeWebSocket: UpgradeWebSocket): () => void;
	createConnection(): WorkerConnectionManager;
}

export function createWorkerIngress(
	pool: RunOrchestrationAdapterPool,
	adapterFactory: RunOrchestrationRemoteHarnessAdapterFactory,
): WorkerIngress {
	return {
		register: (app, upgradeWebSocket) =>
			registerWorkerWsRoute(app, pool, adapterFactory, upgradeWebSocket),
		createConnection: () => new WorkerConnectionManager(pool, adapterFactory),
	};
}
