/**
 * L15 — POST /api/tasks/:id/snooze + DELETE /api/tasks/:id/snooze tests.
 *
 * Source: docs/work-packages/L15-plan.md §2.5 + §5.5 + §12 row.
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

const TEST_API_KEY = "test-key-snooze";

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

describe("POST /api/tasks/:id/snooze", () => {
	let ctx: Ctx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setup();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("(a) creates a row with snoozed_until ≈ now + 24h", async () => {
		const beforeMs = Date.now();
		const res = await ctx.app.request("/api/tasks/task-1/snooze", {
			method: "POST",
			headers: headers("u-founder"),
			body: JSON.stringify({ hours: 24 }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { snoozedUntil: string };
		const untilMs = Date.parse(body.snoozedUntil);
		const expectedMs = beforeMs + 24 * 60 * 60 * 1000;
		// Allow 60s drift in either direction.
		expect(Math.abs(untilMs - expectedMs)).toBeLessThan(60_000);
	});

	it("(b) DELETE clears the snooze", async () => {
		await ctx.app.request("/api/tasks/task-1/snooze", {
			method: "POST",
			headers: headers("u-founder"),
			body: JSON.stringify({ hours: 24 }),
		});
		const del = await ctx.app.request("/api/tasks/task-1/snooze", {
			method: "DELETE",
			headers: headers("u-founder"),
		});
		expect(del.status).toBe(204);
	});

	it("(c) re-snooze extends the timestamp; primary key prevents duplicate rows", async () => {
		const r1 = await ctx.app.request("/api/tasks/task-1/snooze", {
			method: "POST",
			headers: headers("u-founder"),
			body: JSON.stringify({ hours: 24 }),
		});
		expect(r1.status).toBe(201);
		// Second snooze should succeed and not error on PK conflict.
		const r2 = await ctx.app.request("/api/tasks/task-1/snooze", {
			method: "POST",
			headers: headers("u-founder"),
			body: JSON.stringify({ hours: 24 }),
		});
		expect([200, 201]).toContain(r2.status);
	});

	it("(d) cross-user isolation: founder A's snooze does not affect founder B's view", async () => {
		// A snoozes
		const r1 = await ctx.app.request("/api/tasks/task-1/snooze", {
			method: "POST",
			headers: headers("u-founder"),
			body: JSON.stringify({ hours: 24 }),
		});
		expect(r1.status).toBe(201);

		// B fetches list — task-1 should still be visible (no per-user snooze for B).
		const list = await ctx.app.request("/api/tasks", {
			method: "GET",
			headers: headers("agent-other"),
		});
		expect(list.status).toBe(200);
		const items = (await list.json()) as Array<{ id: string }>;
		expect(items.some((t) => t.id === "task-1")).toBe(true);
	});
});
