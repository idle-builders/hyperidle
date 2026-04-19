import { API_ERROR_CODES } from "@hyperidle/shared";
import type { ApiErrorResponse, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import type { UpgradeTokenStore } from "../auth/upgrade-token-store.js";
import { WsBroadcaster, type WsClient } from "../services/ws-broadcaster.js";

const { upgradeWebSocket, websocket: wsHandler } = createBunWebSocket();

/**
 * Adapter that wraps a raw Hono WSContext into the WsClient interface
 * expected by WsBroadcaster.
 */
class WsContextAdapter implements WsClient {
	constructor(private readonly ws: WSContext) {}
	send(data: string): void {
		this.ws.send(data);
	}
}

/**
 * Register WebSocket route on the given Hono app.
 * Auth is checked before upgrade via query param `token`.
 * This module requires the Bun runtime (uses hono/bun).
 *
 * @lore I6: ws.ts now delegates all event forwarding to WsBroadcaster,
 * eliminating the duplicate event subscription logic that previously
 * existed in both files. WsBroadcaster owns the topic-based routing
 * and event subscriptions; ws.ts handles only the Bun WebSocket
 * lifecycle (auth, connect, disconnect, subscribe/unsubscribe messages).
 *
 * @lore I1 W2: in-process test isolation relies on the returned disposer.
 */
function registerWsRoute(
	apiApp: Hono,
	eventBus: EventBus | undefined,
	tokenStore: UpgradeTokenStore,
): () => void {
	// Delegate event forwarding to WsBroadcaster when eventBus is available.
	let broadcaster: WsBroadcaster | null = null;
	if (eventBus) {
		broadcaster = new WsBroadcaster(eventBus);
		broadcaster.start();
	}

	// Map raw WSContext to its adapter for cleanup.
	const adapters = new Map<WSContext, WsContextAdapter>();

	// WebSocket auth via one-shot upgrade token (I2 A3/A4/A5).
	apiApp.use("/ws", async (c, next) => {
		const token = c.req.query("token");
		if (!token) {
			const response: ApiErrorResponse = {
				error: "Missing or invalid token",
				code: API_ERROR_CODES.UNAUTHORIZED,
			};
			return c.json(response, 401);
		}
		const result = tokenStore.consume(token);
		if (!result.ok) {
			const response: ApiErrorResponse = {
				error: "Missing or invalid token",
				code: API_ERROR_CODES.UNAUTHORIZED,
			};
			return c.json(response, 401);
		}
		await next();
	});

	apiApp.get(
		"/ws",
		upgradeWebSocket(() => ({
			onOpen(_evt, ws) {
				const rawWs = ws.raw as WSContext;
				const adapter = new WsContextAdapter(rawWs);
				adapters.set(rawWs, adapter);
				broadcaster?.addClient(adapter);
				ws.send(JSON.stringify({ type: "connected" }));
			},
			onMessage(evt, ws) {
				const rawWs = ws.raw as WSContext;
				const adapter = adapters.get(rawWs);
				if (typeof evt.data === "string") {
					try {
						const msg = JSON.parse(evt.data) as { type?: string; topic?: string };
						if (msg.type === "subscribe" && msg.topic && adapter && broadcaster) {
							broadcaster.subscribe(adapter, msg.topic);
							ws.send(JSON.stringify({ type: "subscribed", topic: msg.topic }));
							return;
						}
						if (msg.type === "unsubscribe" && msg.topic && adapter && broadcaster) {
							broadcaster.unsubscribe(adapter, msg.topic);
							ws.send(JSON.stringify({ type: "unsubscribed", topic: msg.topic }));
							return;
						}
					} catch {
						// Not JSON, echo back
					}
					ws.send(evt.data);
				} else {
					ws.send("binary");
				}
			},
			onClose(_evt, ws) {
				const rawWs = ws.raw as WSContext;
				const adapter = adapters.get(rawWs);
				if (adapter) {
					broadcaster?.removeClient(adapter);
					adapters.delete(rawWs);
				}
			},
		})),
	);

	return (): void => {
		broadcaster?.stop();
		adapters.clear();
	};
}

export { registerWsRoute, wsHandler };
