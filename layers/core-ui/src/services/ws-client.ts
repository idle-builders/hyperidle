/**
 * Lightweight WebSocket client for HyperIdle.
 *
 * Acquires a one-shot upgrade token via POST /api/auth/ws-token, then opens a
 * WebSocket at the given path with `?token=<token>`. Handles subscribe/
 * unsubscribe for named topics and dispatches incoming messages to registered
 * handlers.
 *
 * @lore Q1: The web package had no WebSocket client until Q1. Hooks that need
 * real-time updates (useThreads, useSessionActivity) subscribe via a
 * singleton. Each singleton reconnects automatically on unexpected close.
 *
 * @lore AU26 J3, superseded: there used to be TWO sockets, one per Layer.
 * The browser now holds ONE — `getWsClient()`, talking to core-api's
 * `/api/ws` — carrying every topic including `session:<id>`, which
 * `agent-orchestration` reaches by pushing a content-free nudge through
 * core's own hub (`agent-orchestration/src/services/session-activity-gateway.ts`).
 *
 * @lore Q1: WS transport is NOT available in JSDOM tests. Callers that need
 * WS functionality (e.g. useSessionActivity) must stub the ws-client module
 * in their tests. The service degrades gracefully when the token endpoint
 * returns an error or the WS connection fails.
 */

import { apiFetch } from "./api-fetch.js";

export type WsMessageHandler = (data: unknown) => void;

interface Subscriber {
	topic: string;
	handler: WsMessageHandler;
}

// Reconnect delays (ms): 1s, 2s, 4s, 8s, max 15s
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000];

class WsClient {
	/** @param path the server path this socket connects to, e.g. `/api/ws`. */
	constructor(private readonly path: string) {}

	private socket: WebSocket | null = null;
	private subscribers: Subscriber[] = [];
	private pendingSubscribes: Set<string> = new Set();
	private reconnectAttempt = 0;
	private stopped = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private connected = false;

	/** Subscribe to a topic. Returns an unsubscribe function. */
	subscribe(topic: string, handler: WsMessageHandler): () => void {
		this.subscribers.push({ topic, handler });
		if (this.connected) {
			this.sendSubscribe(topic);
		} else {
			this.pendingSubscribes.add(topic);
			// Lazily start the connection on first subscriber
			if (!this.socket) {
				void this.connect();
			}
		}
		return () => {
			this.unsubscribeHandler(topic, handler);
		};
	}

	private unsubscribeHandler(topic: string, handler: WsMessageHandler): void {
		const index = this.subscribers.findIndex((s) => s.topic === topic && s.handler === handler);
		if (index !== -1) {
			this.subscribers.splice(index, 1);
		}
		// If no more subscribers on this topic, unsubscribe from server
		const stillSubscribed = this.subscribers.some((s) => s.topic === topic);
		if (!stillSubscribed && this.connected && this.socket) {
			try {
				this.socket.send(JSON.stringify({ type: "unsubscribe", topic }));
			} catch {
				// Socket may be closing — ignore
			}
		}
	}

	private sendSubscribe(topic: string): void {
		if (this.socket && this.connected) {
			try {
				this.socket.send(JSON.stringify({ type: "subscribe", topic }));
			} catch {
				// Socket may be closing — queue for next connect
				this.pendingSubscribes.add(topic);
			}
		}
	}

	private async connect(): Promise<void> {
		if (this.stopped) return;

		// Acquire one-shot upgrade token
		let token: string;
		try {
			const res = await apiFetch("/api/auth/ws-token", { method: "POST" });
			if (!res.ok) {
				this.scheduleReconnect();
				return;
			}
			const body = (await res.json()) as { token?: string };
			if (!body.token) {
				this.scheduleReconnect();
				return;
			}
			token = body.token;
		} catch {
			this.scheduleReconnect();
			return;
		}

		// Determine WS URL: use the same host as the current page but with ws: scheme.
		// In Vite dev, the proxy forwards /api → the API server so we need to connect
		// directly to the server, not through the Vite proxy (ws upgrades don't proxy well).
		// @lore AH6: VITE_API_PORT overrides the default dev port (3001) for e2e test
		// environments that run the API server on a different port (e.g. AH6 on 3098).
		// Without this, the WS client connects to localhost:3001 which doesn't exist in
		// the AH6 test environment — turns complete server-side but events never reach
		// the frontend, so the "thinking..." row never resolves.
		//
		// @lore proven-bug fix: branch on `import.meta.env.MODE`, never `.DEV`/`.PROD`.
		// Vite forces `process.env.NODE_ENV` from a `NODE_ENV=development` line in ANY
		// loaded `.env` file whenever the launching shell itself didn't already set
		// NODE_ENV (see vite's resolveConfig: `isNodeEnvSet` is snapshotted before the
		// config/env files load, so a stray `NODE_ENV=development` in a machine-local
		// `.env` silently wins even under `vite build`) — that flips `.DEV`/`.PROD` for
		// the whole production build, so a packaged desktop app can ship with the dev
		// websocket address baked in and never receive a live update (confirmed by
		// grepping the built bundle). `MODE` is fixed once from the CLI command itself
		// (`build` → "production", `serve` → "development") before any env file is
		// read, so it cannot be poisoned this way. Note this branch treats any mode
		// other than exactly "production" as dev — today the only mode `vite build`
		// ever produces is "production", but a future `--mode staging` or similar
		// would also dial the dev address here.
		const isDevProxy = typeof import.meta !== "undefined" && import.meta.env.MODE !== "production";
		const devWsPort =
			typeof import.meta !== "undefined" && import.meta.env.VITE_API_PORT
				? String(import.meta.env.VITE_API_PORT)
				: "3001";
		const wsBase = isDevProxy
			? `ws://localhost:${devWsPort}`
			: `${window.location.protocol.replace("http", "ws")}//${window.location.host}`;
		const wsUrl = `${wsBase}${this.path}?token=${encodeURIComponent(token)}`;

		const ws = new WebSocket(wsUrl);
		this.socket = ws;

		ws.onopen = () => {
			if (this.stopped) {
				ws.close();
				return;
			}
			this.connected = true;
			this.reconnectAttempt = 0;
			// Subscribe to all unique pending topics
			const uniqueTopics = new Set([
				...this.pendingSubscribes,
				...this.subscribers.map((s) => s.topic),
			]);
			for (const topic of uniqueTopics) {
				this.sendSubscribe(topic);
			}
			this.pendingSubscribes.clear();
		};

		ws.onmessage = (evt) => {
			if (typeof evt.data !== "string") return;
			let parsed: unknown;
			try {
				parsed = JSON.parse(evt.data);
			} catch {
				return;
			}
			if (typeof parsed !== "object" || parsed === null) return;
			const msg = parsed as Record<string, unknown>;
			// Dispatch to subscribers matching the topic embedded in the message.
			// The server embeds the original event type but not the topic in the
			// message frame. We match by the event's sessionId / threadId fields
			// to route to the right handler. For simplicity, we send to ALL
			// handlers whose topic key matches the message content.
			for (const sub of this.subscribers) {
				if (this.messageMatchesTopic(msg, sub.topic)) {
					try {
						sub.handler(parsed);
					} catch {
						// Handler errors must not crash the client
					}
				}
			}
		};

		ws.onclose = () => {
			this.connected = false;
			this.socket = null;
			if (!this.stopped) {
				// Re-queue all currently active topics for the next reconnect
				for (const sub of this.subscribers) {
					this.pendingSubscribes.add(sub.topic);
				}
				this.scheduleReconnect();
			}
		};

		ws.onerror = () => {
			// onclose will fire after onerror — let it handle reconnection
			this.connected = false;
		};
	}

	/**
	 * Determine whether an incoming WS message belongs to a subscribed topic.
	 * Topics have the form `<kind>:<id>` (e.g. `session:sess-1`, `thread:thr-1`)
	 * or are global names (`conversations`).
	 *
	 * @lore AU21 §6 Decision L4 / §9 Increment 14d: `conversations`/
	 * `thread:<id>` carry a PUSH envelope with the actual changed data
	 * (`{ type: "update", topic, kind, data }`, see `ws-connection-hub.ts` +
	 * `routes/threads.ts`) — matched directly
	 * on the envelope's own `topic` field, same matching shape as the prior
	 * `{ type: "invalidate", … }` ping this supersedes (founder: "there is no
	 * refetch … core submits the changed version"). `session:<id>` (AU26 J3,
	 * superseded) now carries the SAME shape — a content-free nudge, never the
	 * raw event — so it needs no branch of its own any more.
	 */
	private messageMatchesTopic(msg: Record<string, unknown>, topic: string): boolean {
		// Push envelope: match directly on its own `topic` field.
		if (msg.type === "update") {
			return msg.topic === topic;
		}
		return false;
	}

	private scheduleReconnect(): void {
		if (this.stopped) return;
		const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
		this.reconnectAttempt++;
		this.reconnectTimer = setTimeout(() => {
			void this.connect();
		}, delay);
	}

	/** Permanently stop this client (e.g. on app teardown). */
	stop(): void {
		this.stopped = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.socket) {
			this.socket.close();
			this.socket = null;
		}
	}
}

/** core-api's one socket: every topic, `session:<id>` included. */
const CORE_WS_PATH = "/api/ws";

// One singleton — one connection per browser session.
let wsClientInstance: WsClient | null = null;

/** The one websocket. Every topic — thread, conversation, document, session. */
export function getWsClient(): WsClient {
	if (!wsClientInstance) {
		wsClientInstance = new WsClient(CORE_WS_PATH);
	}
	return wsClientInstance;
}
