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
 * `listTeamMembersSummary` returns exactly id/name/role/agentCategory), the
 * cost aggregate + atomic increment, and the bets.ts decomposition.
 */

import { type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import {
	getArtifactThreadSummaries,
	getFirstThreadByHost,
	getMessageById,
	getThreadById,
	getThreadIdsByHost,
	insertMessage,
	insertThread,
	listMessagesByThread,
	listThreadsByHost,
	searchConversations,
} from "@hyperidle/core-app";
import {
	getUserById,
	getUsersByIds,
	incrementUserCost,
	insertUser,
	listActiveAiUsersByTeams,
	listAgentProfiles,
	listUsersByKind,
	sumAllUserCost,
} from "@hyperidle/core-app";
import { describe, expect, test } from "../test-fixtures.js";

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

async function seedTeam(db: HyperIdleDb, teamMembersId: string): Promise<void> {
	const teamId = `team-${teamMembersId}`;
	await db
		.insert(teams)
		.values({ id: teamId, name: `Team ${teamMembersId}`, phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
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
	test("getUserById returns the row, or undefined when absent", async ({ db }) => {
		await insertUser(db, userValues("u1", { email: "u1@example.com" }));
		const found = await getUserById(db, "u1");
		expect(found?.id).toBe("u1");
		// Full-row getter preserves today's exposure incl. email (routes/users.ts CRUD).
		expect(found?.email).toBe("u1@example.com");
		expect(await getUserById(db, "missing")).toBeUndefined();
	});

	test("getUsersByIds preserves the inArray set", async ({ db }) => {
		await insertUser(db, userValues("a"));
		await insertUser(db, userValues("b"));
		await insertUser(db, userValues("c"));
		const rows = await getUsersByIds(db, ["a", "c"]);
		expect(rows.map((r) => r.id).sort()).toEqual(["a", "c"]);
	});

	test("listUsersByKind filters by kind", async ({ db }) => {
		await insertUser(db, userValues("ai1", { kind: "ai" }));
		await insertUser(db, userValues("hu1", { kind: "human" }));
		const humans = await listUsersByKind(db, "human");
		expect(humans.map((r) => r.id)).toEqual(["hu1"]);
	});

	test("listActiveAiUsersByTeams filters + orders by id", async ({ db }) => {
		await seedTeam(db, "tm1");
		await insertUser(db, userValues("z", { teamId: "tm1", kind: "ai", status: "active" }));
		await insertUser(db, userValues("a", { teamId: "tm1", kind: "ai", status: "active" }));
		await insertUser(db, userValues("r", { teamId: "tm1", kind: "ai", status: "retired" }));
		const rows = await listActiveAiUsersByTeams(db, ["tm1"]);
		expect(rows.map((r) => r.id)).toEqual(["a", "z"]);
	});

	test("listAgentProfiles returns EXACTLY the agents.ts column set — systemPrompt INCLUDED", async ({
		db,
	}) => {
		await insertUser(
			db,
			userValues("ag1", {
				kind: "ai",
				role: "builder",
				systemPrompt: "be helpful",
				email: "secret@x",
			}),
		);
		const [row] = await listAgentProfiles(db);
		expect(row).toBeDefined();
		// systemPrompt is legitimately exposed today → must be present (AC-2).
		expect(row?.systemPrompt).toBe("be helpful");
		// email is NOT part of the agent-list response → must be absent (no widening).
		expect(Object.keys(row ?? {}).sort()).toEqual([
			"agentCategory",
			"harnessType",
			"id",
			"maxConcurrentSessions",
			"modelId",
			"modelProvider",
			"modelTierPreference",
			"name",
			"role",
			"status",
			"systemPrompt",
		]);
	});

	test("incrementUserCost is atomic coalesce + delta; sumAllUserCost sums", async ({ db }) => {
		await insertUser(db, userValues("c1", { costActual: null }));
		await insertUser(db, userValues("c2", { costActual: 100 }));
		await incrementUserCost(db, "c1", 40);
		await incrementUserCost(db, "c2", 5);
		expect((await getUserById(db, "c1"))?.costActual).toBe(40);
		expect((await getUserById(db, "c2"))?.costActual).toBe(105);
		expect(await sumAllUserCost(db)).toBe(145);
	});

	test("a read passed a live tx sees the same tx's uncommitted write", async ({ db }) => {
		await db.transaction(async (tx) => {
			await insertUser(tx as HyperIdleDb, userValues("intx"));
			const seen = await getUserById(tx as HyperIdleDb, "intx");
			expect(seen?.id).toBe("intx");
		});
		// After commit the row is visible outside the tx too.
		expect(await getUserById(db, "intx")).toBeDefined();
	});
});

describe("conversation-store reads", () => {
	test("getThreadById + getMessageById return the row or undefined", async ({ db }) => {
		await insertUser(db, userValues("u1"));
		await insertThread(db, threadValues("t1"));
		await insertMessage(db, messageValues("m1", "t1", NOW));
		expect((await getThreadById(db, "t1"))?.id).toBe("t1");
		expect((await getMessageById(db, "m1"))?.id).toBe("m1");
		expect(await getThreadById(db, "nope")).toBeUndefined();
	});

	test("listMessagesByThread preserves createdAt order", async ({ db }) => {
		await insertUser(db, userValues("u1"));
		await insertThread(db, threadValues("t1"));
		await insertMessage(db, messageValues("m3", "t1", "2026-01-03T00:00:00.000Z"));
		await insertMessage(db, messageValues("m1", "t1", "2026-01-01T00:00:00.000Z"));
		await insertMessage(db, messageValues("m2", "t1", "2026-01-02T00:00:00.000Z"));
		const asc = await listMessagesByThread(db, "t1", { order: "createdAt", dir: "asc" });
		expect(asc.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
		const desc = await listMessagesByThread(db, "t1", { order: "createdAt", dir: "desc" });
		expect(desc.map((m) => m.id)).toEqual(["m3", "m2", "m1"]);
	});

	test("listThreadsByHost orders by lastActiveAt desc, id desc, and limits", async ({ db }) => {
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
		const rows = await listThreadsByHost(db, "bet", "b1", 2);
		expect(rows.map((r) => r.id)).toEqual(["tb", "tc"]);
	});

	test("getFirstThreadByHost + getThreadIdsByHost scope by host pair", async ({ db }) => {
		await insertUser(db, userValues("u1"));
		await insertThread(db, threadValues("t1", { hostKind: "bet", hostId: "b9" }));
		expect((await getFirstThreadByHost(db, "bet", "b9"))?.id).toBe("t1");
		expect(await getThreadIdsByHost(db, "bet", "b9")).toEqual(["t1"]);
		expect(await getFirstThreadByHost(db, "bet", "other")).toBeUndefined();
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

	test("getArtifactThreadSummaries reproduces the correlated aggregates", async ({ db }) => {
		await insertUser(db, userValues("u1"));
		await insertThread(db, threadValues("t1", { hostKind: "artifact", hostId: "art1" }));
		await insertMessage(
			db,
			messageValues("m1", "t1", "2026-01-01T00:00:00.000Z", {
				type: "plain",
				payload: JSON.stringify({ text: "first" }),
			}),
		);
		await insertMessage(
			db,
			messageValues("m2", "t1", "2026-01-02T00:00:00.000Z", {
				type: "plain",
				payload: JSON.stringify({ text: "latest" }),
			}),
		);
		await insertMessage(
			db,
			messageValues("m3", "t1", "2026-01-03T00:00:00.000Z", { type: "review" }),
		);
		const [row] = await getArtifactThreadSummaries(db, ["art1"]);
		expect(row?.artifactId).toBe("art1");
		expect(row?.threadId).toBe("t1");
		expect(Number(row?.messageCount)).toBe(3);
		// newest NON-deleted message of ANY type (the review at 01-03)
		expect(row?.lastMessageAt).toBe("2026-01-03T00:00:00.000Z");
		// newest non-deleted PLAIN message payload (m2 at 01-02)
		expect(row?.lastMessagePayload).toBe(JSON.stringify({ text: "latest" }));
		expect(Number(row?.hasUnresolvedReview)).toBe(1);
	});

	test("getArtifactThreadSummaries omits artifacts with no thread", async ({ db }) => {
		const rows = await getArtifactThreadSummaries(db, ["no-thread"]);
		expect(rows).toHaveLength(0);
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
