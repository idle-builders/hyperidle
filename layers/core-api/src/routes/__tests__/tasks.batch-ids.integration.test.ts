/**
 * AU26 review W4 — `GET /api/tasks?ids=` reads N tasks in ONE request.
 *
 * The J4 move put the agent-run/task composition in the browser, and the first
 * cut fetched `GET /api/tasks/:id` once per task — re-introducing exactly the
 * N+1 that `@lore AB1 S2` had removed server-side ("Replaced N+1 pattern (one
 * query per session) with a single Drizzle query that JOINs sessions with
 * tasks"). The agent profile issued up to 11 requests where it used to issue 1;
 * the team roster issued one per busy agent.
 *
 * `work.list(db, "task", { ids })` already batched — only the route had no way
 * to ask for it. This is that way.
 */

import { type HyperIdleDb, tasks, teams } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-tasks-batch-ids";
const NOW = "2026-08-04T00:00:00.000Z";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedTasks(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "p-w4", name: "P", phase: "build", createdAt: NOW });
	await db.insert(tasks).values({
		id: "bet-w4",
		parentTaskId: null,
		teamId: "p-w4",
		title: "x",
		description: "x",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(tasks).values(
		["task-w4-a", "task-w4-b", "task-w4-c"].map((id) => ({
			id,
			parentTaskId: "bet-w4",
			teamId: "p-w4",
			title: `Title ${id}`,
			state: "proposed",
			createdAt: NOW,
			updatedAt: NOW,
		})),
	);
}

describe("GET /api/tasks?ids= reads many tasks in one request", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns exactly the requested tasks, in one request", async ({ db, app }) => {
		await seedTasks(db);

		const res = await app.request("/api/tasks?ids=task-w4-a,task-w4-c", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		// BB1: API returns parentTaskId (not rootTaskId); for 1-level deep tasks these are the same.
		const body = (await res.json()) as ReadonlyArray<{
			id: string;
			title: string;
			parentTaskId: string;
		}>;
		expect(body.map((t) => t.id).sort()).toEqual(["task-w4-a", "task-w4-c"]);
		// The two fields the run-state composition needs come back whole.
		expect(body.every((t) => t.title.startsWith("Title "))).toBe(true);
		expect(body.every((t) => t.parentTaskId === "bet-w4")).toBe(true);
	});

	test("an unknown id is simply absent — it does not fail the batch", async ({ db, app }) => {
		await seedTasks(db);

		const res = await app.request("/api/tasks?ids=task-w4-a,task-w4-nope", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as ReadonlyArray<{ id: string }>;
		expect(body.map((t) => t.id)).toEqual(["task-w4-a"]);
	});

	test("an empty ids list returns nothing, not every task", async ({ db, app }) => {
		await seedTasks(db);

		const res = await app.request("/api/tasks?ids=", { headers: authHeaders() });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});
});
