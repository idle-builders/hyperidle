import { WsBroadcaster, type WsClient } from "@hyperidle/realtime";
import type { ApiErrorResponse, EventBus } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import type { UpgradeTokenStore } from "@hyperidle/users";
import type { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";

/**
 * Adapter that wraps a Hono WSContext into the WsClient interface
 * expected by WsBroadcaster. Uses WSContext.send() which is runtime-agnostic
 * (works under both @hono/node-server and any compatible WebSocket adapter).
 *
 * @lore N1: previously this adapter held `ws.raw as WSContext` which accessed
 * the underlying runtime socket. Switched to WSContext directly so the code
 * is runtime-agnostic — no Bun.ServerWebSocket or ws.WebSocket dependency.
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
 *
 * The `upgradeWebSocket` function is injected by the caller (server-factory)
 * so this module is runtime-agnostic — works with @hono/node-server under
 * Node and with Bun's adapter alike.
 *
 * @lore N1: this module previously used a Bun-specific WebSocket factory at
 * module scope. N1 removes that dependency by injecting `upgradeWebSocket`
 * as a parameter. The route behaviour is identical; only the transport
 * adapter changes.
 *
 * @lore I6: ws.ts now delegates all event forwarding to WsBroadcaster,
 * eliminating the duplicate event subscription logic that previously
 * existed in both files. WsBroadcaster owns the topic-based routing
 * and event subscriptions; ws.ts handles only the WebSocket
 * lifecycle (auth, connect, disconnect, subscribe/unsubscribe messages).
 *
 * @lore I1 W2: in-process test isolation relies on the returned disposer.
 *
 * @lore L1 step9 (Adv-C1): the upgrade token now binds an identityId.
 * `consumePending` pulls the identity off the consume result so the next
 * `onOpen` can register the client with the broadcaster's authz table.
 */
function registerWsRoute(
	apiApp: Hono,
	eventBus: EventBus | undefined,
	tokenStore: UpgradeTokenStore,
	upgradeWebSocket: UpgradeWebSocket,
	injectedBroadcaster: WsBroadcaster | null = null,
): () => void {
	// Delegate event forwarding to WsBroadcaster when eventBus is available.
	// L1 step9: server-factory may pass an authz-bound broadcaster; tests +
	// non-Bun harnesses fall back to building one inline from the eventBus.
	let owned = false;
	let broadcaster: WsBroadcaster | null = injectedBroadcaster;
	if (!broadcaster && eventBus) {
		broadcaster = new WsBroadcaster(eventBus);
		broadcaster.start();
		owned = true;
	}

	// Map WSContext to its adapter for cleanup.
	const adapters = new Map<WSContext, WsContextAdapter>();
	// Pending identity from the token-consume step. The consume happens in
	// the middleware (URL-time); the addClient happens on `onOpen`. The
	// upgrade flow does not let us thread the identity through directly,
	// so we stash it in a single-slot queue keyed by request order. This
	// is safe because the middleware → onOpen handoff is synchronous.
	let pendingIdentity: string | undefined;

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
		pendingIdentity = result.identityId;
		await next();
	});

	apiApp.get(
		"/ws",
		upgradeWebSocket(() => ({
			onOpen(_evt, ws) {
				const adapter = new WsContextAdapter(ws);
				adapters.set(ws, adapter);
				broadcaster?.addClient(adapter, pendingIdentity);
				pendingIdentity = undefined;
				ws.send(JSON.stringify({ type: "connected" }));
			},
			async onMessage(evt, ws) {
				const adapter = adapters.get(ws);
				if (typeof evt.data === "string") {
					try {
						const msg = JSON.parse(evt.data) as { type?: string; topic?: string };
						if (msg.type === "subscribe" && msg.topic && adapter && broadcaster) {
							// @lore N1: broadcaster.subscribe() is async (DB lookup for thread
							// participant checks). Must await here — the pre-PGlite sync path
							// returned a string directly; the async path returns Promise<string>.
							// Missing await caused result === Promise (truthy), never "ok".
							const result = await broadcaster.subscribe(adapter, msg.topic);
							if (result === "ok") {
								ws.send(JSON.stringify({ type: "subscribed", topic: msg.topic }));
							} else {
								// L1 step9 (Adv-C1): a non-participant tried to subscribe to a
								// thread topic. Plan §6.2 specifies the forbidden ack shape so
								// e2e tests can distinguish "rejected" from "silently dropped".
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
		if (owned) {
			broadcaster?.stop();
		}
		adapters.clear();
	};
}

export { registerWsRoute };
