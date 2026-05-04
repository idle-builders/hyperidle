/**
 * L15 — GET /api/tasks projection: each row carries `pendingRequest` and
 * `snoozedUntil` per plan §5.6 + §12 row.
 *
 * @plan-contradiction: plan §7 CONFUSION-1 — the team board uses
 *   INITIAL_TASKS today (no live fetch). We exercise the API directly
 *   here per resolution path (A).
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

const TEST_API_KEY = "test-key-list-pending";

function headers(identity?: string): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...(identity ? { "X-Identity": identity } : {}),
	};
}

interface Ctx {
	app: Hono;
	db: HyperIdleDb;
}

function setup(): Ctx {
	const db = createTestDb();
	const app = createTestApp({ db, eventBus: new EventBus() });
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
			id: "task-pending",
			betId: "bet-1",
			productId: "p1",
			teamId: "t1",
			title: "P",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-fresh",
			betId: "bet-1",
			productId: "p1",
			teamId: "t1",
			title: "F",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	return { app, db };
}

describe("GET /api/tasks — pendingRequest projection", () => {
	let ctx: Ctx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setup();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns pendingRequest=null when no request has been made", async () => {
		const res = await ctx.app.request("/api/tasks", {
			method: "GET",
			headers: headers("u-founder"),
		});
		expect(res.status).toBe(200);
		const items = (await res.json()) as Array<{
			id: string;
			pendingRequest: unknown;
			snoozedUntil: string | null;
		}>;
		const fresh = items.find((t) => t.id === "task-fresh");
		expect(fresh).toBeDefined();
		expect(fresh?.pendingRequest).toBeNull();
		expect(fresh?.snoozedUntil).toBeNull();
	});

	it("returns pendingRequest with verb after a request lands", async () => {
		// Post a request to trigger the pending state.
		const r = await ctx.app.request("/api/tasks/task-pending/request", {
			method: "POST",
			headers: headers("u-founder"),
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-list-001" }),
		});
		expect(r.status).toBe(201);

		const res = await ctx.app.request("/api/tasks", {
			method: "GET",
			headers: headers("u-founder"),
		});
		expect(res.status).toBe(200);
		const items = (await res.json()) as Array<{
			id: string;
			pendingRequest: { verb: string } | null;
		}>;
		const pending = items.find((t) => t.id === "task-pending");
		expect(pending?.pendingRequest).not.toBeNull();
		expect(pending?.pendingRequest?.verb).toBe("request_stop");
	});

	it("returns snoozedUntil when the user has snoozed the task", async () => {
		await ctx.app.request("/api/tasks/task-fresh/snooze", {
			method: "POST",
			headers: headers("u-founder"),
			body: JSON.stringify({ hours: 24 }),
		});
		const res = await ctx.app.request("/api/tasks", {
			method: "GET",
			headers: headers("u-founder"),
		});
		const items = (await res.json()) as Array<{ id: string; snoozedUntil: string | null }>;
		const fresh = items.find((t) => t.id === "task-fresh");
		expect(fresh?.snoozedUntil).not.toBeNull();
	});
});
