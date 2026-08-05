/**
 * The live-run socket's pre-auth gate.
 *
 * `GET /api/agent-orchestration/ws` sits in FRONT of the auth middleware — a
 * browser cannot set headers on a WebSocket upgrade, so the credential is a
 * one-shot upgrade token on the query string, exactly as on core-api's socket.
 * These cases exercise that gate through a real Hono router with a real
 * `UpgradeTokenStore`-shaped store; the only injected piece is
 * `upgradeWebSocket`, which is the runtime adapter the production caller
 * (`@hono/node-server`) supplies and which this route takes as a parameter
 * precisely so it stays runtime-agnostic.
 */

import { Hono } from "hono";
import { defineWebSocketHelper } from "hono/ws";
import { describe, expect, it } from "vitest";
import { SessionStreamHub } from "../../services/session-stream-hub.js";
import { registerSessionStreamRoute, type SessionStreamTokenStore } from "../session-stream-ws.js";

/** A one-shot store with the same contract as `@hyperidle/users`' real one. */
function createStore(tokens: Map<string, string | undefined>): SessionStreamTokenStore {
	return {
		consume(token) {
			if (!tokens.has(token)) return { ok: false };
			const identityId = tokens.get(token);
			tokens.delete(token);
			return identityId === undefined ? { ok: true } : { ok: true, identityId };
		},
	};
}

/**
 * Stands in for `@hono/node-server`'s adapter. The upgrade itself cannot happen
 * over `app.request()` in any runtime, so this answers 101-equivalent marker
 * text once the request has cleared the token gate.
 */
const markerUpgrade = defineWebSocketHelper((c) => c.newResponse("upgraded"));

function buildRouter(tokens: Map<string, string | undefined>): Hono {
	const api = new Hono();
	const hub = new SessionStreamHub({ canSubscribe: () => Promise.resolve(true) });
	registerSessionStreamRoute(api, createStore(tokens), markerUpgrade, hub);
	return api;
}

describe("agent-orchestration live-run socket", () => {
	it("rejects an upgrade with no token", async () => {
		const api = buildRouter(new Map());
		const res = await api.request("/agent-orchestration/ws");
		expect(res.status).toBe(401);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Missing or invalid token");
	});

	it("rejects an upgrade with an unknown token", async () => {
		const api = buildRouter(new Map([["good", "user-1"]]));
		const res = await api.request("/agent-orchestration/ws?token=bogus");
		expect(res.status).toBe(401);
	});

	it("accepts an upgrade with a valid token", async () => {
		const api = buildRouter(new Map([["good", "user-1"]]));
		const res = await api.request("/agent-orchestration/ws?token=good");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("upgraded");
	});

	it("a token is single-use — replay is rejected", async () => {
		const api = buildRouter(new Map([["good", "user-1"]]));
		expect((await api.request("/agent-orchestration/ws?token=good")).status).toBe(200);
		expect((await api.request("/agent-orchestration/ws?token=good")).status).toBe(401);
	});
});

/**
 * AU26 review W12 — two upgrades in flight must not cross identities.
 *
 * The identity is consumed in the (async) middleware and needed in `onOpen`,
 * which fires on the runtime's upgrade event. A single module-scoped slot
 * between the two is only safe if nothing can interleave — and nothing
 * guarantees that: the middleware is `async`, and two browsers (or two tabs)
 * connecting at once run middleware(A) → middleware(B) → onOpen(A), at which
 * point A is registered under B's identity. With the socket's authorizer
 * admitting on identity alone, the mixed-up identity is indistinguishable from
 * the right one.
 *
 * The interleave below is exactly that order, forced deterministically.
 */
describe("two concurrent upgrades keep their own identities", () => {
	it("registers each socket under the identity of ITS OWN token", async () => {
		const subscribedBy: Array<{ identity: string | undefined; topic: string }> = [];
		const hub = new SessionStreamHub({
			canSubscribe: (identity, topic) => {
				subscribedBy.push({ identity, topic });
				return Promise.resolve(true);
			},
		});

		// Release both upgrades only after BOTH have cleared the middleware.
		let releaseOpen: () => void = () => undefined;
		const openGate = new Promise<void>((resolve) => {
			releaseOpen = resolve;
		});
		let clearedMiddleware = 0;

		const interleavingUpgrade = defineWebSocketHelper(async (c, events) => {
			clearedMiddleware += 1;
			if (clearedMiddleware === 2) releaseOpen();
			await openGate;
			const ws = { send: () => undefined, close: () => undefined } as unknown as Parameters<
				NonNullable<typeof events.onOpen>
			>[1];
			events.onOpen?.(new Event("open"), ws);
			await events.onMessage?.(
				{
					data: JSON.stringify({ type: "subscribe", topic: `session:${c.req.query("token")}` }),
				} as unknown as Parameters<NonNullable<typeof events.onMessage>>[0],
				ws,
			);
			return c.newResponse("upgraded");
		});

		const api = new Hono();
		registerSessionStreamRoute(
			api,
			createStore(
				new Map([
					["alice", "user-alice"],
					["bob", "user-bob"],
				]),
			),
			interleavingUpgrade,
			hub,
		);

		await Promise.all([
			api.request("/agent-orchestration/ws?token=alice"),
			api.request("/agent-orchestration/ws?token=bob"),
		]);

		// Each subscribe carries the identity of the token that opened ITS socket.
		expect(subscribedBy).toHaveLength(2);
		expect(subscribedBy.find((s) => s.topic === "session:alice")?.identity).toBe("user-alice");
		expect(subscribedBy.find((s) => s.topic === "session:bob")?.identity).toBe("user-bob");
	});
});
