/**
 * `GET /api/ws` — the pre-auth identity handoff between the token-consuming
 * middleware and `onOpen`.
 *
 * @lore AU26 review W12, relocated: the deleted second websocket
 * (`agent-orchestration/src/routes/session-stream-ws.ts`) carried this exact
 * fix already — a `WeakMap<object, string>` keyed on the Hono `Context`
 * instead of a single module-scoped slot. Core's socket kept the older
 * single-slot shape, which the same race hits: the middleware is `async`,
 * so two upgrades in flight can run middleware(A) → middleware(B) →
 * onOpen(A), and A joins under B's identity — indistinguishable from the
 * right answer once a topic admits on identity alone (as `session:<id>`
 * now does on this very socket). This test proves the fix survived the
 * merge instead of being deleted with the file it was copied from.
 */

import type { UpgradeTokenStore } from "@hyperidle/users";
import { Hono } from "hono";
import { defineWebSocketHelper } from "hono/ws";
import { describe, expect, it } from "vitest";
import { WsConnectionHub } from "../../ws-connection-hub.js";
import { registerWsRoute } from "../ws.js";

/** A one-shot store with the same contract as `@hyperidle/users`'s real one. */
function createStore(tokens: Map<string, string | undefined>): UpgradeTokenStore {
	return {
		issue: () => {
			throw new Error("not used in this test");
		},
		consume(token) {
			if (!tokens.has(token)) return { ok: false };
			const identityId = tokens.get(token);
			tokens.delete(token);
			return identityId === undefined ? { ok: true } : { ok: true, identityId };
		},
	};
}

describe("core-api socket — two concurrent upgrades keep their own identities", () => {
	it("registers each socket under the identity of ITS OWN token", async () => {
		const subscribedBy: Array<{ identity: string; topic: string }> = [];
		const hub = new WsConnectionHub({
			canSubscribe: (identity, topic) => {
				subscribedBy.push({ identity, topic });
				return Promise.resolve(true);
			},
		});

		// Release both upgrades only after BOTH have cleared the middleware —
		// forces the exact interleave the race depends on.
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
		registerWsRoute(
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

		await Promise.all([api.request("/ws?token=alice"), api.request("/ws?token=bob")]);

		expect(subscribedBy).toHaveLength(2);
		expect(subscribedBy.find((s) => s.topic === "session:alice")?.identity).toBe("user-alice");
		expect(subscribedBy.find((s) => s.topic === "session:bob")?.identity).toBe("user-bob");
	});
});
