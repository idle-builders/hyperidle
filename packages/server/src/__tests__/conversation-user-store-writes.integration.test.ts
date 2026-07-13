/**
 * Conversation store + User store runtime behavior.
 *
 * Proves the two owning modules (conversation-store, user-store) write the
 * expected rows, that get-or-create is idempotent, that the verdict-race
 * resolve is first-wins, that bulk cost reset zeroes every row, and that a
 * write function passed a live `tx` participates in — and rolls back with —
 * the caller's transaction.
 */

import {
	findOrCreateDirectThread,
	getOrCreateUser,
	insertMessage,
	insertThread,
	insertUser,
	resetAllUserCost,
	resolveMessageIfUnresolved,
	updateThread,
	updateUser,
} from "@hyperidle/core-app";
import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../test-fixtures.js";

const NOW = new Date().toISOString();

function userValues(id: string, extra: Record<string, unknown> = {}) {
	return {
		id,
		kind: "ai",
		name: `User ${id}`,
		role: "builder",
		status: "idle",
		createdAt: NOW,
		...extra,
	};
}

function threadValues(id: string, initiatorId: string) {
	return {
		id,
		hostKind: "user",
		hostId: initiatorId,
		initiatorId,
		participants: JSON.stringify([initiatorId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	};
}

function messageValues(id: string, threadId: string, senderId: string) {
	return {
		id,
		senderId,
		threadId,
		type: "text",
		payload: JSON.stringify({ text: "hi" }),
		clientKey: `ck-${id}`,
		createdAt: NOW,
	};
}

describe("conversation-store row writes", () => {
	test("insertThread writes the row", async ({ db }) => {
		await insertUser(db, userValues("u1"));
		await insertThread(db, threadValues("t1", "u1"));
		const rows = await db.select().from(threads).where(eq(threads.id, "t1"));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.initiatorId).toBe("u1");
	});

	test("insertMessage writes the row", async ({ db }) => {
		await insertUser(db, userValues("u2"));
		await insertThread(db, threadValues("t2", "u2"));
		await insertMessage(db, messageValues("m2", "t2", "u2"));
		const rows = await db.select().from(messages).where(eq(messages.id, "m2"));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.threadId).toBe("t2");
	});

	test("updateThread applies a typed patch", async ({ db }) => {
		await insertUser(db, userValues("u3"));
		await insertThread(db, threadValues("t3", "u3"));
		await updateThread(db, "t3", { pinned: true });
		const [row] = await db.select().from(threads).where(eq(threads.id, "t3"));
		expect(row?.pinned).toBe(true);
	});

	test("resolveMessageIfUnresolved is first-wins", async ({ db }) => {
		await insertUser(db, userValues("u4"));
		await insertThread(db, threadValues("t4", "u4"));
		await insertMessage(db, messageValues("m4", "t4", "u4"));
		const first = await resolveMessageIfUnresolved(db, "m4", NOW);
		expect(first).toHaveLength(1);
		const second = await resolveMessageIfUnresolved(db, "m4", NOW);
		expect(second).toHaveLength(0);
	});

	test("findOrCreateDirectThread reuses the same thread", async ({ db }) => {
		await insertUser(db, userValues("u5a"));
		await insertUser(db, userValues("u5b", { kind: "human" }));
		const first = await findOrCreateDirectThread(db, "u5a", "u5b", NOW, "user");
		const second = await findOrCreateDirectThread(db, "u5a", "u5b", NOW, "user");
		expect(second).toBe(first);
	});
});

describe("user-store row writes", () => {
	test("insertUser writes the row", async ({ db }) => {
		await insertUser(db, userValues("us1"));
		const rows = await db.select().from(users).where(eq(users.id, "us1"));
		expect(rows).toHaveLength(1);
	});

	test("updateUser applies a typed patch", async ({ db }) => {
		await insertUser(db, userValues("us2"));
		await updateUser(db, "us2", { name: "Renamed" });
		const [row] = await db.select().from(users).where(eq(users.id, "us2"));
		expect(row?.name).toBe("Renamed");
	});

	test("getOrCreateUser creates once then returns existing", async ({ db }) => {
		const created = await getOrCreateUser(db, "us3", userValues("us3", { name: "First" }));
		expect(created.name).toBe("First");
		const again = await getOrCreateUser(db, "us3", userValues("us3", { name: "Second" }));
		expect(again.name).toBe("First");
		const rows = await db.select().from(users).where(eq(users.id, "us3"));
		expect(rows).toHaveLength(1);
	});

	test("resetAllUserCost zeroes every row", async ({ db }) => {
		await insertUser(db, userValues("us4", { costActual: 500 }));
		await insertUser(db, userValues("us5", { costActual: 900 }));
		await resetAllUserCost(db);
		const rows = await db.select().from(users);
		for (const row of rows) {
			expect(row.costActual).toBe(0);
		}
	});

	test("a store write inside a tx rolls back with the caller's transaction", async ({ db }) => {
		await expect(
			db.transaction(async (tx) => {
				await insertUser(tx as HyperIdleDb, userValues("us6"));
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");
		const rows = await db.select().from(users).where(eq(users.id, "us6"));
		expect(rows).toHaveLength(0);
	});
});
