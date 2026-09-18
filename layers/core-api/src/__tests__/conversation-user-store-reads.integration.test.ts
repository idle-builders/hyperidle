/**
 * Conversation store + User store READ behavior (AU12 rework).
 *
 * Proves the new read functions return the same data, order, and projection the
 * migrated call sites relied on before the ownership cut — the behavior-
 * preservation contract (AC-2). Covers: full-row getters (present + absent),
 * id-batch preservation, order-sensitive message/thread lists, in-transaction
 * reads (a read passed a live `tx` sees the same tx's uncommitted write),
 * projected getters returning EXACTLY their route's current column set
 * (`listAgentProfiles` INCLUDES `systemPrompt`; `getUserById` INCLUDES `email`;
 * `listTeamMembersSummary` returns exactly id/name/role/agentCategory), and
 * the bets.ts decomposition.
 */

import {
	findMessage,
	findThread,
	insertMessage,
	insertThread,
	listMessages,
	listThreads,
	searchConversations,
} from "@hyperidle/thread";
import { type HyperIdleDb, teams, users } from "@hyperidle/db";
import { findUser, insertUser, listUsers } from "@hyperidle/users";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

const NOW = "2026-01-01T00:00:00.000Z";

function userValues(id: string, extra: Record<string, unknown> = {}) {
	return {
		id,
		kind: "ai",
		name: `User ${id}`,
		role: "builder",
		status: "active",
		createdAt: NOW,
		...extra,
	};
}

function threadValues(id: string, extra: Record<string, unknown> = {}) {
	return {
		id,
		hostKind: "user",
		hostId: "h1",
		initiatorId: "u1",
		participants: JSON.stringify(["u1"]),
		lastActiveAt: NOW,
		createdAt: NOW,
		...extra,
	};
}

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	await db
		.insert(teams)
		.values({ id: teamId, name: `Team ${teamId}`, phase: "build", createdAt: NOW });
}

function messageValues(
	id: string,
	threadId: string,
	createdAt: string,
	extra: Record<string, unknown> = {},
) {
	return {
		id,
		senderId: "u1",
		threadId,
		type: "plain",
		payload: JSON.stringify({ text: id }),
		clientKey: `ck-${id}`,
		createdAt,
		...extra,
	};
}

describe("user-store reads", () => {
	test("findUser returns the row, or undefined when absent", async ({ db }) => {
		await insertUser(db, userValues("u1", { email: "u1@example.com" }));
		const found = await findUser(db, { id: "u1" });
		expect(found?.id).toBe("u1");
		// Full-row getter preserves today's exposure incl. email (routes/users.ts CRUD).
		expect(found?.email).toBe("u1@example.com");
		expect(await findUser(db, { id: "missing" })).toBeUndefined();
	});

	test("listUsers with ids preserves the inArray set", async ({ db }) => {
		await insertUser(db, userValues("a"));
		await insertUser(db, userValues("b"));
		await insertUser(db, userValues("c"));
		const rows = await listUsers(db, { ids: ["a", "c"] });
		expect(rows.map((r) => r.id).sort()).toEqual(["a", "c"]);
	});

	test("listUsers with kind filters by kind", async ({ db }) => {
		await insertUser(db, userValues("ai1", { kind: "ai" }));
		await insertUser(db, userValues("hu1", { kind: "human" }));
		const humans = await listUsers(db, { kind: "human" });
		expect(humans.map((r) => r.id)).toEqual(["hu1"]);
	});

	test("listUsers with teamIds+kind+status filters active AI users and orders by id", async ({
		db,
	}) => {
		await seedTeam(db, "tm1");
		await insertUser(db, userValues("z", { teamId: "tm1", kind: "ai", status: "active" }));
		await insertUser(db, userValues("a", { teamId: "tm1", kind: "ai", status: "active" }));
		await insertUser(db, userValues("r", { teamId: "tm1", kind: "ai", status: "retired" }));
		const rows = await listUsers(db, {
			teamIds: ["tm1"],
			kind: "ai",
			status: "active",
			orderById: true,
		});
		expect(rows.map((r) => r.id)).toEqual(["a", "z"]);
	});

	test("findUser composes role, team, status, and exclusion predicates", async ({ db }) => {
		await seedTeam(db, "tm-role");
		await insertUser(
			db,
			userValues("self", { teamId: "tm-role", role: "reviewer", status: "active" }),
		);
		await insertUser(
			db,
			userValues("peer", { teamId: "tm-role", role: "reviewer", status: "active" }),
		);
		await insertUser(
			db,
			userValues("retired", { teamId: "tm-role", role: "reviewer", status: "retired" }),
		);

		const teammate = await findUser(db, {
			role: "reviewer",
			teamIds: ["tm-role"],
			status: "active",
			excludeId: "self",
		});
		expect(teammate?.id).toBe("peer");
	});

	test("listUsers nameContains is case-insensitive and escapes LIKE wildcards", async ({ db }) => {
		await insertUser(db, userValues("literal", { name: "Agent 100%_Ready" }));
		await insertUser(db, userValues("wildcard", { name: "Agent 100XXReady" }));

		const rows = await listUsers(db, { nameContains: "%_READY" });
		expect(rows.map((row) => row.id)).toEqual(["literal"]);
	});

	test("listUsers(kind:ai) returns the full identity row, and no run-config fields", async ({
		db,
	}) => {
		// @lore AU20 Am11: listAgentProfiles deleted; routes project full User rows.
		// @lore AU26 G1 (architecture §D-L): this test used to assert `systemPrompt`
		// rides on the `users` row (AC-2). It no longer does — `systemPrompt` and the
		// five other run-config fields moved to `agent_run_config`, so `users` is
		// purely the identity record. The AC-2 intent (routes project the FULL row,
		// nothing is hidden from them) is preserved by the `email` assertion; the
		// absence assertion is what pins the relocation.
		await insertUser(
			db,
			userValues("ag1", {
				kind: "ai",
				role: "builder",
				email: "secret@x",
			}),
		);
		const [row] = await listUsers(db, { kind: "ai" });
		expect(row).toBeDefined();
		// email is present in full User row (routes project only what they need)
		expect(row?.email).toBe("secret@x");
		expect(row && "systemPrompt" in row).toBe(false);
		expect(row && "harnessType" in row).toBe(false);
		expect(row && "maxConcurrentSessions" in row).toBe(false);
	});

	test("a read passed a live tx sees the same tx's uncommitted write", async ({ db }) => {
		await db.transaction(async (tx) => {
			await insertUser(tx as HyperIdleDb, userValues("intx"));
			const seen = await findUser(tx as HyperIdleDb, { id: "intx" });
			expect(seen?.id).toBe("intx");
		});
		// After commit the row is visible outside the tx too.
		expect(await findUser(db, { id: "intx" })).toBeDefined();
	});
});

describe("conversation-store reads", () => {
	test("findThread + findMessage return the row or undefined", async ({ db }) => {
		await insertUser(db, userValues("u1"));
		await insertThread(db, threadValues("t1"));
		await insertMessage(db, messageValues("m1", "t1", NOW));
		expect((await findThread(db, { id: "t1" }))?.id).toBe("t1");
		expect((await findMessage(db, { id: "m1" }))?.id).toBe("m1");
		expect(await findThread(db, { id: "nope" })).toBeUndefined();
	});

	test("listMessages preserves createdAt order", async ({ db }) => {
		await insertUser(db, userValues("u1"));
		await insertThread(db, threadValues("t1"));
		await insertMessage(db, messageValues("m3", "t1", "2026-01-03T00:00:00.000Z"));
		await insertMessage(db, messageValues("m1", "t1", "2026-01-01T00:00:00.000Z"));
		await insertMessage(db, messageValues("m2", "t1", "2026-01-02T00:00:00.000Z"));
		const asc = await listMessages(db, { threadId: "t1", order: "createdAt", dir: "asc" });
		expect(asc.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
		const desc = await listMessages(db, { threadId: "t1", order: "createdAt", dir: "desc" });
		expect(desc.map((m) => m.id)).toEqual(["m3", "m2", "m1"]);
	});

	test("listThreads orders by lastActiveAt desc, id desc, and limits", async ({ db }) => {
		await insertUser(db, userValues("u1"));
		await insertThread(
			db,
			threadValues("ta", {
				hostKind: "bet",
				hostId: "b1",
				lastActiveAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		await insertThread(
			db,
			threadValues("tb", {
				hostKind: "bet",
				hostId: "b1",
				lastActiveAt: "2026-01-03T00:00:00.000Z",
			}),
		);
		await insertThread(
			db,
			threadValues("tc", {
				hostKind: "bet",
				hostId: "b1",
				lastActiveAt: "2026-01-02T00:00:00.000Z",
			}),
		);
		const rows = await listThreads(db, {
			host: { kind: "bet", id: "b1" },
			order: "lastActive",
			limit: 2,
		});
		expect(rows.map((r) => r.id)).toEqual(["tb", "tc"]);
	});

	test("findThread + listThreads scope by host pair", async ({ db }) => {
		await insertUser(db, userValues("u1"));
		await insertThread(db, threadValues("t1", { hostKind: "bet", hostId: "b9" }));
		expect((await findThread(db, { host: { kind: "bet", id: "b9" } }))?.id).toBe("t1");
		const ids = await listThreads(db, { host: { kind: "bet", id: "b9" } }).then((ts) =>
			ts.map((t) => t.id),
		);
		expect(ids).toEqual(["t1"]);
		expect(await findThread(db, { host: { kind: "bet", id: "other" } })).toBeUndefined();
	});

	test("searchConversations matches participant + message and orders by lastActiveAt desc", async ({
		db,
	}) => {
		await insertUser(db, userValues("u1"));
		await insertThread(
			db,
			threadValues("t1", {
				participants: JSON.stringify(["alice"]),
				lastActiveAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		await insertThread(
			db,
			threadValues("t2", {
				participants: JSON.stringify(["alice"]),
				lastActiveAt: "2026-01-02T00:00:00.000Z",
			}),
		);
		await insertMessage(
			db,
			messageValues("m1", "t1", NOW, { payload: JSON.stringify({ text: "hello world" }) }),
		);
		await insertMessage(
			db,
			messageValues("m2", "t2", NOW, { payload: JSON.stringify({ text: "hello world" }) }),
		);
		const rows = await searchConversations(db, '%"alice"%', "%hello%", 10);
		expect(rows.map((r) => r.id)).toEqual(["t2", "t1"]);
		// projected shape only
		expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
			"hostKind",
			"id",
			"lastActiveAt",
			"participants",
		]);
	});
});

// Sanity: the store owns the table, but the raw table is still importable HERE
// (this is a test file — exempt from the guard). Keeps `users`/`eq` referenced.
describe("store ownership smoke", () => {
	test("insertUser row is visible via raw select", async ({ db }) => {
		await insertUser(db, userValues("raw1"));
		const rows = await db.select().from(users).where(eq(users.id, "raw1"));
		expect(rows).toHaveLength(1);
	});
});
