/**
 * L15 — POST /api/tasks/:id/request integration tests.
 *
 * Red phase: the route does not exist yet, so every endpoint returns a 404.
 * Once the green phase mounts the new handler under `createTaskRoutes`,
 * these assertions become the contract.
 *
 * Sources:
 *  - L15-plan.md § 5.4 (endpoint contract)
 *  - L15-plan.md § 12 (protected-tests row `tasks.request.test.ts`)
 *  - approved.md § 3.5 (verb→state legality matrix)
 *  - L15-plan.md § 2.6 (cancel_request → 409 already_resolved)
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
import { createTestApp } from "../../test-utils.js";
import { __resetTaskRequestRateLimiter } from "../tasks.js";

const TEST_API_KEY = "test-key-tasks-request";

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
		.values({
			id: "t1",
			productId: "p1",
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		})
		.run();
	db.insert(agents)
		.values({
			id: "u-founder",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.run();
	db.insert(agents)
		.values({
			id: "agent-1",
			name: "Agent",
			role: "builder",
			status: "active",
			teamId: "t1",
			createdAt: now,
		})
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
			title: "Implement login",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	return { app, db, eventBus, events };
}

const validClientKey = "req-12345678-abcd";

describe("POST /api/tasks/:id/request — happy path", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		__resetTaskRequestRateLimiter();
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 201 with the appended message + thread when verb is legal for state", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_stop",
				clientKey: validClientKey,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			message: { type: string; payload: { text: string; request: { verb: string } } };
			thread: { id: string; hostKind: string; hostId: string };
		};
		expect(body.message.type).toBe("plain");
		expect(body.message.payload.text).toBe("Request stop");
		expect(body.message.payload.request).toEqual({ verb: "request_stop" });
		expect(body.thread.hostKind).toBe("task");
		expect(body.thread.hostId).toBe("task-1");
	});

	it("persists exactly one plain-typed message in the task's thread (lazy thread creation)", async () => {
		const post = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_stop",
				clientKey: validClientKey,
			}),
		});
		expect(post.status).toBe(201);
		const created = (await post.json()) as { thread: { id: string } };

		const get = await ctx.app.request(`/api/threads/${created.thread.id}`, {
			method: "GET",
			headers: authHeaders(),
		});
		expect(get.status).toBe(200);
		const detail = (await get.json()) as {
			messages: Array<{
				type: string;
				payload: { text: string; request?: { verb: string; reason?: string } };
			}>;
		};
		const requestMsgs = detail.messages.filter(
			(m) => m.type === "plain" && m.payload.request !== undefined,
		);
		expect(requestMsgs.length).toBe(1);
		expect(requestMsgs[0].payload.request?.verb).toBe("request_stop");
	});

	it("includes optional `reason` rendered into the canonical text", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_stop",
				reason: "no progress in 24h",
				clientKey: validClientKey,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			message: { payload: { text: string; request: { verb: string; reason?: string } } };
		};
		expect(body.message.payload.text).toBe("Request stop: no progress in 24h");
		expect(body.message.payload.request.reason).toBe("no progress in 24h");
	});
});

describe("POST /api/tasks/:id/request — verb→state legality enforcement", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		__resetTaskRequestRateLimiter();
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 400 when verb is not legal for the current task state", async () => {
		// task-1 is `in_progress`; `request_changes` is only legal in `review`.
		const res = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_changes",
				clientKey: "illegal-verb-key1",
			}),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("validation_error");
	});

	it("returns 400 when verb is not in the closed REQUEST_VERBS enum", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "totally_made_up",
				clientKey: "bad-verb-key1",
			}),
		});
		expect(res.status).toBe(400);
	});

	it("returns 404 when the task does not exist", async () => {
		const res = await ctx.app.request("/api/tasks/does-not-exist/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_stop",
				clientKey: "missing-task-key",
			}),
		});
		expect(res.status).toBe(404);
	});

	it("returns 401 when no API key is provided (auth middleware)", async () => {
		const res = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				verb: "request_stop",
				clientKey: "noauth-key1",
			}),
		});
		expect(res.status).toBe(401);
	});
});

describe("POST /api/tasks/:id/request — idempotency on (threadId, senderId, clientKey)", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		__resetTaskRequestRateLimiter();
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("re-POST with the same clientKey + same payload returns the same message id (no duplicate)", async () => {
		const first = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_stop",
				clientKey: "dup-key1234",
			}),
		});
		expect(first.status).toBe(201);
		const firstBody = (await first.json()) as { message: { id: string }; thread: { id: string } };

		const second = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_stop",
				clientKey: "dup-key1234",
			}),
		});
		expect([200, 201]).toContain(second.status);
		const secondBody = (await second.json()) as { message: { id: string } };
		expect(secondBody.message.id).toBe(firstBody.message.id);

		// Only one request-message in the thread.
		const get = await ctx.app.request(`/api/threads/${firstBody.thread.id}`, {
			method: "GET",
			headers: authHeaders(),
		});
		const detail = (await get.json()) as {
			messages: Array<{ clientKey: string }>;
		};
		const matches = detail.messages.filter((m) => m.clientKey === "dup-key1234");
		expect(matches.length).toBe(1);
	});

	it("re-POST with same clientKey but a divergent payload returns 409 idempotency_conflict", async () => {
		const first = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_stop",
				clientKey: "diverge-key1",
			}),
		});
		expect(first.status).toBe(201);

		const second = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_hold", // different verb → different payload
				clientKey: "diverge-key1",
			}),
		});
		expect(second.status).toBe(409);
		const body = (await second.json()) as { code?: string };
		expect(body.code).toBe("idempotency_conflict");
	});
});

describe("POST /api/tasks/:id/request — cancel_request without a pending → 409 already_resolved", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		__resetTaskRequestRateLimiter();
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 409 with code `already_resolved` when no open request exists for the task", async () => {
		// No pending request was ever posted; cancel is moot.
		const res = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "cancel_request",
				clientKey: "cancel-noop-key1",
			}),
		});
		expect(res.status).toBe(409);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("already_resolved");
	});

	it("succeeds (201) when there IS a pending request to cancel", async () => {
		// Post a request first.
		const first = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_stop",
				clientKey: "cancel-prereq-key",
			}),
		});
		expect(first.status).toBe(201);

		const cancel = await ctx.app.request("/api/tasks/task-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "cancel_request",
				clientKey: "cancel-followup-key",
			}),
		});
		expect(cancel.status).toBe(201);
		const body = (await cancel.json()) as {
			message: { payload: { request: { verb: string } } };
		};
		expect(body.message.payload.request.verb).toBe("cancel_request");
	});
});
