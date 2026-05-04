/**
 * L15 CRITICAL-3 — Cross-team authz for POST /api/tasks/:id/request.
 *
 * Source: docs/work-packages/L15-plan.md §2.6 + §10 row 10 + §12 (row
 * `tasks.request-authz.test.ts`).
 *
 * Locked: 404 (NOT 403) on cross-team or phantom identity to avoid
 * information leak about task existence in another team.
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

const TEST_API_KEY = "test-key-authz";

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
		.values({ id: "team-A", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(teams)
		.values({ id: "team-B", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(agents)
		.values({ id: "u-founder", name: "F", role: "founder", status: "active", createdAt: now })
		.run();
	db.insert(agents)
		.values({
			id: "agent-A",
			name: "A",
			role: "builder",
			status: "active",
			teamId: "team-A",
			createdAt: now,
		})
		.run();
	db.insert(agents)
		.values({
			id: "agent-B",
			name: "B",
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
			title: "T",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	return { app, db };
}

describe("POST /api/tasks/:id/request — authorization", () => {
	let ctx: Ctx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setup();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("(a) senderId = u-founder → 201 (founder bypass)", async () => {
		const res = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: headers("u-founder"),
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-founder-001" }),
		});
		expect(res.status).toBe(201);
	});

	it("(b) team-member agent on a task in their team → 201", async () => {
		const res = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: headers("agent-A"),
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-team-A-001" }),
		});
		expect(res.status).toBe(201);
	});

	it("(c) cross-team agent attempting a request → 404, no thread row created, no participant added", async () => {
		const res = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: headers("agent-B"),
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-cross-001" }),
		});
		expect(res.status).toBe(404);
		// Regression: security MUST-FIX-1 — cross-team and not-exist branches
		// must return byte-identical 404 bodies so the response is not an
		// existence oracle.
		const body = (await res.json()) as { error: string; code: string };
		expect(body.code).toBe("NOT_FOUND");
		expect(body.error).toBe("Task not found");

		const after = ctx.db.select().from(tasks).where(eq(tasks.id, "task-A")).get();
		expect(after?.threadId).toBeNull();
		const taskThreads = ctx.db
			.select()
			.from(threads)
			.where(eq(threads.hostId, "task-A"))
			.all();
		expect(taskThreads).toHaveLength(0);
	});

	it("(d) phantom identity (no agents row, not founder) → 404", async () => {
		const res = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: headers("ghost-identity-xyz"),
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-phantom-001" }),
		});
		expect(res.status).toBe(404);
		// Regression: security MUST-FIX-1 — phantom-id and not-exist must be
		// byte-identical so the response cannot leak existence.
		const body = (await res.json()) as { error: string; code: string };
		expect(body.code).toBe("NOT_FOUND");
		expect(body.error).toBe("Task not found");
	});

	it("(e1) cross-team 404 body is byte-identical to not-exist 404 body", async () => {
		// Regression: security MUST-FIX-1 — without identical bodies, the code
		// case is a 1-bit oracle for task existence across teams.
		const crossTeam = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: headers("agent-B"),
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-oracle-001" }),
		});
		const notExist = await ctx.app.request("/api/tasks/task-DOES-NOT-EXIST/request", {
			method: "POST",
			headers: headers("agent-B"),
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-oracle-002" }),
		});
		expect(crossTeam.status).toBe(notExist.status);
		const cb = (await crossTeam.json()) as Record<string, unknown>;
		const nb = (await notExist.json()) as Record<string, unknown>;
		expect(cb).toEqual(nb);
	});

	it("(e) cross-team-founder pollution: agent-B never appears as a participant on task-A's thread", async () => {
		// agent-A makes a legitimate request first (creates the thread).
		const r1 = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: headers("agent-A"),
			body: JSON.stringify({ verb: "request_stop", clientKey: "ck-pollute-001" }),
		});
		expect(r1.status).toBe(201);

		// agent-B (cross-team) attempts a request on task-A → 404.
		const r2 = await ctx.app.request("/api/tasks/task-A/request", {
			method: "POST",
			headers: headers("agent-B"),
			body: JSON.stringify({ verb: "request_hold", clientKey: "ck-pollute-002" }),
		});
		expect(r2.status).toBe(404);

		// Verify task-A's thread participants do NOT include agent-B.
		const after = ctx.db.select().from(tasks).where(eq(tasks.id, "task-A")).get();
		const threadRow = ctx.db
			.select()
			.from(threads)
			.where(eq(threads.id, after?.threadId as string))
			.get();
		const participants = threadRow?.participants as unknown;
		const list: string[] = Array.isArray(participants)
			? (participants as string[])
			: typeof participants === "string"
				? (JSON.parse(participants) as string[])
				: [];
		expect(list).not.toContain("agent-B");
	});
});
