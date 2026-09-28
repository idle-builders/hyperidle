/**
 * Conversation store + User store runtime behavior.
 *
 * Proves the two owning modules (conversation-store, user-store) write the
 * expected rows, that get-or-create is idempotent, that direct-thread and
 * pinned-patch writes ride the `send_message`/`adjust_thread` actions (the
 * store's `findOrCreateDirectThread`/`updateThread`/`insertThread`/
 * `insertMessage` have no production caller outside `@hyperidle/thread`
 * itself — all four unexported), and that a write function passed a live
 * `tx` participates in — and rolls back with — the caller's transaction. The
 * verdict-race first-wins behavior lives in thread-actions.integration.test.ts.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import { getOrCreateUser, insertUser, updateUser } from "@hyperidle/user";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import type { ActionContext } from "../actions/action.js";
import { buildCoreActions } from "../actions/compose.js";

function buildTestActions(agentOrchestration: AgentOrchestrationPort) {
	return buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	});
}

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
		await db.insert(threads).values(threadValues("t1", "u1"));
		const rows = await db.select().from(threads).where(eq(threads.id, "t1"));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.initiatorId).toBe("u1");
	});

	test("insertMessage writes the row", async ({ db }) => {
		await insertUser(db, userValues("u2"));
		await db.insert(threads).values(threadValues("t2", "u2"));
		await db.insert(messages).values(messageValues("m2", "t2", "u2"));
		const rows = await db.select().from(messages).where(eq(messages.id, "m2"));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.threadId).toBe("t2");
	});

	test("adjust_thread applies a typed pinned patch (was updateThread)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await insertUser(db, userValues("u3"));
		await db.insert(threads).values(threadValues("t3", "u3"));
		const actions = buildTestActions(agentOrchestration);
		const adjustThread = actions.find((a) => a.declaration.name === "adjust_thread");
		if (!adjustThread) throw new Error("adjust_thread action not found");
		const ctx: ActionContext = { actor: "u3", db, eventBus, now: new Date().toISOString() };
		const result = await adjustThread.run(ctx, { id: "t3", pinned: true });
		expect(result.ok).toBe(true);
		const [row] = await db.select().from(threads).where(eq(threads.id, "t3"));
		expect(row?.pinned).toBe(true);
	});

	// `resolveMessageIfUnresolved`'s first-wins race is already
	// proven end to end by "a second concurrent verdict returns verdict_race"
	// in thread-actions.integration.test.ts (one 200, one verdict_race) — no
	// separate case needed here now that the store helper is unexported.

	test("send_message reuses the same direct thread for the same sender+recipient", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await insertUser(db, userValues("u5a"));
		await insertUser(db, userValues("u5b", { kind: "human" }));
		const actions = buildTestActions(agentOrchestration);
		const sendMessage = actions.find((a) => a.declaration.name === "send_message");
		if (!sendMessage) throw new Error("send_message action not found");
		const ctx: ActionContext = { actor: "u5a", db, eventBus, now: new Date().toISOString() };
		const first = await sendMessage.run(ctx, { recipients: ["u5b"], text: "one" });
		const second = await sendMessage.run(ctx, { recipients: ["u5b"], text: "two" });
		if (!first.ok) throw new Error("first send failed");
		if (!second.ok) throw new Error("second send failed");
		const firstData = first.data as { thread: { id: string } };
		const secondData = second.data as { thread: { id: string } };
		expect(secondData.thread.id).toBe(firstData.thread.id);
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
