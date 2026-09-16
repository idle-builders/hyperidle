/**
 * L1a step9 — WsConnectionHub subscribe-authz unit tests.
 *
 * Adv-C1 / Plan §6.2 contract:
 *  - global topics (`conversations`) accept any authenticated identity.
 *  - `thread:<id>` topics require `senderId ∈ thread.participants`.
 *  - subscribe returns `forbidden` on a non-participant attempt; the WS
 *    handler then sends a structured forbidden ack and DOES NOT join the
 *    topic. Subsequent broadcasts must skip the would-be subscriber.
 *
 * @lore AU21 §6 Decision L4 / §9 Increment 14d: renamed from `WsBroadcaster`
 * to `WsConnectionHub` — the class no longer takes an `EventBus` (the
 * generic forwarder it used to drive was deleted). These tests now call
 * `hub.broadcast()` directly to prove the transport/authz mechanics, instead
 * of emitting on an EventBus the hub no longer subscribes to.
 */

import { findThread } from "@hyperidle/conversation";
import { type HyperIdleDb, threads as threadsTable } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { type WsClient, WsConnectionHub } from "../ws-connection-hub.js";
import {
	createDbSubscribeAuthorizer,
	type SubscribeAuthorizerDeps,
} from "../ws-subscribe-authorizer.js";

function createMockClient(): WsClient & { messages: string[] } {
	const messages: string[] = [];
	return {
		messages,
		send(data: string) {
			messages.push(data);
		},
	};
}

/**
 * Real Mechanism C deps — mirrors `create-server.ts`'s production wiring.
 *
 * @lore AU26 J3: was four ports. `users`/`org`/`work` existed only to serve the
 * `session:<id>` branch, which moved wholesale to `agent-orchestration`'s own
 * socket. One edge is left: thread participation.
 */
const REALTIME_DEPS: SubscribeAuthorizerDeps = {
	conversation: { getThreadById: (db: HyperIdleDb, id: string) => findThread(db, { id }) },
};

describe("WsConnectionHub — subscribe authorization (L1 Adv-C1)", () => {
	test("participant subscribe to thread:<id> → ok", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		// Seed a thread
		const now = new Date().toISOString();
		await db.insert(threadsTable).values({
			id: "thr-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder", "agent-1"]),
			pinned: false,
			lastActiveAt: now,
			createdAt: now,
		});

		const client = createMockClient();
		hub.addClient(client, "agent-1");

		const result = await hub.subscribe(client, "thread:thr-1");
		expect(result).toBe("ok");
	});

	test("non-participant subscribe to thread:<id> → forbidden, no broadcasts delivered", async ({
		db,
	}) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const now = new Date().toISOString();
		await db.insert(threadsTable).values({
			id: "thr-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder", "agent-1"]),
			pinned: false,
			lastActiveAt: now,
			createdAt: now,
		});

		const client = createMockClient();
		hub.addClient(client, "agent-2");

		const result = await hub.subscribe(client, "thread:thr-1");
		expect(result).toBe("forbidden");

		// Confirm the rejected client never joined the topic set — a
		// subsequent direct push to it must skip them.
		hub.broadcast(
			"thread:thr-1",
			JSON.stringify({ type: "update", topic: "thread:thr-1", kind: "thread_message_appended" }),
		);

		expect(client.messages).toEqual([]);
	});

	test("subscribe with no bound identity → forbidden for thread topics", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const now = new Date().toISOString();
		await db.insert(threadsTable).values({
			id: "thr-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder", "agent-1"]),
			pinned: false,
			lastActiveAt: now,
			createdAt: now,
		});

		const client = createMockClient();
		hub.addClient(client); // no senderId

		const result = await hub.subscribe(client, "thread:thr-1");
		expect(result).toBe("forbidden");
	});

	test("global topics (`conversations`) accept any identity", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "agent-2");

		expect(await hub.subscribe(client, "conversations")).toBe("ok");
	});

	test("subscribe to a non-existent thread → forbidden", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "agent-1");

		expect(await hub.subscribe(client, "thread:does-not-exist")).toBe("forbidden");
	});

	/**
	 * @lore AU26 J3: core's socket no longer serves `session:<id>` AT ALL — the
	 * live-run stream is `agent-orchestration`'s, on its own socket, authorized
	 * from its own `sessions` table (see
	 * `agent-orchestration/src/services/__tests__/session-stream-hub.integration.test.ts`).
	 * A session topic on THIS hub falls through to the catch-all deny, exactly
	 * like any other unknown prefix. This case is what proves the branch left,
	 * rather than merely that its old fail-closed edge still held.
	 */
	test("session topics are not served by core's socket", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "agent-1");

		expect(await hub.subscribe(client, "session:any-session")).toBe("forbidden");
		expect(await hub.subscribe(client, "session:")).toBe("forbidden");
	});

	test("subscribe to malformed topic prefix → forbidden", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "agent-1");

		expect(await hub.subscribe(client, "evil:thr-1")).toBe("forbidden");
	});
});
