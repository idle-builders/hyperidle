/**
 * AF12 — AC4: GET /api/tasks/:id/sessions returns a task's sessions for viewing,
 * with active/completed/stopped indicators keyed off session `state`.
 *
 * Contract (matches the `useTaskSessions` hook's `{ sessions: TaskSession[] }`):
 *   - 200 + { sessions } for a known task
 *   - each session carries `status` === the session `state` (drives the live dot)
 *   - a cascade-stopped session reports status 'stopped' (non-blank label downstream)
 *   - 404 for an unknown task
 *
 * @lore AF12 RED: the endpoint does not exist yet — current `tasks.ts` has no
 * GET /:id/sessions route, so these 404 (route-miss) until the green phase adds
 * the read-only endpoint.
 */

import { bets, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-af12-sessions";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seed(db: import("@hyperidle/db").HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "prod-1", name: "Test", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "team-1", teamId: "prod-1", capacity: 3, activeBets: 1, formedAt: now });
	await db.insert(users).values({
		id: "agent-1",
		name: "Builder Bot",
		role: "builder",
		status: "idle",
		teamId: "team-1",
		createdAt: now,
	});
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "prod-1",
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-1",
		teamId: "prod-1",
		title: "Test Task",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	// Active session (drives the live dot).
	await db.insert(sessions).values({
		id: "sess-active",
		taskId: "task-1",
		agentId: "agent-1",
		modelTier: "workhorse",
		startedAt: now,
		state: "active",
	});
	// Cascade-stopped session — status must report 'stopped'.
	await db.insert(sessions).values({
		id: "sess-stopped",
		taskId: "task-1",
		agentId: "agent-1",
		modelTier: "workhorse",
		startedAt: now,
		endedAt: now,
		state: "stopped",
		outcome: "stopped",
	});
}

interface SessionsResponse {
	sessions: Array<{ id: string; status: string; agent: string }>;
}

describe("AF12 AC4 — GET /api/tasks/:id/sessions", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 200 with the task's sessions", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/tasks/task-1/sessions", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as SessionsResponse;
		expect(Array.isArray(body.sessions)).toBe(true);
		expect(body.sessions).toHaveLength(2);
	});

	test("active session reports status 'active' (drives the live dot)", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/tasks/task-1/sessions", { headers: authHeaders() });
		const body = (await res.json()) as SessionsResponse;
		const active = body.sessions.find((s) => s.id === "sess-active");
		expect(active?.status).toBe("active");
	});

	test("cascade-stopped session reports status 'stopped' (non-blank indicator)", async ({
		db,
		app,
	}) => {
		await seed(db);
		const res = await app.request("/api/tasks/task-1/sessions", { headers: authHeaders() });
		const body = (await res.json()) as SessionsResponse;
		const stopped = body.sessions.find((s) => s.id === "sess-stopped");
		expect(stopped?.status).toBe("stopped");
	});

	test("returns 404 for an unknown task", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/tasks/does-not-exist/sessions", { headers: authHeaders() });
		expect(res.status).toBe(404);
	});

	test("returns an empty sessions array for a task with no sessions", async ({ db, app }) => {
		const now = new Date().toISOString();
		await seed(db);
		await db.insert(tasks).values({
			id: "task-empty",
			betId: "bet-1",
			teamId: "prod-1",
			title: "Empty Task",
			state: "proposed",
			createdAt: now,
			updatedAt: now,
		});
		const res = await app.request("/api/tasks/task-empty/sessions", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as SessionsResponse;
		expect(body.sessions).toHaveLength(0);
	});
});
