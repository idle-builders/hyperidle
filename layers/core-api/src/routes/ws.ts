import type { ApiErrorResponse } from "@hyperidle/domain-model";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import type { UpgradeTokenStore } from "@hyperidle/users";
import type { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";
import { type WsClient, WsConnectionHub } from "../ws-connection-hub.js";

/**
 * Adapter that wraps a Hono WSContext into the WsClient interface
 * expected by WsConnectionHub. Uses WSContext.send() which is runtime-agnostic
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
 * @lore I6: ws.ts delegates connection/subscription/broadcast mechanics to
 * WsConnectionHub — a pure transport with no event-forwarding logic of its
 * own (AU21 §6 Decision L4 / §9 Increment 14d deleted the generic forwarder
 * that used to live there). ws.ts handles only the WebSocket lifecycle
 * (auth, connect, disconnect, subscribe/unsubscribe messages); every domain
 * that wants to push data calls the SAME hub's `broadcast()` directly.
 *
 * @lore I1 W2: in-process test isolation relies on the returned disposer.
 *
 * @lore L1 step9 (Adv-C1): the upgrade token now binds an identityId.
 * `consumePending` pulls the identity off the consume result so the next
 * `onOpen` can register the client with the hub's authz table.
 *
 * @lore AU26 review W12, relocated: the identity travels ON THE REQUEST, keyed
 * by the Hono `Context` of the upgrade that resolved it — never in a single
 * module-scoped slot. A shared slot is only safe if nothing can interleave,
 * and the middleware is `async`: two upgrades at once run middleware(A) →
 * middleware(B) → onOpen(A), and A joins under B's identity — indistinguishable
 * from the right answer once a topic admits on identity alone (`session:<id>`,
 * folded onto this socket, is exactly that kind of topic). This fix used to
 * live only on the second websocket (`agent-orchestration/src/routes/
 * session-stream-ws.ts`, deleted); it is copied here rather than deleted with
 * that file, closing the same race on the socket that now carries both
 * topic families.
 */
function registerWsRoute(
	apiApp: Hono,
	tokenStore: UpgradeTokenStore,
	upgradeWebSocket: UpgradeWebSocket,
	injectedHub: WsConnectionHub | null = null,
): () => void {
	// L1 step9: server-factory always passes an authz-bound hub (also used
	// for direct domain pushes); tests may omit it and get an authz-less
	// fallback instance built inline.
	const broadcaster: WsConnectionHub = injectedHub ?? new WsConnectionHub();

	// Map WSContext to its adapter for cleanup.
	const adapters = new Map<WSContext, WsContextAdapter>();
	// The token is consumed in the middleware (URL-time); `addClient` happens
	// on `onOpen`, which fires on the runtime's upgrade event. The identity
	// travels between the two keyed on the Hono `Context` of the upgrade that
	// resolved it — see the WeakMap `@lore` above for why a single shared slot
	// is not safe. Weakly keyed, so a request that never upgrades leaves
	// nothing behind.
	const identityByRequest = new WeakMap<object, string>();

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
		adapters.clear();
	};
}

export { registerWsRoute };
