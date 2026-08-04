/**
 * AU27 Increment 1 (Decision 0) — `resolveOrCreateCallingThread` resolves the
 * task's `hostKind:"task"` thread by `(hostKind, hostId)` lookup, creating one
 * only if absent. Idempotent: a second call for the same task reuses the same
 * thread — proves no duplicate thread is ever created (the property the
 * `reply` tool, Increment 2, depends on to always land in the same place).
 */
import { findThread, type ThreadFilter } from "@hyperidle/conversation";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { resolveOrCreateCallingThread } from "../services/calling-thread-bindings.js";

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
}

describe("resolveOrCreateCallingThread", () => {
	test("creates a hostKind:task thread when none exists, with the agent as the sole participant", async ({
		db,
	}) => {
		await seedAgent(db, "agent-calling-thread-1");

		const threadId = await resolveOrCreateCallingThread(
			db,
			"task-calling-thread-1",
			"agent-calling-thread-1",
		);

		const thread = await findThread(db, {
			host: { kind: "task", id: "task-calling-thread-1" },
		} satisfies ThreadFilter);
		expect(thread?.id).toBe(threadId);
		expect(thread?.hostKind).toBe("task");
		expect(thread?.hostId).toBe("task-calling-thread-1");
		expect(JSON.parse(thread?.participants ?? "[]")).toEqual(["agent-calling-thread-1"]);
	});

	test("is idempotent — a second call for the same task reuses the existing thread, no duplicate", async ({
		db,
	}) => {
		await seedAgent(db, "agent-calling-thread-2");

		const first = await resolveOrCreateCallingThread(
			db,
			"task-calling-thread-2",
			"agent-calling-thread-2",
		);
		const second = await resolveOrCreateCallingThread(
			db,
			"task-calling-thread-2",
			"agent-calling-thread-2",
		);

		expect(second).toBe(first);
	});
});
