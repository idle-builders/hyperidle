/**
 * `GET /api/agent-orchestration/ws` — this Layer's own live-run WebSocket.
 *
 * @lore AU26 J3: the twin of core-api's `routes/ws.ts`, deliberately separate.
 * Core's socket carries `thread:<id>` / `conversations` / `work`; this one
 * carries `session:<id>` and nothing else. The browser therefore holds TWO
 * sockets, which is the accepted price of the split (founder: session dial-in is
 * orchestration's, not core's).
 *
 * Registered on the `/api` router BEFORE the auth middleware, for the same
 * reason core's is: browsers cannot set headers on a WebSocket upgrade, so the
 * credential travels in the query string as a one-shot upgrade token. The token
 * store itself is injected by the **Application** (`SessionStreamTokenStore`) —
 * this Layer never imports `@hyperidle/users`, where the store lives. The
 * Application hands both sockets the SAME store, so `POST /api/auth/ws-token`
 * mints a token either socket can consume; the client simply mints one per
 * socket, since a token is single-use.
 *
 * `upgradeWebSocket` is injected for the same runtime-agnostic reason core's is.
 */

import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import type { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";
import type { SessionStreamClient, SessionStreamHub } from "../services/session-stream-hub.js";

/**
 * The one-shot upgrade-token surface this route needs. Structurally satisfied by
 * `@hyperidle/users`' `UpgradeTokenStore` without importing it — Mechanism-C DI,
 * supplied by the Application.
 */
export interface SessionStreamTokenStore {
	consume(token: string): { ok: true; identityId?: string } | { ok: false };
}

/** Wraps a Hono `WSContext` into the hub's `SessionStreamClient`. */
class WsContextAdapter implements SessionStreamClient {
	constructor(private readonly ws: WSContext) {}
	send(data: string): void {
		this.ws.send(data);
	}
}

/**
 * Register the Layer's live-run socket on the Application's `/api` router.
 * Returns a disposer that drops the adapter table.
 */
export function registerSessionStreamRoute(
	apiRouter: Hono,
	tokenStore: SessionStreamTokenStore,
	upgradeWebSocket: UpgradeWebSocket,
	hub: SessionStreamHub,
): () => void {
	const adapters = new Map<WSContext, WsContextAdapter>();
	// The token is consumed in the middleware (URL-time); `addClient` happens on
	// `onOpen`, which fires on the runtime's upgrade event. The identity has to
	// travel between the two.
	//
	// @lore AU26 review W12: it travels ON THE REQUEST, keyed by the Hono
	// `Context` of the upgrade that resolved it — never in a single
	// module-scoped slot. A shared slot is only safe if nothing can interleave,
	// and the middleware is `async`: two upgrades at once run middleware(A) →
	// middleware(B) → onOpen(A), and A joins under B's identity. With this
	// socket's authorizer admitting on identity alone, that mix-up is
	// indistinguishable from the right answer. `upgradeWebSocket`'s factory is
	// called per request with that same `Context`, so the handoff needs no slot
	// at all. Weakly keyed, so a request that never upgrades leaves nothing
	// behind. (Core-api's socket carries the older shape; same fix applies
	// there, tracked separately — this Layer does not import it.)
	const identityByRequest = new WeakMap<object, string>();

	apiRouter.use("/agent-orchestration/ws", async (c, next) => {
		const token = c.req.query("token");
		const result = token ? tokenStore.consume(token) : { ok: false as const };
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

	apiRouter.get(
		"/agent-orchestration/ws",
		upgradeWebSocket((c) => ({
			onOpen(_evt, ws) {
				const adapter = new WsContextAdapter(ws);
				adapters.set(ws, adapter);
				hub.addClient(adapter, identityByRequest.get(c));
				identityByRequest.delete(c);
				ws.send(JSON.stringify({ type: "connected" }));
			},
			async onMessage(evt, ws) {
				const adapter = adapters.get(ws);
				if (typeof evt.data !== "string") {
					ws.send("binary");
					return;
				}
				try {
					const msg = JSON.parse(evt.data) as { type?: string; topic?: string };
					if (msg.type === "subscribe" && msg.topic && adapter) {
						const result = await hub.subscribe(adapter, msg.topic);
						ws.send(
							result === "ok"
								? JSON.stringify({ type: "subscribed", topic: msg.topic })
								: JSON.stringify({ type: "forbidden", error: "forbidden", topic: msg.topic }),
						);
						return;
					}
					if (msg.type === "unsubscribe" && msg.topic && adapter) {
						hub.unsubscribe(adapter, msg.topic);
						ws.send(JSON.stringify({ type: "unsubscribed", topic: msg.topic }));
						return;
					}
				} catch {
					// Not JSON — fall through to the echo below.
				}
				ws.send(evt.data);
			},
			onClose(_evt, ws) {
				const adapter = adapters.get(ws);
				if (adapter) {
					hub.removeClient(adapter);
					adapters.delete(ws);
				}
			},
		})),
	);

	return (): void => {
		adapters.clear();
	};
}
