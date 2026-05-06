/**
 * L19 — GET /api/bets/:id session enrichment integration tests.
 *
 * AC coverage:
 *  - tasks with a session have latestSession* fields populated (outcome, cost,
 *    tokensInput, tokensOutput, harnessUrl)
 *  - tasks with no session have null for all latestSession* fields
 *  - when a task has multiple sessions, the most recent (by startedAt) is used
 *  - 404 returned for an unknown bet id
 */

import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	sessions,
	tasks,
	teams,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-bet-session-enrichment";

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
}

function setupApp(): AppCtx {
	const db = createTestDb();
	const eventBus = new EventBus();
	const app = createTestApp({ db, eventBus });

	const now = new Date().toISOString();

	db.insert(products)
		.values({ id: "p1", name: "TestProduct", phase: "build", createdAt: now })
		.run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(agents)
		.values({
			id: "agent-1",
			name: "Builder Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		})
		.run();

	return { app, db };
}

const NOW = new Date().toISOString();

describe("L19 — GET /api/bets/:id — session enrichment", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 404 for an unknown bet id", async () => {
		const res = await ctx.app.request("/api/bets/non-existent-bet", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("NOT_FOUND");
	});

	it("task with a session has all latestSession* fields populated", async () => {
		const { db } = ctx;

		db.insert(bets)
			.values({
				id: "bet-enriched",
				productId: "p1",
				teamId: "t1",
				pitch: "Test pitch",
				appetite: "1 week",
				status: "in_progress",
				createdAt: NOW,
			})
			.run();

		db.insert(tasks)
			.values({
				id: "task-with-session",
				betId: "bet-enriched",
				productId: "p1",
				teamId: "t1",
				title: "Task with session",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();

		db.insert(sessions)
			.values({
				id: "session-1",
				taskId: "task-with-session",
				agentId: "agent-1",
				modelTier: "sonnet",
				startedAt: NOW,
				state: "done",
				outcome: "completed",
				cost: 420,
				tokensInput: 1000,
				tokensOutput: 500,
				harnessUrl: "https://harness.example.com/session/1",
			})
			.run();

		const res = await ctx.app.request("/api/bets/bet-enriched", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			id: string;
			tasks: Array<{
				id: string;
				latestSessionOutcome: string | null;
				latestSessionCost: number | null;
				latestSessionTokensInput: number | null;
				latestSessionTokensOutput: number | null;
				latestSessionHarnessUrl: string | null;
			}>;
		};

		expect(body.id).toBe("bet-enriched");
		expect(body.tasks).toHaveLength(1);

		const task = body.tasks[0];
		expect(task.id).toBe("task-with-session");
		expect(task.latestSessionOutcome).toBe("completed");
		expect(task.latestSessionCost).toBe(420);
		expect(task.latestSessionTokensInput).toBe(1000);
		expect(task.latestSessionTokensOutput).toBe(500);
		expect(task.latestSessionHarnessUrl).toBe("https://harness.example.com/session/1");
	});

	it("task with no session has null for all latestSession* fields", async () => {
		const { db } = ctx;

		db.insert(bets)
			.values({
				id: "bet-no-session",
				productId: "p1",
				teamId: "t1",
				pitch: "No session pitch",
				appetite: "2 weeks",
				status: "in_progress",
				createdAt: NOW,
			})
			.run();

		db.insert(tasks)
			.values({
				id: "task-no-session",
				betId: "bet-no-session",
				productId: "p1",
				teamId: "t1",
				title: "Task without session",
				state: "queued",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();

		const res = await ctx.app.request("/api/bets/bet-no-session", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			tasks: Array<{
				id: string;
				latestSessionOutcome: string | null;
				latestSessionCost: number | null;
				latestSessionTokensInput: number | null;
				latestSessionTokensOutput: number | null;
				latestSessionHarnessUrl: string | null;
			}>;
		};

		expect(body.tasks).toHaveLength(1);

		const task = body.tasks[0];
		expect(task.id).toBe("task-no-session");
		expect(task.latestSessionOutcome).toBeNull();
		expect(task.latestSessionCost).toBeNull();
		expect(task.latestSessionTokensInput).toBeNull();
		expect(task.latestSessionTokensOutput).toBeNull();
		expect(task.latestSessionHarnessUrl).toBeNull();
	});

	it("mixed bet: one task with session, one without — each correctly enriched", async () => {
		const { db } = ctx;

		db.insert(bets)
			.values({
				id: "bet-mixed",
				productId: "p1",
				teamId: "t1",
				pitch: "Mixed tasks pitch",
				appetite: "6 weeks",
				status: "in_progress",
				createdAt: NOW,
			})
			.run();

		db.insert(tasks)
			.values({
				id: "task-has-session",
				betId: "bet-mixed",
				productId: "p1",
				teamId: "t1",
				title: "Task with session",
				state: "done",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();

		db.insert(tasks)
			.values({
				id: "task-lacks-session",
				betId: "bet-mixed",
				productId: "p1",
				teamId: "t1",
				title: "Task without session",
				state: "queued",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();

		db.insert(sessions)
			.values({
				id: "session-mixed-1",
				taskId: "task-has-session",
				agentId: "agent-1",
				modelTier: "haiku",
				startedAt: NOW,
				state: "done",
				outcome: "completed",
				cost: 100,
				tokensInput: 200,
				tokensOutput: 100,
				harnessUrl: "https://harness.example.com/session/mixed-1",
			})
			.run();

		const res = await ctx.app.request("/api/bets/bet-mixed", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			tasks: Array<{
				id: string;
				latestSessionOutcome: string | null;
				latestSessionCost: number | null;
				latestSessionTokensInput: number | null;
				latestSessionTokensOutput: number | null;
				latestSessionHarnessUrl: string | null;
			}>;
		};

		expect(body.tasks).toHaveLength(2);

		const withSession = body.tasks.find((t) => t.id === "task-has-session");
		const withoutSession = body.tasks.find((t) => t.id === "task-lacks-session");

		expect(withSession).toBeDefined();
		expect(withSession?.latestSessionOutcome).toBe("completed");
		expect(withSession?.latestSessionCost).toBe(100);
		expect(withSession?.latestSessionTokensInput).toBe(200);
		expect(withSession?.latestSessionTokensOutput).toBe(100);
		expect(withSession?.latestSessionHarnessUrl).toBe(
			"https://harness.example.com/session/mixed-1",
		);

		expect(withoutSession).toBeDefined();
		expect(withoutSession?.latestSessionOutcome).toBeNull();
		expect(withoutSession?.latestSessionCost).toBeNull();
		expect(withoutSession?.latestSessionTokensInput).toBeNull();
		expect(withoutSession?.latestSessionTokensOutput).toBeNull();
		expect(withoutSession?.latestSessionHarnessUrl).toBeNull();
	});

	it("uses the most recent session (by startedAt) when a task has multiple sessions", async () => {
		const { db } = ctx;

		db.insert(bets)
			.values({
				id: "bet-multi-session",
				productId: "p1",
				teamId: "t1",
				pitch: "Multi-session pitch",
				appetite: "1 week",
				status: "in_progress",
				createdAt: NOW,
			})
			.run();

		db.insert(tasks)
			.values({
				id: "task-multi-session",
				betId: "bet-multi-session",
				productId: "p1",
				teamId: "t1",
				title: "Task with multiple sessions",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();

		// Older session (earlier startedAt)
		db.insert(sessions)
			.values({
				id: "session-older",
				taskId: "task-multi-session",
				agentId: "agent-1",
				modelTier: "haiku",
				startedAt: "2026-05-01T10:00:00Z",
				state: "done",
				outcome: "failed",
				cost: 50,
				tokensInput: 100,
				tokensOutput: 50,
				harnessUrl: "https://harness.example.com/session/older",
			})
			.run();

		// Newer session (later startedAt) — this one should be returned
		db.insert(sessions)
			.values({
				id: "session-newer",
				taskId: "task-multi-session",
				agentId: "agent-1",
				modelTier: "sonnet",
				startedAt: "2026-05-05T10:00:00Z",
				state: "done",
				outcome: "completed",
				cost: 300,
				tokensInput: 800,
				tokensOutput: 400,
				harnessUrl: "https://harness.example.com/session/newer",
			})
			.run();

		const res = await ctx.app.request("/api/bets/bet-multi-session", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			tasks: Array<{
				id: string;
				latestSessionOutcome: string | null;
				latestSessionCost: number | null;
				latestSessionTokensInput: number | null;
				latestSessionTokensOutput: number | null;
				latestSessionHarnessUrl: string | null;
			}>;
		};

		expect(body.tasks).toHaveLength(1);
		const task = body.tasks[0];
		// Should reflect the newer session
		expect(task.latestSessionOutcome).toBe("completed");
		expect(task.latestSessionCost).toBe(300);
		expect(task.latestSessionTokensInput).toBe(800);
		expect(task.latestSessionTokensOutput).toBe(400);
		expect(task.latestSessionHarnessUrl).toBe("https://harness.example.com/session/newer");
	});
});
