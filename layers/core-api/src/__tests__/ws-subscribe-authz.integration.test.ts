/**
 * L1a step9 — WsConnectionHub subscribe-authz unit tests.
 *
 * Adv-C1 / Plan §6.2 contract:
 *  - global topics (`conversations`, `work`) accept any authenticated identity.
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
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
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

async function seedThread(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{ threadId: string; participantId: string; nonParticipantId: string }> {
	const now = new Date().toISOString();
	const threadId = ids("thr-1");
	const participantId = ids("agent-1");
	const nonParticipantId = ids("agent-2");
	const founderId = ids("u-founder");
	await db.insert(threadsTable).values({
		id: threadId,
		hostKind: "task",
		hostId: ids("task-1"),
		initiatorId: founderId,
		participants: JSON.stringify([founderId, participantId]),
		pinned: false,
		lastActiveAt: now,
		createdAt: now,
	});
	return { threadId, participantId, nonParticipantId };
}

describe("WsConnectionHub — subscribe authorization (L1 Adv-C1)", () => {
	test("participant subscribe to thread:<id> → ok", async ({ db, ids }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const { threadId, participantId } = await seedThread(db, ids);

		const client = createMockClient();
		hub.addClient(client, participantId);

		const result = await hub.subscribe(client, `thread:${threadId}`);
		expect(result).toBe("ok");
	});

	test("non-participant subscribe to thread:<id> → forbidden, no broadcasts delivered", async ({
		db,
		ids,
	}) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const { threadId, nonParticipantId } = await seedThread(db, ids);

		const client = createMockClient();
		hub.addClient(client, nonParticipantId);

		const result = await hub.subscribe(client, `thread:${threadId}`);
		expect(result).toBe("forbidden");

		// Confirm the rejected client never joined the topic set — a
		// subsequent direct push to it must skip them.
		hub.broadcast(
			`thread:${threadId}`,
			JSON.stringify({
				type: "update",
				topic: `thread:${threadId}`,
				kind: "thread_message_appended",
			}),
		);

		expect(client.messages).toEqual([]);
	});

	test("subscribe with no bound identity → forbidden for thread topics", async ({ db, ids }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const { threadId } = await seedThread(db, ids);

		const client = createMockClient();
		hub.addClient(client); // no senderId

		const result = await hub.subscribe(client, `thread:${threadId}`);
		expect(result).toBe("forbidden");
	});

	test("global topics (`conversations`, `work`) accept any identity", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "agent-2");

		expect(await hub.subscribe(client, "conversations")).toBe("ok");
		expect(await hub.subscribe(client, "work")).toBe("ok");
	});

	test("subscribe to a non-existent thread → forbidden", async ({ db, ids }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, ids("agent-1"));

		expect(await hub.subscribe(client, `thread:${ids("does-not-exist")}`)).toBe("forbidden");
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
	test("session topics are not served by core's socket", async ({ db, ids }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, ids("agent-1"));

		expect(await hub.subscribe(client, "session:any-session")).toBe("forbidden");
		expect(await hub.subscribe(client, "session:")).toBe("forbidden");
	});

	test("subscribe to malformed topic prefix → forbidden", async ({ db, ids }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, ids("agent-1"));

		expect(await hub.subscribe(client, "evil:thr-1")).toBe("forbidden");
	});
});
