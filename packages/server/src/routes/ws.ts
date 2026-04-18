import { API_ERROR_CODES } from "@hyperidle/shared";
import type { ApiErrorResponse, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import type { UpgradeTokenStore } from "../auth/upgrade-token-store.js";

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
 *
 * Returns a disposer that unregisters the EventBus subscribers. Callers
 * (typically `server-factory.createBunServer` + in-process integration
 * tests) call the disposer during teardown so sibling apps sharing a
 * process do not leak subscriptions onto the bus.
 *
 * @lore I1 W2: in-process test isolation relies on this disposer. Without
 * it, server-factory.integration.test.ts's `afterAll` would leave the
 * event-bus handlers attached, and a follow-on test registering the same
 * route would pile up a second set of handlers against a stale `clients`
 * map — sending WS traffic to already-closed sockets.
 */
function registerWsRoute(
	apiApp: Hono,
	eventBus: EventBus | undefined,
	tokenStore: UpgradeTokenStore,
): () => void {
	const clients = new Map<WSContext, ClientState>();

	// Subscribe to domain events and forward to subscribed clients.
	// Capture the `.on(...)` disposers so we can unsubscribe in the
	// returned teardown function below.
	const busDisposers: Array<() => void> = [];
	if (eventBus) {
		busDisposers.push(
			eventBus.on("item_created", (event) => {
				for (const [ws, state] of clients) {
					if (state.topics.has("conversations")) {
						ws.send(JSON.stringify(event));
					}
				}
			}),
		);

		busDisposers.push(
			eventBus.on("response_recorded", (event) => {
				for (const [ws, state] of clients) {
					if (state.topics.has("conversations")) {
						ws.send(JSON.stringify(event));
					}
				}
			}),
		);
	}

	// WebSocket auth via one-shot upgrade token (I2 A3/A4/A5).
	//
	// The raw HYPERIDLE_API_KEY is NOT accepted on the query channel —
	// clients must POST /api/auth/ws-token first to mint a single-use,
	// short-lived token, then open the WS with `?token=<minted>`.
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

	return (): void => {
		for (const dispose of busDisposers) {
			dispose();
		}
		busDisposers.length = 0;
		clients.clear();
	};
}

export { registerWsRoute, wsHandler };
