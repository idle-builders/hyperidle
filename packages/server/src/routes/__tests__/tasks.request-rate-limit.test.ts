/**
 * L15 security HIGH-2 — per-(senderId, taskId) rate limiter on
 * `POST /api/tasks/:id/request`.
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
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";
import { __resetTaskRequestRateLimiter } from "../tasks.js";

const TEST_API_KEY = "test-key-tasks-request-rate";

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
	db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: now }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(agents)
		.values({ id: "u-founder", name: "F", role: "founder", status: "active", createdAt: now })
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
			id: "task-rl-1",
			betId: "bet-x",
			productId: "p1",
			teamId: "t1",
			title: "T",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-rl-2",
			betId: "bet-x",
			productId: "p1",
			teamId: "t1",
			title: "T2",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	return { app, db };
}

describe("POST /api/tasks/:id/request — per-(sender,task) rate limit (security HIGH-2)", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		__resetTaskRequestRateLimiter();
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("allows up to N requests in the window then 429s on the (N+1)th for the same task", async () => {
		const LIMIT = 10;
		// First LIMIT calls succeed (mix of legal verbs to avoid idempotency conflicts).
		for (let i = 0; i < LIMIT; i++) {
			const res = await ctx.app.request("/api/tasks/task-rl-1/request", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					verb: "request_stop",
					clientKey: `rl-key-${i.toString().padStart(8, "0")}`,
				}),
			});
			// 201 (new) or 200 (idempotent replay) both count as accepted.
			expect([200, 201]).toContain(res.status);
		}

		// (LIMIT + 1)th call → 429.
		const blocked = await ctx.app.request("/api/tasks/task-rl-1/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_stop",
				clientKey: "rl-overflow-key1",
			}),
		});
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get("Retry-After")).not.toBeNull();
	});

	it("buckets are per-task: hitting the limit on task-rl-1 does NOT block task-rl-2", async () => {
		const LIMIT = 10;
		for (let i = 0; i < LIMIT + 1; i++) {
			await ctx.app.request("/api/tasks/task-rl-1/request", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					verb: "request_stop",
					clientKey: `bucket-key-${i.toString().padStart(8, "0")}`,
				}),
			});
		}

		const other = await ctx.app.request("/api/tasks/task-rl-2/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verb: "request_stop",
				clientKey: "other-task-key1",
			}),
		});
		expect(other.status).toBe(201);
	});
});
