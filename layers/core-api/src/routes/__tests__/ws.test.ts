/**
 * `GET /api/ws` — the pre-auth identity handoff between the token-consuming
 * middleware and `onOpen`.
 *
 */

import type { UpgradeTokenStore } from "@hyperidle/user";
import { Hono } from "hono";
import { defineWebSocketHelper } from "hono/ws";
import { describe, expect, it } from "vitest";
import { WsConnectionHub } from "../../ws-connection-hub.js";
import { registerWsRoute } from "../ws.js";

/** A one-shot store with the same contract as `@hyperidle/user`'s real one. */
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

type Events = Parameters<Parameters<typeof defineWebSocketHelper>[0]>[1];

/** Opens one fake socket per token and hands back its events, so a test can drive it. */
function socketsFor(
	relaySignal: (from: string, huddleId: string, to: string) => Promise<boolean>,
	onIdentityDisconnect: (identity: string) => void,
) {
	const opened: Array<{ events: Events; ws: unknown; sent: string[] }> = [];
	const upgrade = defineWebSocketHelper((c, events) => {
		const sent: string[] = [];
		const ws = { send: (d: string) => sent.push(d), close: () => undefined };
		events.onOpen?.(new Event("open"), ws as never);
		opened.push({ events, ws, sent });
		return c.newResponse("upgraded");
	});
	const api = new Hono();
	registerWsRoute(
		api,
		createStore(
			new Map([
				["alice-1", "user-alice"],
				["alice-2", "user-alice"],
				["bob", "user-bob"],
			]),
		),
		upgrade,
		new WsConnectionHub({ canSubscribe: () => Promise.resolve(true) }),
		relaySignal,
		onIdentityDisconnect,
	);
	return {
		open: async (token: string) => {
			await api.request(`/ws?token=${token}`);
			const socket = opened.at(-1);
			if (!socket) throw new Error("socket did not open");
			return {
				sent: socket.sent,
				say: (msg: unknown) =>
					socket.events.onMessage?.({ data: JSON.stringify(msg) } as never, socket.ws as never),
				close: () => socket.events.onClose?.({} as never, socket.ws as never),
			};
		},
	};
}

describe("core-api socket — huddle call signals", () => {
	it("relays as the socket's own identity and refuses what the relay denies", async () => {
		const asked: string[] = [];
		const { open } = socketsFor(
			async (from, _huddleId, to) => {
				asked.push(`${from}->${to}`);
				return to === "user-bob";
			},
			() => undefined,
		);
		const alice = await open("alice-1");

		await alice.say({ type: "signal", from: "user-mallory", huddleId: "h1", to: "user-bob" });
		await alice.say({ type: "signal", huddleId: "h1", to: "user-carol" });

		expect(asked).toEqual(["user-alice->user-bob", "user-alice->user-carol"]);
		expect(alice.sent.filter((m) => m.includes("signal_denied"))).toEqual([
			JSON.stringify({ type: "signal_denied", huddleId: "h1" }),
		]);
	});

	it("takes a person out only when their last socket closes", async () => {
		const gone: string[] = [];
		const { open } = socketsFor(
			async () => true,
			(identity) => gone.push(identity),
		);
		const first = await open("alice-1");
		const second = await open("alice-2");

		first.close();
		expect(gone).toEqual([]);
		second.close();
		expect(gone).toEqual(["user-alice"]);
	});
});
