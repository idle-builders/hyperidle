/**
 * `agent-orchestration` serves agent-run state on its own API.
 *
 * Founder ruling (2026-08-04, verbatim): *"its all for UI? thats why
 * orchestration now has an api so that the ui can get the agent run state from
 * the orchestration directly and combine this information in the ui instead of
 * in the core api service."*
 *
 * Four reads, on the Layer that owns the table, mounted at
 * `/api/agent-orchestration` — the same read-door router `AgentOrchestrationPort`
 * already uses. No new `AgentOrchestrationPort` method backs any of them: the
 * browser calls these directly.
 *
 * This file lives under `core-api/src/__tests__` because it needs the composed
 * two-Layer Application the `{ db, app }` fixture builds; the routes under test
 * are `layers/agent-orchestration/src/routes/agent-orchestration-sessions.ts`.
 */

import { bets, type HyperIdleDb, sessions, tasks, teams, users } from "@hyperidle/db";
import type {
	AgentRunActiveCountsResponse,
	AgentRunLatestOutcomesResponse,
	AgentRunsResponse,
} from "@hyperidle/domain-model";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-run-reads";
const T1 = "2026-08-01T00:00:00.000Z";
const T2 = "2026-08-02T00:00:00.000Z";
const T3 = "2026-08-03T00:00:00.000Z";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/**
 * Two agents, two tasks, four runs:
 *   task-1: run-a (agent-1, done/completed, T1), run-b (agent-1, active, T3)
 *   task-2: run-c (agent-2, done/crashed, T2)
 *   no task: run-d (agent-2, active, T2)
 */
async function seed(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "team-1", name: "Team", phase: "build", createdAt: T1 });
	await db.insert(users).values([
		{
			id: "agent-1",
			kind: "ai",
			name: "One",
			role: "builder",
			status: "idle",
			teamId: "team-1",
			createdAt: T1,
		},
		{
			id: "agent-2",
			kind: "ai",
			name: "Two",
			role: "builder",
			status: "idle",
			teamId: "team-1",
			createdAt: T1,
		},
	]);
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "team-1",
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: T1,
	});
	await db.insert(tasks).values([
		{
			id: "task-1",
			betId: "bet-1",
			teamId: "team-1",
			title: "One",
			state: "in_progress",
			createdAt: T1,
			updatedAt: T1,
		},
		{
			id: "task-2",
			betId: "bet-1",
			teamId: "team-1",
			title: "Two",
			state: "review",
			createdAt: T1,
			updatedAt: T1,
		},
	]);
	await db.insert(sessions).values([
		{
			id: "run-a",
			agentId: "agent-1",
			taskId: "task-1",
			modelTier: "workhorse",
			startedAt: T1,
			endedAt: T1,
			state: "done",
			outcome: "completed",
			effectivenessScore: "0.75",
		},
		{
			id: "run-b",
			agentId: "agent-1",
			taskId: "task-1",
			modelTier: "workhorse",
			startedAt: T3,
			state: "active",
		},
		{
			id: "run-c",
			agentId: "agent-2",
			taskId: "task-2",
			modelTier: "workhorse",
			startedAt: T2,
			endedAt: T2,
			state: "done",
			outcome: "crashed",
		},
		{
			id: "run-d",
			agentId: "agent-2",
			taskId: null,
			modelTier: "workhorse",
			startedAt: T2,
			state: "active",
		},
	]);
}

describe("agent-orchestration run reads", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("runs by task id, newest first, with the eight consumed fields", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/agent-orchestration/runs?task_id=task-1", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as AgentRunsResponse;
		expect(body.runs.map((r) => r.id)).toEqual(["run-b", "run-a"]);
		const [newest, oldest] = body.runs;
		expect(newest).toEqual({
			id: "run-b",
			agentId: "agent-1",
			taskId: "task-1",
			startedAt: T3,
			endedAt: null,
			state: "active",
			outcome: null,
			effectivenessScore: null,
		});
		expect(oldest?.effectivenessScore).toBe("0.75");
	});

	test("a task with no run returns an empty list", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/agent-orchestration/runs?task_id=nope", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		expect(((await res.json()) as AgentRunsResponse).runs).toEqual([]);
	});

	test("runs by agent ids, newest first across all given agents", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/agent-orchestration/runs?agent_ids=agent-1,agent-2", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as AgentRunsResponse;
		expect(body.runs.map((r) => r.id)).toEqual(["run-b", "run-c", "run-d", "run-a"]);
	});

	test("an empty agent_ids list returns an empty list, not every run", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/agent-orchestration/runs?agent_ids=", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		expect(((await res.json()) as AgentRunsResponse).runs).toEqual([]);
	});

	test("neither task_id nor agent_ids is a 400", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/agent-orchestration/runs", { headers: authHeaders() });
		expect(res.status).toBe(400);
	});

	test("active counts, unscoped, omit agents with no active run", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/agent-orchestration/runs/active-counts", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as AgentRunActiveCountsResponse;
		expect(body.counts).toEqual({ "agent-1": 1, "agent-2": 1 });
	});

	test("active counts scoped to given agents", async ({ db, app }) => {
		await seed(db);
		const res = await app.request(
			"/api/agent-orchestration/runs/active-counts?agent_ids=agent-1,agent-3",
			{ headers: authHeaders() },
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as AgentRunActiveCountsResponse;
		expect(body.counts).toEqual({ "agent-1": 1 });
	});

	test("latest outcome per task, newest run wins, unknown task absent", async ({ db, app }) => {
		await seed(db);
		const res = await app.request(
			"/api/agent-orchestration/runs/latest-outcomes?task_ids=task-1,task-2,task-none",
			{ headers: authHeaders() },
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as AgentRunLatestOutcomesResponse;
		// task-1's newest run is run-b (active, no outcome yet) — null, not "completed".
		expect(body.outcomes).toEqual({ "task-1": null, "task-2": "crashed" });
	});

	test("an empty task_ids list returns an empty map", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/agent-orchestration/runs/latest-outcomes?task_ids=", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		expect(((await res.json()) as AgentRunLatestOutcomesResponse).outcomes).toEqual({});
	});

	test("the run reads are read-only — POST is not served", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/agent-orchestration/runs?task_id=task-1", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});
});
