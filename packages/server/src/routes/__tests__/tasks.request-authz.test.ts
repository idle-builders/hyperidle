/**
 * L15 — POST /api/tasks/:id/request authz (CRITICAL-3, cross-team isolation).
 *
 * Source: L15-plan.md § 2.6 (`assertTaskParticipantAuthz`) + § 12 protected
 * row `tasks.request-authz.test.ts`.
 *
 * Resolution order:
 *   1. senderId === "u-founder" → 201 (global founder bypass)
 *   2. agents.id === senderId AND agent.role === "founder" → 201
 *   3. agents.id === senderId AND agent.team_id === task.team_id → 201
 *   4. otherwise → 404 (anti-information-leak per § 10 row 10)
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
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";
import { __resetTaskRequestRateLimiter } from "../tasks.js";

const TEST_API_KEY = "test-key-tasks-authz";

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
		.values({ id: "team-A", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(teams)
		.values({ id: "team-B", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(agents)
		.values({ id: "u-founder", name: "Founder", role: "founder", status: "active", createdAt: now })
		.run();
	db.insert(agents)
		.values({
			id: "agent-A1",
			name: "Agent in team-A",
			role: "builder",
			status: "active",
			teamId: "team-A",
			createdAt: now,
		})
		.run();
	db.insert(agents)
		.values({
			id: "agent-B1",
			name: "Agent in team-B",
			role: "builder",
			status: "active",
			teamId: "team-B",
			createdAt: now,
		})
		.run();
	db.insert(bets)
		.values({
			id: "bet-A",
			productId: "p1",
			teamId: "team-A",
			pitch: "x",
			appetite: "small",
			status: "in_progress",
			createdAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-A",
			betId: "bet-A",
			productId: "p1",
			teamId: "team-A",
			title: "Task in team-A",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	return { app, db };
}

describe("POST /api/tasks/:id/request — authz / cross-team isolation", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		__resetTaskRequestRateLimiter();
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("(a) founder default identity (`u-founder`) bypasses team membership → 201", async () => {
		const res = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verb: "request_stop", clientKey: "founder-bypass-key" }),
		});
		expect(res.status).toBe(201);
	});

	it("(b) same-team agent identity → 201", async () => {
		const res = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "agent-A1" }),
			body: JSON.stringify({ verb: "request_stop", clientKey: "same-team-key1" }),
		});
		expect(res.status).toBe(201);
	});

	it("(c) cross-team agent identity → 404 (no info leak; no thread row created)", async () => {
		const res = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "agent-B1" }),
			body: JSON.stringify({ verb: "request_stop", clientKey: "cross-team-key1" }),
		});
		expect(res.status).toBe(404);

		// No thread row was created for task-A.
		const after = ctx.db
			.select({ threadId: tasks.threadId })
			.from(tasks)
			.where(eq(tasks.id, "task-A"))
			.get();
		expect(after?.threadId).toBeNull();

		const taskThreads = ctx.db.select().from(threads).where(eq(threads.hostId, "task-A")).all();
		expect(taskThreads.length).toBe(0);
	});

	it("(d) phantom identity (no `agents.id` row, not the founder constant) → 404", async () => {
		const res = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "ghost-agent-zzz" }),
			body: JSON.stringify({ verb: "request_stop", clientKey: "phantom-key1" }),
		});
		expect(res.status).toBe(404);
	});

	it("(f) founder posts first then same-team agent posts second → both 201, participants now include both (L15 review CRITICAL-2)", async () => {
		// Founder creates the thread first.
		const first = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verb: "request_stop", clientKey: "founder-first-key" }),
		});
		expect(first.status).toBe(201);
		const firstBody = (await first.json()) as { thread: { id: string } };
		const taskThreadId = firstBody.thread.id;

		// Same-team agent posts second; should NOT be 403.
		const second = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "agent-A1" }),
			body: JSON.stringify({ verb: "request_hold", clientKey: "agent-second-key" }),
		});
		expect(second.status).toBe(201);

		// Participants now include both.
		const row = ctx.db.select().from(threads).where(eq(threads.id, taskThreadId)).get();
		const participants = JSON.parse(row?.participants ?? "[]") as string[];
		expect(participants).toContain("u-founder");
		expect(participants).toContain("agent-A1");
	});

	it("(e) cross-team-founder pollution: agent-B1 cannot become a participant on task-A's thread", async () => {
		// First a same-team writer creates the thread.
		const ok = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "agent-A1" }),
			body: JSON.stringify({ verb: "request_stop", clientKey: "polluter-prereq" }),
		});
		expect(ok.status).toBe(201);
		const okBody = (await ok.json()) as { thread: { id: string } };
		const taskThreadId = okBody.thread.id;

		// Then a cross-team agent tries — must 404 with no participant addition.
		const res = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "agent-B1" }),
			body: JSON.stringify({ verb: "request_stop", clientKey: "polluter-attempt" }),
		});
		expect(res.status).toBe(404);

		// Read participants column directly.
		const row = ctx.db.select().from(threads).where(eq(threads.id, taskThreadId)).get();
		expect(row).toBeDefined();
		const participants = JSON.parse(row?.participants ?? "[]") as string[];
		expect(participants).not.toContain("agent-B1");
	});
});
