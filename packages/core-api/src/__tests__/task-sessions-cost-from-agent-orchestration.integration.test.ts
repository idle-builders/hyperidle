/**
 * AU21 §9 Increment 6, Wave 2 (Decision D) — wiring `GET /api/tasks/:id/
 * sessions`'s `cost` field to `AgentOrchestrationPort`, RED phase.
 *
 * `tasks.ts:199` hardcodes `cost: null` today (`@lore O2`: the kernel
 * `sessions` table has no cost column, deliberately). Per `architecture.md`
 * §9 Increment 6 / §13: "`add`... Application wiring for `core-ui`, serving
 * per-session cost (replacing `tasks.ts`'s `cost: null`)." This is the
 * BEHAVIORAL proof that the wiring landed — not an import-resolution RED
 * (the route already exists and returns 200 today), but an ASSERTION red:
 * today this test's second assertion fails because the route always
 * returns `cost: null`, even when agent-orchestration has a real recorded
 * `costCents` for that exact session.
 *
 * Seeds the same task/session shape `AF12-task-sessions-endpoint.
 * integration.test.ts` already covers (that file's own assertions — 200,
 * `sessions` shape, 404 — are untouched by this wave, still green), PLUS an
 * `agentSessionRequests` row (agent-orchestration's own table) whose
 * `sessionId` matches the seeded `sessions.id`, carrying a recorded
 * `costCents` — exactly what Wave 1's `session-cost-recorder.ts` would have
 * written at real `session_ended` time.
 */

import {
	agentSessionRequests,
	bets,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-au21-inc6-task-session-cost";
const NOW = new Date().toISOString();

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

interface SessionsResponse {
	sessions: Array<{ id: string; status: string; agent: string; cost: number | null }>;
}

async function seed(db: import("@hyperidle/db").HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "prod-inc6", name: "Test", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "team-inc6", teamId: "prod-inc6", capacity: 3, activeBets: 1, formedAt: NOW });
	await db.insert(users).values({
		id: "agent-inc6",
		name: "Builder Bot",
		role: "builder",
		status: "idle",
		teamId: "team-inc6",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: "bet-inc6",
		teamId: "prod-inc6",
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-inc6",
		betId: "bet-inc6",
		teamId: "prod-inc6",
		title: "Test Task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	// Completed, costed session — the one this wave's assertion targets.
	await db.insert(sessions).values({
		id: "sess-inc6-costed",
		taskId: "task-inc6",
		agentId: "agent-inc6",
		modelTier: "workhorse",
		startedAt: NOW,
		endedAt: NOW,
		state: "stopped",
		outcome: "completed",
	});
	// agent-orchestration's OWN record of that session — Wave 1's write path,
	// simulated directly here (this wave tests the READ side only).
	await db.insert(agentSessionRequests).values({
		id: "req-inc6-costed",
		sourceKind: "task",
		sourceId: "task-inc6",
		streamId: "task:task-inc6",
		agentId: "agent-inc6",
		promptMode: "task",
		sourceCorrelationJson: JSON.stringify({}),
		idempotencyKey: "req-inc6-costed-key",
		status: "completed",
		sessionId: "sess-inc6-costed",
		costCents: 8800,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("GET /api/tasks/:id/sessions serves real per-session cost from agent-orchestration", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("a session with agent-orchestration-recorded cost reports it, not null", async ({
		db,
		app,
	}) => {
		await seed(db);
		const res = await app.request("/api/tasks/task-inc6/sessions", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as SessionsResponse;
		const costed = body.sessions.find((s) => s.id === "sess-inc6-costed");
		expect(costed).toBeDefined();
		// RED today: current tasks.ts hardcodes `cost: null` unconditionally
		// (@lore O2) — this fails until AgentOrchestrationPort wiring lands.
		expect(costed?.cost).toBe(8800);
	});
});
