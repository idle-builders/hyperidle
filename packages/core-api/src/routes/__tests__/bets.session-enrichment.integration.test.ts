/**
 * L19 — GET /api/bets/:id task-row shape.
 *
 * @lore AU26 J4: `latestSessionOutcome` is GONE from this response. It was
 * core-api reading `agent-orchestration`'s `sessions` table to decorate a task
 * row for two renders (the outcome chip on the task sheet, the outcome sort
 * column). Founder ruling: *"orchestration now has an api so that the ui can get
 * the agent run state from the orchestration directly and combine this
 * information in the ui instead of in the core api service."* `WorkBet.tsx`
 * fetches `GET /api/agent-orchestration/runs/latest-outcomes?task_ids=…` and
 * merges it in; the "newest run per task wins, absent task = null" contract is
 * covered by `agent-orchestration-run-reads.integration.test.ts`.
 *
 * What stays covered here is what this route still owns: the task row's exact
 * key set and key order, and the 404 for an unknown bet.
 */

import { bets, type HyperIdleDb, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-bet-session-enrichment";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	await db.insert(teams).values({ id: "p1", name: "TestProduct", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(users).values({
		id: "agent-1",
		name: "Builder Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
}

const NOW = new Date().toISOString();

describe("L19 — GET /api/bets/:id — session enrichment", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 404 for an unknown bet id", async ({ db, app }) => {
		await seedBase(db);
		const res = await app.request("/api/bets/non-existent-bet", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("NOT_FOUND");
	});

	/**
	 * AU26 H2 (§D-M.3) then J4 — the `latestSessionOutcome` decoration left this
	 * route entirely. The key set and key ORDER of a task row (JSON.stringify
	 * follows insertion order) is otherwise unchanged, INCLUDING the deliberate
	 * omission of `outcomeRecordedBy` — a real `tasks` column that a naive
	 * `select().from(tasks)` recompose would leak. A live run is seeded below so
	 * a route that still held the read would fail this key-set assertion.
	 */
	test("bet-detail task rows keep their exact key set and key order", async ({ db, app }) => {
		await seedBase(db);

		await db.insert(bets).values({
			id: "bet-shape",
			teamId: "p1",
			description: "Shape pitch",
			appetite: "1 week",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "task-shape",
			betId: "bet-shape",
			teamId: "p1",
			title: "Shape task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
			outcomeVerdict: "met",
			outcomeRecordedAt: NOW,
			outcomeRecordedBy: "agent-1",
		});
		await db.insert(sessions).values({
			id: "session-shape",
			taskId: "task-shape",
			agentId: "agent-1",
			modelTier: "sonnet",
			startedAt: NOW,
			state: "done",
			outcome: "completed",
		});

		const res = await app.request("/api/bets/bet-shape", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { tasks: Array<Record<string, unknown>> };

		expect(Object.keys(body.tasks[0]!)).toEqual([
			"id",
			"betId",
			"teamId",
			"ownerAgentId",
			"title",
			"description",
			"doneCondition",
			"state",
			"dependencies",
			"artifacts",
			"threadId",
			"notes",
			"auditTrail",
			"createdAt",
			"updatedAt",
			"outcomeVerdict",
			"outcomeRecordedAt",
		]);
		expect(body.tasks[0]!.outcomeVerdict).toBe("met");
	});
});
