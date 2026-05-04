/**
 * L15 CRITICAL-2 — Concurrent POST /api/tasks/:id/request on a task with
 * thread_id=null must result in EXACTLY ONE thread row, both messages on
 * the same thread, no orphans.
 *
 * Source: docs/work-packages/L15-plan.md §5.4 ("Lazy-thread-creation race
 * resolution") + §12 (`tasks.request-concurrent.test.ts` row).
 */

import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	messages as messagesTable,
	products,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-concurrent";

function authHeaders(): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
	};
}

interface Ctx {
	app: Hono;
	db: HyperIdleDb;
}

function setup(): Ctx {
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
			id: "bet-1",
			productId: "p1",
			teamId: "t1",
			pitch: "p",
			appetite: "small",
			status: "in_progress",
			createdAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "bet-1",
			productId: "p1",
			teamId: "t1",
			title: "T",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	return { app, db };
}

describe("POST /api/tasks/:id/request — concurrent lazy-thread-creation race", () => {
	let ctx: Ctx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setup();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("(a)+(b)+(c)+(d) two concurrent calls produce exactly one thread, both messages live there, no orphan threads", async () => {
		const before = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(before?.threadId).toBeNull();

		const fire = (ck: string): Promise<Response> =>
			ctx.app.request("/api/tasks/task-1/request", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ verb: "request_stop", clientKey: ck }),
			});

		const [r1, r2] = await Promise.all([fire("ck-conc-001"), fire("ck-conc-002")]);
		// Both must succeed (or 200 idempotent on a tie); neither may fail with 5xx.
		expect([200, 201]).toContain(r1.status);
		expect([200, 201]).toContain(r2.status);

		// (a) Exactly ONE thread row whose hostKind=task / hostId=task-1.
		const taskThreads = ctx.db
			.select()
			.from(threads)
			.where(eq(threads.hostId, "task-1"))
			.all();
		expect(taskThreads).toHaveLength(1);

		// (c) tasks.thread_id pinned to the surviving thread.
		const after = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(after?.threadId).toBe(taskThreads[0].id);

		// (b) Both messages land in that single thread.
		const msgs = ctx.db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, taskThreads[0].id))
			.all();
		expect(msgs).toHaveLength(2);

		// (d) No orphan threads (no threads pointing at task-1 that aren't pinned).
		const allThreads = ctx.db.select().from(threads).all();
		const taskBound = allThreads.filter(
			(t) => t.hostKind === "task" && t.hostId === "task-1",
		);
		expect(taskBound).toHaveLength(1);
	});
});
