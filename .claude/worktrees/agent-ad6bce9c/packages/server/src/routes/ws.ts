import { API_ERROR_CODES } from "@hyperidle/shared";
import type { ApiErrorResponse, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";

const { upgradeWebSocket, websocket: wsHandler } = createBunWebSocket();

interface ClientState {
	topics: Set<string>;
}

/**
 * Register WebSocket route on the given Hono app.
 * Auth is checked before upgrade via query param `token`.
 * This module requires the Bun runtime (uses hono/bun).
 *
 * When eventBus is provided, clients can subscribe to topics
 * (e.g., "conversations") and receive forwarded domain events.
 */
function registerWsRoute(apiApp: Hono, eventBus?: EventBus): void {
	const clients = new Map<WSContext, ClientState>();

	// Subscribe to domain events and forward to subscribed clients
	if (eventBus) {
		eventBus.on("item_created", (event) => {
			for (const [ws, state] of clients) {
				if (state.topics.has("conversations")) {
					ws.send(JSON.stringify(event));
				}
			}
		});

		eventBus.on("response_recorded", (event) => {
			for (const [ws, state] of clients) {
				if (state.topics.has("conversations")) {
					ws.send(JSON.stringify(event));
				}
			}
		});
	}

	// WebSocket auth via query token
	apiApp.use("/ws", async (c, next) => {
		const token = c.req.query("token");
		const expectedKey = process.env.HYPERIDLE_API_KEY;
		if (!expectedKey || token !== expectedKey) {
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
				clients.set(rawWs, { topics: new Set() });
				ws.send(JSON.stringify({ type: "connected" }));
			},
			onMessage(evt, ws) {
				const rawWs = ws.raw as WSContext;
				if (typeof evt.data === "string") {
					try {
						const msg = JSON.parse(evt.data) as { type?: string; topic?: string };
						if (msg.type === "subscribe" && msg.topic) {
							const state = clients.get(rawWs);
							if (state) {
								state.topics.add(msg.topic);
								ws.send(JSON.stringify({ type: "subscribed", topic: msg.topic }));
								return;
							}
						}
						if (msg.type === "unsubscribe" && msg.topic) {
							const state = clients.get(rawWs);
							if (state) {
								state.topics.delete(msg.topic);
								ws.send(JSON.stringify({ type: "unsubscribed", topic: msg.topic }));
								return;
							}
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
				clients.delete(rawWs);
			},
		})),
	);
}

export { registerWsRoute, wsHandler };
