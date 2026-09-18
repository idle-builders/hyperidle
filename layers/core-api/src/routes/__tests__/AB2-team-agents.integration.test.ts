/**
 * AB2 — GET /teams/:id roster: what core-api still serves, and what it still does.
 *
 * @lore AU26 J4: `operationalStatus`, `activeTaskTitle`, `activeTaskId`,
 * `activeBetId`, `healthLevel` and `healthDetail` were REMOVED from the roster —
 * every one was derived in core-api from `agent-orchestration`'s `sessions`
 * table purely to render the team page, and the page now fetches the runs from
 * that Layer's own API and derives them itself. AC-2 and AC-4's coverage of the
 * derivations lives with the derivations, in
 * `framework/domain-model/src/__tests__/health-signals.test.ts`.
 *
 * One thing stays here, and this file covers exactly that:
 *   - `harnessAvailable` per roster member — NOT run state; a fact about the
 *     server process's adapter pool, and an input to the browser's own
 *     `computeHealthSignals` call.
 *
 * @lore AU26: AB2's AC-6 ("a degraded agent enqueues an `agent.health.degraded`
 * notification") is NOT deleted — it MOVED off this route. The founder's ruling
 * made it event-driven: `registerAgentHealthSessionEndReactions` reacts to a
 * crashed `session_ended` and the notification system counts its own rows. That
 * closed the route's last `sessions` read (a GET that writes was a smell
 * independent of layering, and a notification that only fires when a human
 * happens to open a page is not a notification). The behavior lives in
 * `services/__tests__/agent-health-session-end-reactions.integration.test.ts`;
 * what this file now asserts is the REMOVAL — loading the team page enqueues
 * nothing, ever.
 */

import {
	agentRunConfig,
	type HyperIdleDb,
	sessions,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { listNotifications } from "@hyperidle/notifications";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

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
		teamId: "ab2-team",
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
		await db.insert(threads).values({
			id: `thr-${"ab2-bet-1"}`,
			hostKind: "team",
			hostId: "ab2-team",
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			threadId: `thr-${"ab2-bet-1"}`,
			id: "ab2-bet-1",
			parentTaskId: null,
			teamId: "ab2-team",
			title: "Test bet",
			description: "Test bet",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(threads).values({
			id: `thr-${"ab2-task-1"}`,
			hostKind: "team",
			hostId: "ab2-team",
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			threadId: `thr-${"ab2-task-1"}`,
			id: "ab2-task-1",
			parentTaskId: "ab2-bet-1",
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
// AU26: the GET no longer writes. AB2's AC-6 producer moved to a session_ended
// reactor; this asserts the route side of that move.
// ---------------------------------------------------------------------------

describe("AU26: GET /teams/:teamId enqueues nothing", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("a roster full of crashed runs still produces zero notification rows", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		// Seed enough crashes to trigger critical
		await db.insert(threads).values({
			id: `thr-${"ab2-bet-notif"}`,
			hostKind: "team",
			hostId: "ab2-team",
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			threadId: `thr-${"ab2-bet-notif"}`,
			id: "ab2-bet-notif",
			parentTaskId: null,
			teamId: "ab2-team",
			title: "Notif bet",
			description: "Notif bet",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		for (let i = 1; i <= 4; i++) {
			const paddedId = i.toString().padStart(2, "0");
			await db.insert(threads).values({
				id: `thr-${`ab2-task-notif-${paddedId}`}`,
				hostKind: "team",
				hostId: "ab2-team",
				initiatorId: "system:propagation",
				participants: "[]",
				lastActiveAt: NOW,
				createdAt: NOW,
			});
			await db.insert(tasks).values({
				threadId: `thr-${`ab2-task-notif-${paddedId}`}`,
				id: `ab2-task-notif-${paddedId}`,
				parentTaskId: "ab2-bet-notif",
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

		// The old producer ran here. Twice, to also rule out a throttled second write.
		const first = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		expect(first.status).toBe(200);
		const second = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		expect(second.status).toBe(200);

		// @lore AU44 batch 4: kind:"all" removed; unread covers all inbox rows (readAt IS NULL)
		expect(await listNotifications(db, { kind: "unread" })).toHaveLength(0);
	});
});
