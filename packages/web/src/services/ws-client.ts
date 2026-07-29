/**
 * Lightweight WebSocket client for HyperIdle.
 *
 * Acquires a one-shot upgrade token via POST /api/auth/ws-token, then opens
 * the WebSocket at /api/ws?token=<token>. Handles subscribe/unsubscribe for
 * named topics and dispatches incoming messages to registered handlers.
 *
 * @lore Q1: The web package had no WebSocket client until Q1. Hooks that need
 * real-time updates (useConversationsThreads, useSessionActivity) subscribe via
 * this singleton. The singleton reconnects automatically on unexpected close.
 * Only one WS connection is opened per browser session.
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
		const isDevProxy = typeof import.meta !== "undefined" && import.meta.env?.DEV === true;
		const devWsPort =
			typeof import.meta !== "undefined" && import.meta.env?.VITE_API_PORT
				? String(import.meta.env.VITE_API_PORT)
				: "3001";
		const wsBase = isDevProxy
			? `ws://localhost:${devWsPort}`
			: `${window.location.protocol.replace("http", "ws")}//${window.location.host}`;
		const wsUrl = `${wsBase}/api/ws?token=${encodeURIComponent(token)}`;

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
	 * or are global names (`conversations`, `work`).
	 *
	 * @lore AU21 Decision E / Increment 7: `conversations`/`work`/`thread:<id>`
	 * now carry a minimal invalidation envelope
	 * (`{ type: "invalidate", topic, kind, id? }`, see `ws-broadcaster.ts`) —
	 * matched directly on the envelope's own `topic` field rather than
	 * inferring membership (match-all for global, `threadId`-field lookup for
	 * thread). `session:<id>` is untouched this wave — Decision E's (c)
	 * concern is a real content stream (`useSessionActivity.ts` consumes
	 * `toolName`/`argsSummary`/… payload fields), still forwarded as the full
	 * event and matched by `sessionId` as before.
	 */
	private messageMatchesTopic(msg: Record<string, unknown>, topic: string): boolean {
		// Minimal invalidation envelope: match directly on its own `topic` field.
		if (msg.type === "invalidate") {
			return msg.topic === topic;
		}
		// Per-session topic `session:<id>`: match messages with matching sessionId
		if (topic.startsWith("session:")) {
			const sessionId = topic.slice("session:".length);
			return msg.sessionId === sessionId;
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

// Singleton WS client — one connection per browser session
let wsClientInstance: WsClient | null = null;

export function getWsClient(): WsClient {
	if (!wsClientInstance) {
		wsClientInstance = new WsClient();
	}
	return wsClientInstance;
}
