/**
 * L15 — `POST /api/tasks/:taskId/thread/messages` and
 * `GET /api/tasks/:taskId/thread` route integration tests.
 *
 * Source of truth: `plans/L15-plan.md` §5 + CONFUSION-A (lazy
 * materialization) + AC-2b mapping + §6 route-checklist.
 */

import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	tasks,
	teams,
} from "@hyperidle/db";
import { type DomainEvent, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTestApp } from "../../test-utils.js";

// L15 review C3 (architecture): replace `as` casts on `await res.json()`
// with zod parses so a response-shape regression fails loudly here.
const threadShape = z.object({
	id: z.string(),
	hostKind: z.string(),
	hostId: z.string(),
});
const messageShape = z.object({
	id: z.string(),
	type: z.string(),
	clientKey: z.string(),
	payload: z
		.object({
			text: z.string(),
			refs: z
				.array(
					z.object({
						kind: z.string(),
						taskId: z.string().optional(),
						requestedState: z.string().optional(),
					}),
				)
				.optional(),
		})
		.passthrough(),
});
const postOkSchema = z.object({ thread: threadShape, message: messageShape });
const getOkSchema = z.object({
	thread: threadShape,
	messages: z.array(messageShape),
	headMessageId: z.string().nullable(),
});
async function parsePostOk(res: Response): Promise<z.infer<typeof postOkSchema>> {
	return postOkSchema.parse(await res.json());
}
async function parseGetOk(res: Response): Promise<z.infer<typeof getOkSchema>> {
	return getOkSchema.parse(await res.json());
}

const TEST_API_KEY = "test-key-task-thread";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

interface AppCtx {
	app: Hono;
	db: HyperIdleDb;
	eventBus: EventBus;
	events: DomainEvent[];
}

function setupApp(): AppCtx {
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
	db.insert(agents)
		.values({ id: "agent-1", name: "Agent", role: "builder", status: "active", createdAt: now })
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
			title: "Implement login endpoint",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	return { app, db, eventBus, events };
}

const VALID_REFS = [
	{
		kind: "request_state_change",
		taskId: "task-1",
		requestedState: "blocked",
	},
];

describe("L15 — POST /api/tasks/:taskId/thread/messages (lazy materialization)", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("creates a host_kind='task' thread on first POST and appends the plain message", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: {
					text: 'Please move "Implement login endpoint" to Block.',
					refs: VALID_REFS,
				},
				clientKey: "first-key-12345",
			}),
		});

		// 201 Created on the first call (per plan §5.1).
		expect(res.status).toBe(201);
		const body = await parsePostOk(res);
		expect(body.thread.hostKind).toBe("task");
		expect(body.thread.hostId).toBe("task-1");
		expect(body.message.type).toBe("plain");
		expect(body.message.payload.text).toBe('Please move "Implement login endpoint" to Block.');

		// AC-2b: the thread targeted is exactly the task's thread.
		const get = await ctx.app.request("/api/tasks/task-1/thread", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(get.status).toBe(200);
		const detail = await parseGetOk(get);
		expect(detail.thread.hostKind).toBe("task");
		expect(detail.thread.hostId).toBe("task-1");
		expect(detail.thread.id).toBe(body.thread.id);
		const found = detail.messages.find((m) => m.id === body.message.id);
		expect(found).toBeDefined();
		expect(found?.payload.text).toBe('Please move "Implement login endpoint" to Block.');
	});

	it("re-uses the same thread on the second POST (single thread per task)", async () => {
		const first = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "first request" },
				clientKey: "kkkkk-aa-001",
			}),
		});
		expect(first.status).toBe(201);
		const firstBody = await parsePostOk(first);

		const second = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "second request" },
				clientKey: "kkkkk-aa-002",
			}),
		});
		expect(second.status).toBe(201);
		const secondBody = await parsePostOk(second);

		expect(secondBody.thread.id).toBe(firstBody.thread.id);
	});

	it("idempotency: re-POST same clientKey returns 200 with the existing message id", async () => {
		const first = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "ping" },
				clientKey: "idem-key-001",
			}),
		});
		expect(first.status).toBe(201);
		const firstBody = await parsePostOk(first);

		const second = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "ping" },
				clientKey: "idem-key-001",
			}),
		});
		expect(second.status).toBe(200);
		const secondBody = await parsePostOk(second);
		expect(secondBody.message.id).toBe(firstBody.message.id);
	});

	it("returns 404 when the task does not exist", async () => {
		const res = await ctx.app.request("/api/tasks/does-not-exist/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "x" },
				clientKey: "doesnt-matter1",
			}),
		});
		expect(res.status).toBe(404);
	});

	it("returns 400 on invalid body (zod validation)", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ type: "plain", payload: { text: "x" } }), // missing clientKey
		});
		expect(res.status).toBe(400);
	});

	it("emits thread_created on lazy materialization + thread_message_appended on append", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "x" },
				clientKey: "ev-emit-001x",
			}),
		});
		expect(res.status).toBe(201);
		const created = ctx.events.find((e) => e.type === "thread_created");
		const appended = ctx.events.find((e) => e.type === "thread_message_appended");
		expect(created).toBeDefined();
		expect(appended).toBeDefined();
	});

	it("admits the request_state_change ref shape end-to-end (round-trips)", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: {
					text: 'Please move "Implement login endpoint" to Block.',
					refs: [
						{ kind: "task", id: "task-1" },
						{ kind: "request_state_change", taskId: "task-1", requestedState: "blocked" },
					],
				},
				clientKey: "ref-roundtrip01",
			}),
		});
		expect(res.status).toBe(201);

		const get = await ctx.app.request("/api/tasks/task-1/thread", {
			method: "GET",
			headers: authHeaders(),
		});
		const detail = await parseGetOk(get);
		const msg = detail.messages.find((m) => m.clientKey === "ref-roundtrip01");
		expect(msg).toBeDefined();
		const refs = msg?.payload.refs ?? [];
		const stateRef = refs.find((r) => r.kind === "request_state_change");
		expect(stateRef).toBeDefined();
		expect(stateRef?.taskId).toBe("task-1");
		expect(stateRef?.requestedState).toBe("blocked");
	});
});

describe("L15 — GET /api/tasks/:taskId/thread", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 404 when the task does not exist", async () => {
		const res = await ctx.app.request("/api/tasks/does-not-exist/thread", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});

	it("F1: GET on a never-touched task returns 404 (does NOT mint a thread on read)", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/thread", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
		// And the side-effect must not have happened: no thread row created.
		const get = await ctx.app.request("/api/tasks/task-1/thread", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(get.status).toBe(404);
	});

	it("returns the thread + posted messages once a message has been appended", async () => {
		await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "first" },
				clientKey: "get-thread-001x",
			}),
		});

		const res = await ctx.app.request("/api/tasks/task-1/thread", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const detail = await parseGetOk(res);
		expect(detail.thread.hostKind).toBe("task");
		expect(detail.thread.hostId).toBe("task-1");
		expect(detail.messages.length).toBeGreaterThanOrEqual(1);
		const found = detail.messages.find((m) => m.clientKey === "get-thread-001x");
		expect(found).toBeDefined();
		expect(found?.payload.text).toBe("first");
	});
});

// ---------------------------------------------------------------------------
// L15 review — security regression tests (F1, F2, F3, F4)
// ---------------------------------------------------------------------------

describe("L15 — security regressions", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("F2: GET returns 403 when sender is not in the thread participants", async () => {
		// Materialize the thread as the founder.
		const post = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "seed" },
				clientKey: "f2-seed-key01",
			}),
		});
		expect(post.status).toBe(201);

		// A different identity (not in the team) reads → 403.
		const res = await ctx.app.request("/api/tasks/task-1/thread", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "stranger-not-in-team" }),
		});
		expect(res.status).toBe(403);
	});

	it("F3: rejects request_state_change ref with mismatched taskId (400)", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: {
					text: "x",
					refs: [
						{
							kind: "request_state_change",
							taskId: "task-OTHER",
							requestedState: "blocked",
						},
					],
				},
				clientKey: "f3-mismatch-1",
			}),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("ref_task_mismatch");
	});

	it("F3: rejects request_state_change with a state not in requestableStatesFor(current)", async () => {
		// Task 'task-1' is in_progress; `accepted` is NOT a requestable target.
		const res = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: {
					text: "x",
					refs: [
						{
							kind: "request_state_change",
							taskId: "task-1",
							requestedState: "accepted",
						},
					],
				},
				clientKey: "f3-illegal-st1",
			}),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("invalid_state_transition");
	});

	it("F1: a stranger cannot mint a thread by POSTing first (403)", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "stranger-evil" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "trying to grant myself access" },
				clientKey: "f1-stranger-1",
			}),
		});
		expect(res.status).toBe(403);
	});

	it("F4: rejects payload.refs with more than 32 entries (400)", async () => {
		const refs = Array.from({ length: 33 }, () => ({ kind: "task" as const, id: "task-1" }));
		const res = await ctx.app.request("/api/tasks/task-1/thread/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "x", refs },
				clientKey: "f4-bound-1234",
			}),
		});
		expect(res.status).toBe(400);
	});
});
