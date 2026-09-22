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

import {
	documents as documentsTable,
	type HyperIdleDb,
	teams as teamsTable,
	threads as threadsTable,
	users as usersTable,
} from "@hyperidle/db";
import { getDocument } from "@hyperidle/document";
import { findThread } from "@hyperidle/thread";
import { findUser, listUsers } from "@hyperidle/users";
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
 * Real Mechanism C deps — mirrors `create-server.ts`'s production wiring
 * (`boot.ts`'s own `createDbSubscribeAuthorizer` call).
 *
 * @lore AU26 J3: was four ports, then three once `session:<id>` moved to
 * `agent-orchestration`'s (deleted) second socket — `org`/`work` only ever
 * served that branch. `document`/`users` are new —
 * `users` back for `document:<id>`'s subject resolution, not the session-team
 * check AU26 removed. `session:<id>` folding back onto this authorizer needs
 * no port at all — it admits on identity alone.
 */
const REALTIME_DEPS: SubscribeAuthorizerDeps = {
	conversation: { getThreadById: (db: HyperIdleDb, id: string) => findThread(db, { id }) },
	document: {
		getForSubscribe: async (db: HyperIdleDb, id: string) =>
			(await getDocument(db, id)) ?? undefined,
	},
	users: {
		getUserById: (db: HyperIdleDb, id: string) => findUser(db, { id }),
		listOwnedBy: (db: HyperIdleDb, ownerId: string) => listUsers(db, { ownerUserId: ownerId }),
	},
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

	/**
	 * @lore BC3 bug fix: `canReadThread`'s host-scoped bypass (`team`/
	 * `document`/`factory` hosts admit any signed-in identity, not just
	 * listed `participants`) must be mirrored by the WS authorizer — this is
	 * what a task's (team-hosted, BC3) thread relies on for every team member
	 * who never explicitly posted to it.
	 */
	test("non-participant subscribe to a team-hosted thread:<id> → ok (host-scoped bypass)", async ({
		db,
	}) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const now = new Date().toISOString();
		await db.insert(threadsTable).values({
			id: "thr-team-1",
			hostKind: "team",
			hostId: "team-1",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder"]),
			pinned: false,
			lastActiveAt: now,
			createdAt: now,
		});

		const client = createMockClient();
		hub.addClient(client, "not-a-participant");

		const result = await hub.subscribe(client, "thread:thr-team-1");
		expect(result).toBe("ok");
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
	 * @lore AU26 J3, superseded: `session:<id>` folds back onto core's socket —
	 * the live-run stream still lives and is read entirely inside
	 * `agent-orchestration`, which only ever hands this socket a content-free
	 * nudge, so admitting the topic here reads no orchestration table. Any
	 * signed-in identity is enough, exactly what the deleted second socket's
	 * own authorizer already granted; an empty id still denies.
	 */
	test("session:<id> admits any signed-in identity, with no table read", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "agent-1");

		expect(await hub.subscribe(client, "session:any-session")).toBe("ok");
		expect(await hub.subscribe(client, "session:")).toBe("forbidden");
	});

	test("subscribe to malformed topic prefix → forbidden", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "agent-1");

		expect(await hub.subscribe(client, "evil:thr-1")).toBe("forbidden");
	});
});

/**
 * architecture.md §7: `document:<id>` and `documents` — the subscribe rule is
 * exactly `canReadDocument`, the same pure predicate `open_document` reads
 * through. An earlier bug report on this file (host-scoped bypass silently
 * refused) is exactly the divergence this shared predicate avoids.
 */
describe("WsConnectionHub — document subscribe authorization (architecture.md §7)", () => {
	const now = "2026-06-01T00:00:00.000Z";

	function docValues(overrides: Partial<typeof documentsTable.$inferInsert> & { id: string }) {
		return {
			scopeKind: "factory",
			scopeId: null,
			title: "Untitled",
			body: "body",
			format: "markdown",
			status: "active",
			slot: "ordinary",
			parentKind: null,
			parentId: null,
			position: 0,
			updatedBy: "seed",
			createdAt: now,
			updatedAt: now,
			...overrides,
		};
	}

	async function seedUser(db: HyperIdleDb, id: string, overrides: Record<string, unknown> = {}) {
		await db.insert(usersTable).values({
			id,
			kind: "human",
			name: id,
			role: "member",
			status: "active",
			createdAt: now,
			...overrides,
		});
	}

	test("an artifact (task-parented) document admits any signed-in identity", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		await db
			.insert(documentsTable)
			.values(docValues({ id: "doc-artifact-1", parentKind: "task", parentId: "task-1" }));
		const client = createMockClient();
		hub.addClient(client, "anyone-signed-in");

		expect(await hub.subscribe(client, "document:doc-artifact-1")).toBe("ok");
	});

	test("a private memory admits its owner, refuses a stranger, no frame delivered", async ({
		db,
	}) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		await seedUser(db, "memory-owner");
		await seedUser(db, "memory-stranger");
		await db.insert(documentsTable).values(
			docValues({
				id: "doc-memory-1",
				scopeKind: "user",
				scopeId: "memory-owner",
				slot: "ordinary",
			}),
		);

		const ownerClient = createMockClient();
		hub.addClient(ownerClient, "memory-owner");
		expect(await hub.subscribe(ownerClient, "document:doc-memory-1")).toBe("ok");

		const strangerClient = createMockClient();
		hub.addClient(strangerClient, "memory-stranger");
		expect(await hub.subscribe(strangerClient, "document:doc-memory-1")).toBe("forbidden");

		hub.broadcast(
			"document:doc-memory-1",
			JSON.stringify({ type: "update", topic: "document:doc-memory-1", kind: "document.changed" }),
		);
		expect(strangerClient.messages).toEqual([]);
	});

	test("an agent's memory admits the agent's owner — the owned-agent subject list", async ({
		db,
	}) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		await seedUser(db, "agent-owner-1");
		await seedUser(db, "owned-agent-1", {
			kind: "ai",
			role: "assistant",
			agentCategory: "individual",
			ownerUserId: "agent-owner-1",
		});
		await db
			.insert(documentsTable)
			.values(docValues({ id: "doc-agent-memory-1", scopeKind: "user", scopeId: "owned-agent-1" }));

		const client = createMockClient();
		hub.addClient(client, "agent-owner-1");
		expect(await hub.subscribe(client, "document:doc-agent-memory-1")).toBe("ok");
	});

	test("a team-scoped document admits only that team's own viewer", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		await db.insert(teamsTable).values({
			id: "team-doc-1",
			name: "team-doc-1",
			phase: "build",
			createdAt: now,
		});
		await db.insert(teamsTable).values({
			id: "team-doc-other",
			name: "team-doc-other",
			phase: "build",
			createdAt: now,
		});
		await seedUser(db, "team-member-1", { teamId: "team-doc-1" });
		await seedUser(db, "other-team-member-1", { teamId: "team-doc-other" });
		await db
			.insert(documentsTable)
			.values(docValues({ id: "doc-team-1", scopeKind: "team", scopeId: "team-doc-1" }));

		const memberClient = createMockClient();
		hub.addClient(memberClient, "team-member-1");
		expect(await hub.subscribe(memberClient, "document:doc-team-1")).toBe("ok");

		const otherClient = createMockClient();
		hub.addClient(otherClient, "other-team-member-1");
		expect(await hub.subscribe(otherClient, "document:doc-team-1")).toBe("forbidden");
	});

	test("the global `documents` topic accepts any identity", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "anyone-signed-in");

		expect(await hub.subscribe(client, "documents")).toBe("ok");
	});

	test("subscribe to a non-existent document → forbidden", async ({ db }) => {
		const hub = new WsConnectionHub(createDbSubscribeAuthorizer(db, REALTIME_DEPS));
		const client = createMockClient();
		hub.addClient(client, "anyone-signed-in");

		expect(await hub.subscribe(client, "document:does-not-exist")).toBe("forbidden");
	});
});
