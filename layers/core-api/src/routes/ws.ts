import type { ApiErrorResponse } from "@hyperidle/domain-model";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import type { UpgradeTokenStore } from "@hyperidle/user";
import type { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";
import { type WsClient, WsConnectionHub } from "../ws-connection-hub.js";

/** Wraps a Hono WSContext into the WsClient interface. Runtime-agnostic via WSContext.send(). */
class WsContextAdapter implements WsClient {
	constructor(private readonly ws: WSContext) {}
	send(data: string): void {
		this.ws.send(data);
	}
}

/**
 * @lore: ws identity — keyed by Hono Context of upgrade; module-scoped slot unsafe: interleaved async middleware causes A to join under B identity
 */
function registerWsRoute(
	apiApp: Hono,
	tokenStore: UpgradeTokenStore,
	upgradeWebSocket: UpgradeWebSocket,
	injectedHub: WsConnectionHub | null = null,
): () => void {
	const broadcaster: WsConnectionHub = injectedHub ?? new WsConnectionHub();

	const adapters = new Map<WSContext, WsContextAdapter>();
	// Weakly keyed, so a request that never upgrades leaves nothing behind.
	const identityByRequest = new WeakMap<object, string>();

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
		if (result.identityId !== undefined) identityByRequest.set(c, result.identityId);
		await next();
	});

	apiApp.get(
		"/ws",
		upgradeWebSocket((c) => ({
			onOpen(_evt, ws) {
				const adapter = new WsContextAdapter(ws);
				adapters.set(ws, adapter);
				broadcaster?.addClient(adapter, identityByRequest.get(c));
				identityByRequest.delete(c);
				ws.send(JSON.stringify({ type: "connected" }));
			},
			async onMessage(evt, ws) {
				const adapter = adapters.get(ws);
				if (typeof evt.data === "string") {
					try {
						const msg = JSON.parse(evt.data) as { type?: string; topic?: string };
						if (msg.type === "subscribe" && msg.topic && adapter && broadcaster) {
							// @lore: broadcaster.subscribe() is async — must await; missing await causes result === Promise (truthy), never "ok"
							const result = await broadcaster.subscribe(adapter, msg.topic);
							if (result === "ok") {
								ws.send(JSON.stringify({ type: "subscribed", topic: msg.topic }));
							} else {
								ws.send(
									JSON.stringify({ type: "forbidden", error: "forbidden", topic: msg.topic }),
								);
							}
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
				const adapter = adapters.get(ws);
				if (adapter) {
					broadcaster?.removeClient(adapter);
					adapters.delete(ws);
				}
			},
		})),
	);

	return (): void => {
		adapters.clear();
	};
}

export { registerWsRoute };
