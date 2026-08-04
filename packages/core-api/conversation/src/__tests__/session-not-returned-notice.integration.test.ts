/**
 * AU27 Increment 5 (Decision 5) — the never-silent net. A `not_returned`
 * session with a `callingThreadId` produces exactly one notice in that
 * thread; without one, no message and no throw (a `task_run` session, whose
 * `sourceCorrelation` carries no thread — there is nowhere to post).
 */
import {
	registerSessionNotReturnedNotice,
	SESSION_NOT_RETURNED_NOTICE_TEXT,
} from "@hyperidle/conversation";
import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

async function seedAgentAndThread(
	db: HyperIdleDb,
	options: { readonly agentId: string; readonly taskId: string; readonly threadId: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: options.agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(threads).values({
		id: options.threadId,
		hostKind: "task",
		hostId: options.taskId,
		initiatorId: options.agentId,
		participants: JSON.stringify([options.agentId]),
		lastActiveAt: now,
		createdAt: now,
	});
}

describe("registerSessionNotReturnedNotice — the never-silent net", () => {
	test("a not_returned session WITH a callingThreadId gets exactly one notice in that thread", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		await seedAgentAndThread(db, {
			agentId: "agent-notice-1",
			taskId: "task-notice-1",
			threadId: "thread-notice-1",
		});
		const unregister = registerSessionNotReturnedNotice(db, eventBus);

		eventBus.emit({
			type: "session_not_returned",
			streamId: "session-notice-1",
			sessionId: "session-notice-1",
			agentId: "agent-notice-1",
			taskId: null,
			callingThreadId: "thread-notice-1",
			timestamp: Date.now(),
		});
		// Reaction is fire-and-forget internally — flush the microtask queue.
		await new Promise<void>((resolve) => setImmediate(resolve));

		const rows = await db.select().from(messages).where(eq(messages.threadId, "thread-notice-1"));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.senderId).toBe("agent-notice-1");
		const payload = JSON.parse(rows[0]?.payload ?? "{}") as { text?: string };
		expect(payload.text).toBe(SESSION_NOT_RETURNED_NOTICE_TEXT);

		unregister();
	});

	test("a not_returned session WITHOUT a callingThreadId (e.g. task_run) posts nothing and never throws", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		await db.insert(users).values({
			id: "agent-notice-2",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		const unregister = registerSessionNotReturnedNotice(db, eventBus);

		expect(() => {
			eventBus.emit({
				type: "session_not_returned",
				streamId: "session-notice-2",
				sessionId: "session-notice-2",
				agentId: "agent-notice-2",
				taskId: "task-notice-2",
				sourceCorrelation: { taskId: "task-notice-2", teamId: "team-notice-2" },
				timestamp: Date.now(),
			});
		}).not.toThrow();
		await new Promise<void>((resolve) => setImmediate(resolve));

		const rows = await db.select().from(messages);
		expect(rows).toHaveLength(0);

		unregister();
	});

	test("is idempotent per eventBus instance — a second registration is a no-op disposer", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const first = registerSessionNotReturnedNotice(db, eventBus);
		const second = registerSessionNotReturnedNotice(db, eventBus);

		await seedAgentAndThread(db, {
			agentId: "agent-notice-3",
			taskId: "task-notice-3",
			threadId: "thread-notice-3",
		});

		eventBus.emit({
			type: "session_not_returned",
			streamId: "session-notice-3",
			sessionId: "session-notice-3",
			agentId: "agent-notice-3",
			taskId: null,
			callingThreadId: "thread-notice-3",
			timestamp: Date.now(),
		});
		await new Promise<void>((resolve) => setImmediate(resolve));

		// A double registration must not double-post.
		const rows = await db.select().from(messages).where(eq(messages.threadId, "thread-notice-3"));
		expect(rows).toHaveLength(1);

		second();
		first();
	});
});
