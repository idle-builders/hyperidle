/**
 * AB2 — GET /teams/:id roster: what core-api still serves, and what it still does.
 *
 * @lore AU26 J4: `operationalStatus`, `activeTaskTitle`, `activeTaskId`,
 * `activeBetId`, `healthLevel` and `healthDetail` were REMOVED from the roster —
 * every one was derived in core-api from `agent-orchestration`'s `sessions`
 * table purely to render the team page, and the page now fetches the runs from
 * that Layer's own API and derives them itself. AC-2 and AC-4's coverage of the
 * derivations lives with the derivations, in
 * `packages/shared/src/__tests__/health-signals.test.ts`.
 *
 * Two things stay here, and this file covers exactly those:
 *   - `harnessAvailable` per roster member — NOT run state; a fact about the
 *     server process's adapter pool, and an input to the browser's own
 *     `computeHealthSignals` call.
 *   - AC-6: a degraded agent still enqueues an `agent.health.degraded`
 *     notification. This is the ONE genuine core-side USE of run state on this
 *     route (it writes core's own `notification_queue`), and it is why the
 *     route's `sessions` read is the one AU26 leaves standing — see the BLOCKER
 *     note at the read site in `teams-routes.ts`.
 */

import {
	agentRunConfig,
	bets,
	type HyperIdleDb,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { listNotifications } from "@hyperidle/notifications";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-ab2-team-agents";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

const NOW = new Date().toISOString();
const THREE_DAYS_AGO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

/** Seed the minimum required rows for team agent tests. */
async function seedBase(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "ab2-team", name: "AB2 Test Team", phase: "build", createdAt: NOW });

	await db.insert(teamMembers).values({
		id: "ab2-tm",
		teamId: "ab2-team",
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});

	// Human founder — required for auth
	await db.insert(users).values({
		id: "u-founder-ab2",
		kind: "human",
		name: "AB2 Founder",
		role: "founder",
		status: "active",
		email: "ab2-founder@hyperidle.com",
		createdAt: NOW,
	});
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: "u-founder-ab2",
		maxConcurrentSessions: 0,
	});

	// AI agent — healthy, idle (no sessions)
	await db.insert(users).values({
		id: "ab2-agent-idle",
		kind: "ai",
		name: "AB2 Idle Agent",
		role: "builder",
		status: "active",
		teamId: "ab2-tm",
		createdAt: NOW,
	});
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: "ab2-agent-idle",
		maxConcurrentSessions: 2,
	});
}

// ---------------------------------------------------------------------------
// AC-2: Roster member has operationalStatus
// ---------------------------------------------------------------------------

describe("AB2 AC-2: GET /teams/:id roster shape", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("carries harnessAvailable and no run-derived fields", async ({ db, app }) => {
		await seedBase(db);
		await db.insert(bets).values({
			id: "ab2-bet-1",
			teamId: "ab2-team",
			description: "Test bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "ab2-task-1",
			betId: "ab2-bet-1",
			teamId: "ab2-team",
			title: "Implement feature",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		// A live run — a roster that still carried run state would report it.
		await db.insert(sessions).values({
			id: "ab2-sess-active",
			taskId: "ab2-task-1",
			agentId: "ab2-agent-idle",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});

		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;
		expect(roster.length).toBeGreaterThan(0);

		const agent = roster.find((m) => m.agentId === "ab2-agent-idle");
		expect(agent).toBeDefined();
		expect(typeof agent?.harnessAvailable).toBe("boolean");
		for (const field of [
			"operationalStatus",
			"activeTaskTitle",
			"activeTaskId",
			"activeBetId",
			"healthLevel",
			"healthDetail",
		]) {
			expect(agent).not.toHaveProperty(field);
		}
	});
});

// ---------------------------------------------------------------------------
// AC-6: Error notification throttling
// ---------------------------------------------------------------------------

describe("AB2 AC-6: Agent error state triggers notification (throttled)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("notification_queue gets a row when agent enters critical state", async ({ db, app }) => {
		await seedBase(db);
		// Seed enough crashes to trigger critical
		await db.insert(bets).values({
			id: "ab2-bet-notif",
			teamId: "ab2-team",
			description: "Notif bet",
			status: "active",
			createdAt: NOW,
		});
		for (let i = 1; i <= 4; i++) {
			const paddedId = i.toString().padStart(2, "0");
			await db.insert(tasks).values({
				id: `ab2-task-notif-${paddedId}`,
				betId: "ab2-bet-notif",
				teamId: "ab2-team",
				title: `Task ${i}`,
				state: "completed",
				createdAt: NOW,
				updatedAt: NOW,
			});
			await db.insert(sessions).values({
				id: `ab2-sess-notif-${paddedId}`,
				taskId: `ab2-task-notif-${paddedId}`,
				agentId: "ab2-agent-idle",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: THREE_DAYS_AGO,
				state: "completed",
				outcome: i <= 3 ? "crashed" : "completed",
			});
		}

		// Trigger the GET /teams/:id — this should enqueue a notification
		await app.request("/api/teams/ab2-team", { headers: authHeaders() });

		// maybeNotifyAgentError uses subjectId=agentId and eventType="agent.health.degraded"
		const notifications = (await listNotifications(db, { kind: "all" })).filter(
			(r) => r.subjectId === "ab2-agent-idle" && r.eventType === "agent.health.degraded",
		);

		expect(notifications.length).toBeGreaterThan(0);
	});
});
