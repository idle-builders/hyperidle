/**
 * L15 — POST /api/tasks/:id/request lazy-thread-creation race resolution.
 *
 * CRITICAL-2 (L15-plan.md § 5.4): two concurrent POSTs on a task with
 * `tasks.thread_id IS NULL` must both succeed AND both messages must land
 * in the SAME thread. The conditional-UPDATE-with-rowcount-check pattern
 * ensures only one writer pins `tasks.thread_id`; the loser deletes its
 * speculative thread row in the same transaction.
 *
 * Source: L15-plan.md § 12 protected-tests row `tasks.request-concurrent.test.ts`.
 */

import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq, isNotNull } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";
import { __resetTaskRequestRateLimiter } from "../tasks.js";

const TEST_API_KEY = "test-key-tasks-request-concurrent";

function authHeaders(): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
	};
}

interface AppCtx {
	app: Hono;
	db: HyperIdleDb;
}

function setupApp(): AppCtx {
	const db = createTestDb();
	const eventBus = new EventBus();
	const app = createTestApp({ db, eventBus });

	const now = new Date().toISOString();
	db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: now }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(agents)
		.values({ id: "u-founder", name: "Founder", role: "founder", status: "active", createdAt: now })
		.run();
	db.insert(bets)
		.values({
			id: "bet-x",
			productId: "p1",
			teamId: "t1",
			pitch: "x",
			appetite: "small",
			status: "in_progress",
			createdAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "bet-x",
			productId: "p1",
			teamId: "t1",
			title: "Concurrent test",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	return { app, db };
}

describe("POST /api/tasks/:id/request — concurrent lazy-thread-creation race", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		__resetTaskRequestRateLimiter();
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("two concurrent requests on a task with NULL thread_id → exactly one tasks.thread_id row", async () => {
		// Pre-condition: thread_id is null.
		const before = ctx.db
			.select({ threadId: tasks.threadId })
			.from(tasks)
			.where(eq(tasks.id, "task-1"))
			.get();
		expect(before?.threadId).toBeNull();

		const post = (clientKey: string): Promise<Response> =>
			ctx.app.request("/api/tasks/task-1/request", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					verb: "request_stop",
					clientKey,
				}),
			});

		const [resA, resB] = await Promise.all([post("race-key-aaaa"), post("race-key-bbbb")]);

		// Both succeed (201 — different clientKeys, distinct rows).
		expect(resA.status).toBe(201);
		expect(resB.status).toBe(201);

		const bodyA = (await resA.json()) as { thread: { id: string } };
		const bodyB = (await resB.json()) as { thread: { id: string } };

		// Critical: SAME thread id returned to both callers.
		expect(bodyA.thread.id).toBe(bodyB.thread.id);

		// task.thread_id pinned to that single id.
		const after = ctx.db
			.select({ threadId: tasks.threadId })
			.from(tasks)
			.where(eq(tasks.id, "task-1"))
			.get();
		expect(after?.threadId).toBe(bodyA.thread.id);
	});

	it("both messages land in the same thread (no orphan thread rows)", async () => {
		const post = (clientKey: string): Promise<Response> =>
			ctx.app.request("/api/tasks/task-1/request", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					verb: "request_stop",
					clientKey,
				}),
			});

		const [resA, resB] = await Promise.all([post("orphan-key-aaaa"), post("orphan-key-bbbb")]);
		expect(resA.status).toBe(201);
		expect(resB.status).toBe(201);

		// Exactly ONE thread row exists for hostKind=task / hostId=task-1.
		const taskThreads = ctx.db.select().from(threads).where(eq(threads.hostId, "task-1")).all();
		const taskThreadsForTask = taskThreads.filter((t) => t.hostKind === "task");
		expect(taskThreadsForTask.length).toBe(1);

		// And both request messages live in that thread.
		const threadId = taskThreadsForTask[0].id;
		const get = await ctx.app.request(`/api/threads/${threadId}`, {
			method: "GET",
			headers: authHeaders(),
		});
		const detail = (await get.json()) as {
			messages: Array<{ clientKey: string; payload: { request?: { verb: string } } }>;
		};
		const requestMsgs = detail.messages.filter((m) => m.payload.request !== undefined);
		expect(requestMsgs.length).toBe(2);
		const keys = requestMsgs.map((m) => m.clientKey).sort();
		expect(keys).toEqual(["orphan-key-aaaa", "orphan-key-bbbb"]);
	});

	it("no orphan thread rows exist after the race (loser's speculative thread was deleted)", async () => {
		const post = (clientKey: string): Promise<Response> =>
			ctx.app.request("/api/tasks/task-1/request", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					verb: "request_stop",
					clientKey,
				}),
			});

		await Promise.all([post("noorphan-aaaa"), post("noorphan-bbbb")]);

		// Every thread in the DB must be referenced by some task (no dangling
		// rows). For this test the only task is task-1, so we expect exactly
		// one thread row whose id matches task-1.thread_id.
		const allThreads = ctx.db.select().from(threads).all();
		const pinnedTaskThreads = ctx.db
			.select({ threadId: tasks.threadId })
			.from(tasks)
			.where(isNotNull(tasks.threadId))
			.all();
		const pinnedIds = new Set(pinnedTaskThreads.map((t) => t.threadId));
		for (const t of allThreads) {
			if (t.hostKind === "task") {
				expect(pinnedIds.has(t.id)).toBe(true);
			}
		}
		// Sanity: only ONE task-thread total.
		expect(allThreads.filter((t) => t.hostKind === "task").length).toBe(1);
	});
});
