/**
 * L15 — POST /api/tasks/:id/request route integration tests.
 *
 * Source: docs/work-packages/L15-plan.md §5.4 + §12 assertion locks (row
 * `tasks.request.test.ts`). RED PHASE — the endpoint does not exist yet;
 * every assertion must fail until the green phase mounts the handler.
 *
 * @plan-contradiction: the L15 plan §7 CONFUSION-1 flags that the team
 *   board uses INITIAL_TASKS only. Resolution path (A): we exercise the
 *   API directly here; the page-level wire-up is a follow-up.
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
import { type DomainEvent, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-tasks-request";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

interface Ctx {
	app: Hono;
	db: HyperIdleDb;
	eventBus: EventBus;
	events: DomainEvent[];
}

function setup(): Ctx {
	const db = createTestDb();
	const eventBus = new EventBus();
	const events: DomainEvent[] = [];
	eventBus.on("*", (e) => {
		events.push(e);
	});
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

	return { app, db, eventBus, events };
}

describe("POST /api/tasks/:id/request — happy path", () => {
	let ctx: Ctx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setup();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("(a) valid verb → 201, persists exactly one plain message with request payload", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_stop",
				clientKey: "ck-stop-001",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			message: { id: string; type: string; payload: { text: string; request: { verb: string } } };
			thread: { id: string };
		};
		expect(body.message.type).toBe("plain");
		expect(body.message.payload.request.verb).toBe("request_stop");
		expect(body.message.payload.text).toBe("Request stop");

		const allMsgs = ctx.db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, body.thread.id))
			.all();
		expect(allMsgs).toHaveLength(1);
	});

	it("(g) lazily creates the task's thread when tasks.thread_id is null", async () => {
		const before = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(before?.threadId).toBeNull();

		const res = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-lazy-001" }),
		});
		expect(res.status).toBe(201);

		const after = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(after?.threadId).not.toBeNull();
		const threadRow = ctx.db
			.select()
			.from(threads)
			.where(eq(threads.id, after?.threadId as string))
			.get();
		expect(threadRow?.hostKind).toBe("task");
		expect(threadRow?.hostId).toBe("task-1");
	});
});

describe("POST /api/tasks/:id/request — error cases", () => {
	let ctx: Ctx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setup();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("(b) illegal verb for current state → 400", async () => {
		// task-1 is in_progress; request_unblock is illegal there.
		const res = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verb: "request_unblock", clientKey: "ck-illegal-001" }),
		});
		expect(res.status).toBe(400);
	});

	it("(c) cancel_request without a pending → 409 already_resolved", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verb: "cancel_request", clientKey: "ck-cancel-001" }),
		});
		expect(res.status).toBe(409);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("already_resolved");
	});

	it("(c') cancel_request after the task transitioned past the request → 409 already_resolved", async () => {
		// Regression: architecture MUST-FIX-1 / plan §10 row 12. Without the
		// supersede check, a cancel posted on a request whose target state was
		// reached by a parallel transition would succeed silently — leaking a
		// "Request cancelled" toast for an already-moot cancel.
		const r1 = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-supersede-001" }),
		});
		expect(r1.status).toBe(201);

		// Sleep so the subsequent transition's ISO timestamp is strictly later
		// than the pending request message's createdAt (millisecond resolution).
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Bump task.updatedAt past the message createdAt by transitioning
		// state. The transition route bumps updatedAt on every move.
		const transition = await ctx.app.request("/api/tasks/task-1/transition", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ state: "review" }),
		});
		expect(transition.status).toBe(200);

		const cancel = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verb: "cancel_request", clientKey: "ck-supersede-002" }),
		});
		expect(cancel.status).toBe(409);
		const body = (await cancel.json()) as { code?: string };
		expect(body.code).toBe("already_resolved");
	});

	it("(d) no auth → 401", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-no-auth-001" }),
		});
		expect(res.status).toBe(401);
	});

	it("404 when the task does not exist", async () => {
		const res = await ctx.app.request("/api/tasks/does-not-exist/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-404-001" }),
		});
		expect(res.status).toBe(404);
	});
});

describe("POST /api/tasks/:id/request — idempotency", () => {
	let ctx: Ctx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setup();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("(f1) duplicate clientKey + same payload → returns same message id", async () => {
		const body = JSON.stringify({ verb: "request_stop", clientKey: "ck-idem-001" });
		const first = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body,
		});
		expect(first.status).toBe(201);
		const firstId = ((await first.json()) as { message: { id: string } }).message.id;

		const second = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body,
		});
		// 200 OK on idempotent replay (existing convention in threads.ts)
		expect([200, 201]).toContain(second.status);
		const secondId = ((await second.json()) as { message: { id: string } }).message.id;
		expect(secondId).toBe(firstId);
	});

	it("(f2) duplicate clientKey + divergent payload → 409 idempotency_conflict", async () => {
		const ck = "ck-conflict-001";
		const r1 = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verb: "request_stop", clientKey: ck }),
		});
		expect(r1.status).toBe(201);

		const r2 = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verb: "request_hold", clientKey: ck }),
		});
		expect(r2.status).toBe(409);
		const body = (await r2.json()) as { code?: string };
		expect(body.code).toBe("idempotency_conflict");
	});
});

describe("POST /api/tasks/:id/request — parity with threads route plain-type append (h)", () => {
	let ctx: Ctx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setup();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("(h) the request endpoint produces a row identical-shape to a plain message posted via /api/threads/:id/messages", async () => {
		// Lazy-create the thread by sending a request first.
		const r1 = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-parity-001" }),
		});
		expect(r1.status).toBe(201);
		const { thread } = (await r1.json()) as {
			thread: { id: string };
			message: { id: string };
		};

		// Now post a plain message directly via threads route — same thread.
		const r2 = await ctx.app.request(`/api/threads/${thread.id}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "follow-up" },
				clientKey: "ck-parity-002",
			}),
		});
		expect(r2.status).toBe(201);

		// Both rows should be in the same thread, both type=plain, both have lastActiveAt bumps.
		const rows = ctx.db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, thread.id))
			.all();
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.type).toBe("plain");
			expect(row.threadId).toBe(thread.id);
		}
	});
});
