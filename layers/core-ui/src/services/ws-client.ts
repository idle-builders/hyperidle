// @lore: WebSocket — not available in JSDOM tests; callers must stub the ws-client module; degrades gracefully on token/connection failure

import { apiFetch } from "./api-fetch.js";

export type WsMessageHandler = (data: unknown) => void;

interface Subscriber {
	topic: string;
	handler: WsMessageHandler;
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000];

class WsClient {
	constructor(private readonly path: string) {}

	private socket: WebSocket | null = null;
	private subscribers: Subscriber[] = [];
	private pendingSubscribes: Set<string> = new Set();
	private reconnectAttempt = 0;
	private stopped = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private connected = false;

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

		// @lore: VITE_API_PORT — overrides default dev port (3001) for e2e environments where API runs on a different port; WS upgrades don't proxy through Vite
		// @lore: import.meta.env.MODE not .DEV/.PROD — .env NODE_ENV=development flips .DEV/.PROD; MODE is set from CLI before env files and can't be poisoned by .env
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

	// @lore: WS message routing — push envelope {type:"update", topic, kind, data}; match on envelope.topic; session:<id> carries content-free nudge, same shape
	private messageMatchesTopic(msg: Record<string, unknown>, topic: string): boolean {
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

const CORE_WS_PATH = "/api/ws";

let wsClientInstance: WsClient | null = null;

export function getWsClient(): WsClient {
	if (!wsClientInstance) {
		wsClientInstance = new WsClient(CORE_WS_PATH);
	}
	return wsClientInstance;
}
