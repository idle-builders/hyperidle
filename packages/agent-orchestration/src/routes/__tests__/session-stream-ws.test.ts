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
