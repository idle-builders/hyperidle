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
import type { WriteExecutor } from "@hyperidle/db";
import { sessions, threads as threadsTable, users } from "@hyperidle/db";
import { getTeamMembers } from "@hyperidle/org";
import { findUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { describe, expect } from "vitest";
import { test } from "../test-fixtures.js";
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

/** Real Mechanism C deps — mirrors `server-factory.ts`'s production wiring. */
const REALTIME_DEPS: SubscribeAuthorizerDeps = {
	conversation: { getThreadById: (db, id) => findThread(db, { id }) },
	users: { getUserById: (db, id) => findUser(db, { id }) },
	org: { getTeamMembersById: (db, id) => getTeamMembers(db, { id }) },
	work: { getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id) },
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

	test("global topics (`conversations`, `work`) accept any identity", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "agent-2");

		expect(await hub.subscribe(client, "conversations")).toBe("ok");
		expect(await hub.subscribe(client, "work")).toBe("ok");
	});

	test("subscribe to a non-existent thread → forbidden", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "agent-1");

		expect(await hub.subscribe(client, "thread:does-not-exist")).toBe("forbidden");
	});

	/**
	 * AU26 C3 (§7 "WS subscribe authorization"): the `realtime` package
	 * dissolved into `core-api`'s Layer transport. The authorizer moved
	 * VERBATIM, so its fail-closed semantics must be observable after the move:
	 * an unknown session denies. Sanity-broken during C3 by flipping
	 * `if (!sessionRow) return false` to `return true` — this case, and only
	 * this case, went red.
	 */
	test("subscribe to session:<nonexistent> → forbidden (fail-closed)", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "agent-1");

		expect(await hub.subscribe(client, "session:no-such-session")).toBe("forbidden");
		// An empty session id is denied too — not treated as "any session".
		expect(await hub.subscribe(client, "session:")).toBe("forbidden");
	});

	test("subscribe to malformed topic prefix → forbidden", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "agent-1");

		expect(await hub.subscribe(client, "evil:thr-1")).toBe("forbidden");
	});

	test("task-free assistant session topic is limited to thread participants", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const now = new Date().toISOString();
		await db.insert(users).values([
			{
				id: "u-founder",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "u-outsider",
				kind: "human",
				name: "Outsider",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "ast-u-founder",
				kind: "ai",
				name: "Assistant",
				role: "assistant",
				status: "active",
				createdAt: now,
			},
		]);
		await db.insert(threadsTable).values({
			id: "thr-assistant",
			hostKind: "assistant",
			hostId: "u-founder",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder", "ast-u-founder"]),
			pinned: false,
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(sessions).values({
			id: "session-task-free-assistant",
			taskId: null,
			requestId: "request-assistant",
			sourceKind: "assistant",
			sourceId: "msg-1",
			sourceCorrelationJson: JSON.stringify({
				threadId: "thr-assistant",
				messageId: "msg-1",
				userId: "u-founder",
				assistantAgentId: "ast-u-founder",
			}),
			agentId: "ast-u-founder",
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
		});

		const participant = createMockClient();
		const outsider = createMockClient();
		hub.addClient(participant, "u-founder");
		hub.addClient(outsider, "u-outsider");

		expect(await hub.subscribe(participant, "session:session-task-free-assistant")).toBe("ok");
		expect(await hub.subscribe(outsider, "session:session-task-free-assistant")).toBe("forbidden");
	});
});
