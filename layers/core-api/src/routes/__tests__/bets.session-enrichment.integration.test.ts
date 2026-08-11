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
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-bet-session-enrichment";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

async function seedBase(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();

	await db
		.insert(teams)
		.values({ id: ids("p1"), name: "TestProduct", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: ids("t1"), teamId: ids("p1"), capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(users).values({
		id: ids("agent-1"),
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

	test("returns 404 for an unknown bet id", async ({ db, app, ids }) => {
		await seedBase(db, ids);
		// AU38 P4: a derived id nobody inserted stays absent in a populated world.
		const res = await app.request(`/api/bets/${ids("nonexistent")}`, {
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
	test("bet-detail task rows keep their exact key set and key order", async ({ db, app, ids }) => {
		await seedBase(db, ids);

		await db.insert(bets).values({
			id: ids("bet-shape"),
			teamId: ids("p1"),
			description: "Shape pitch",
			appetite: "1 week",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: ids("task-shape"),
			betId: ids("bet-shape"),
			teamId: ids("p1"),
			title: "Shape task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
			outcomeVerdict: "met",
			outcomeRecordedAt: NOW,
			outcomeRecordedBy: ids("agent-1"),
		});
		await db.insert(sessions).values({
			id: ids("session-shape"),
			taskId: ids("task-shape"),
			agentId: ids("agent-1"),
			modelTier: "sonnet",
			startedAt: NOW,
			state: "done",
			outcome: "completed",
		});

		const res = await app.request(`/api/bets/${ids("bet-shape")}`, {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { tasks: Array<Record<string, unknown>> };

		// The route scopes tasks to the requested bet; this test arranged exactly
		// one task on it, so find-by-id and [0] are the same row — predicate-find
		// keeps the assertion independent of list position (AU38 P5).
		const row = body.tasks.find((t) => t.id === ids("task-shape"));
		expect(row).toBeDefined();
		expect(Object.keys(row!)).toEqual([
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
		expect(row!.outcomeVerdict).toBe("met");
	});
});
