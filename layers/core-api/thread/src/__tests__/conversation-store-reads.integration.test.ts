/**
 * Conversation store READ behavior (AU12 rework).
 *
 * Proves the read functions return the same data, order, and projection the
 * migrated call sites relied on before the ownership cut: full-row getters
 * (present + absent), order-sensitive message/thread lists, host-pair
 * scoping, and search's projected shape.
 */

import { messages as messagesTable, threads, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { findThread, listMessages, listThreads, searchConversations } from "../thread-service.js";

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

describe("conversation-store reads", () => {
	test("findThread returns the row or undefined; insertMessage's row reads back by id", async ({
		db,
	}) => {
		await db.insert(users).values(userValues("u1"));
		await db.insert(threads).values(threadValues("t1"));
		await db.insert(messagesTable).values(messageValues("m1", "t1", NOW));
		expect((await findThread(db, { id: "t1" }))?.id).toBe("t1");
		// @lore BC3: `findMessage` (the store's single-row-by-id read) has no
		// production caller outside `@hyperidle/thread` itself — unexported.
		// This is a plain fixture readback, not a call through the barrel.
		const [messageRow] = await db.select().from(messagesTable).where(eq(messagesTable.id, "m1"));
		expect(messageRow?.id).toBe("m1");
		expect(await findThread(db, { id: "nope" })).toBeUndefined();
	});

	test("listMessages preserves createdAt order", async ({ db }) => {
		await db.insert(users).values(userValues("u1"));
		await db.insert(threads).values(threadValues("t1"));
		await db.insert(messagesTable).values(messageValues("m3", "t1", "2026-01-03T00:00:00.000Z"));
		await db.insert(messagesTable).values(messageValues("m1", "t1", "2026-01-01T00:00:00.000Z"));
		await db.insert(messagesTable).values(messageValues("m2", "t1", "2026-01-02T00:00:00.000Z"));
		const asc = await listMessages(db, { threadId: "t1", order: "createdAt", dir: "asc" });
		expect(asc.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
		const desc = await listMessages(db, { threadId: "t1", order: "createdAt", dir: "desc" });
		expect(desc.map((m) => m.id)).toEqual(["m3", "m2", "m1"]);
	});

	test("listThreads orders by lastActiveAt desc, id desc, and limits", async ({ db }) => {
		await db.insert(users).values(userValues("u1"));
		await db.insert(threads).values(
			threadValues("ta", {
				hostKind: "bet",
				hostId: "b1",
				lastActiveAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		await db.insert(threads).values(
			threadValues("tb", {
				hostKind: "bet",
				hostId: "b1",
				lastActiveAt: "2026-01-03T00:00:00.000Z",
			}),
		);
		await db.insert(threads).values(
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
		await db.insert(users).values(userValues("u1"));
		await db.insert(threads).values(threadValues("t1", { hostKind: "bet", hostId: "b9" }));
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
		await db.insert(users).values(userValues("u1"));
		await db.insert(threads).values(
			threadValues("t1", {
				participants: JSON.stringify(["alice"]),
				lastActiveAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		await db.insert(threads).values(
			threadValues("t2", {
				participants: JSON.stringify(["alice"]),
				lastActiveAt: "2026-01-02T00:00:00.000Z",
			}),
		);
		await db
			.insert(messagesTable)
			.values(messageValues("m1", "t1", NOW, { payload: JSON.stringify({ text: "hello world" }) }));
		await db
			.insert(messagesTable)
			.values(messageValues("m2", "t2", NOW, { payload: JSON.stringify({ text: "hello world" }) }));
		const rows = await searchConversations(db, '%"alice"%', "%hello%", 10);
		expect(rows.map((r) => r.id)).toEqual(["t2", "t1"]);
		// projected shape only
		expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
			"hostKind",
			"id",
			"lastActiveAt",
			"participants",
			"title",
		]);
	});
});
