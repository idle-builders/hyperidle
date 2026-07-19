/**
 * AB2 — GET /teams/:id roster: agent operational status and health (RED phase)
 *
 * AC coverage:
 * AC-2: Each agent in roster has operationalStatus, healthLevel, healthDetail, activeTaskTitle
 * AC-4: Health computed from same AB1 signals (failureRate7d, lastSessionCrashed)
 * AC-6: Error state triggers notification; throttling prevents duplicate
 *
 * These tests FAIL until:
 * - RosterMember extended with operational fields in packages/shared/src/team.ts
 * - deriveHealthLevel / deriveHealthDetail exported from agent-profile.ts
 * - GET /teams/:id enriches roster with operational data
 * - maybeNotifyAgentError writes to notification_queue (throttled)
 */

import { bets, type HyperIdleDb, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { listNotifications } from "@hyperidle/notifications";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { deriveHealthDetail, deriveHealthLevel } from "../../routes/agent-profile.js";
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
		maxConcurrentSessions: 0,
		createdAt: NOW,
	});

	// AI agent — healthy, idle (no sessions)
	await db.insert(users).values({
		id: "ab2-agent-idle",
		kind: "ai",
		name: "AB2 Idle Agent",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 2,
		teamId: "ab2-tm",
		createdAt: NOW,
	});
}

// ---------------------------------------------------------------------------
// AC-2: Roster member has operationalStatus
// ---------------------------------------------------------------------------

describe("AB2 AC-2: GET /teams/:id roster includes operationalStatus", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns idle operationalStatus for an agent with no sessions", async ({ db, app }) => {
		await seedBase(db);
		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;
		expect(roster.length).toBeGreaterThan(0);

		const idleAgent = roster.find((m) => m.agentId === "ab2-agent-idle");
		expect(idleAgent).toBeDefined();
		expect(idleAgent?.operationalStatus).toBe("idle");
	});

	test("returns active operationalStatus when agent has an active session", async ({ db, app }) => {
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
		await db.insert(sessions).values({
			id: "ab2-sess-active",
			taskId: "ab2-task-1",
			agentId: "ab2-agent-idle",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});

		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;

		const agent = roster.find((m) => m.agentId === "ab2-agent-idle");
		expect(agent?.operationalStatus).toBe("active");
		expect(agent?.activeTaskTitle).toBe("Implement feature");
		expect(agent?.activeTaskId).toBe("ab2-task-1");
	});

	test("returns healthLevel field for each roster member", async ({ db, app }) => {
		await seedBase(db);
		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;

		for (const member of roster) {
			expect(member).toHaveProperty("healthLevel");
			const hl = member.healthLevel;
			expect(["healthy", "warning", "critical"]).toContain(hl);
		}
	});

	test("returns healthDetail field for each roster member", async ({ db, app }) => {
		await seedBase(db);
		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;

		for (const member of roster) {
			expect(member).toHaveProperty("healthDetail");
			expect(typeof member.healthDetail).toBe("string");
		}
	});

	test("returns healthy when agent has no sessions", async ({ db, app }) => {
		await seedBase(db);
		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;

		const idleAgent = roster.find((m) => m.agentId === "ab2-agent-idle");
		expect(idleAgent?.healthLevel).toBe("healthy");
	});
});

// ---------------------------------------------------------------------------
// AC-4: Health computed from AB1 signals (critical when >50% crashes)
// ---------------------------------------------------------------------------

describe("AB2 AC-4: Health computed from AB1 signals", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns critical healthLevel when agent has >50% crash rate in 7d", async ({ db, app }) => {
		await seedBase(db);
		// Seed 3 crashed sessions + 1 success = 75% crash rate
		await db.insert(bets).values({
			id: "ab2-bet-health",
			teamId: "ab2-team",
			description: "Health bet",
			status: "active",
			createdAt: NOW,
		});

		for (let i = 1; i <= 4; i++) {
			const paddedId = i.toString().padStart(2, "0");
			await db.insert(tasks).values({
				id: `ab2-task-health-${paddedId}`,
				betId: "ab2-bet-health",
				teamId: "ab2-team",
				title: `Task ${i}`,
				state: "completed",
				createdAt: NOW,
				updatedAt: NOW,
			});
			await db.insert(sessions).values({
				id: `ab2-sess-health-${paddedId}`,
				taskId: `ab2-task-health-${paddedId}`,
				agentId: "ab2-agent-idle",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: THREE_DAYS_AGO,
				state: "completed",
				outcome: i <= 3 ? "crashed" : "completed",
			});
		}

		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;

		const agent = roster.find((m) => m.agentId === "ab2-agent-idle");
		expect(agent?.healthLevel).toBe("critical");
	});

	test("returns warning healthLevel when agent has lastSessionCrashed", async ({ db, app }) => {
		await seedBase(db);
		await db.insert(bets).values({
			id: "ab2-bet-warn",
			teamId: "ab2-team",
			description: "Warn bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "ab2-task-warn",
			betId: "ab2-bet-warn",
			teamId: "ab2-team",
			title: "Crashed task",
			state: "completed",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(sessions).values({
			id: "ab2-sess-warn",
			taskId: "ab2-task-warn",
			agentId: "ab2-agent-idle",
			modelTier: "workhorse",
			startedAt: THREE_DAYS_AGO,
			endedAt: THREE_DAYS_AGO,
			state: "completed",
			outcome: "crashed",
		});

		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;

		const agent = roster.find((m) => m.agentId === "ab2-agent-idle");
		// Either warning or critical is acceptable for a single crash
		expect(["warning", "critical"]).toContain(agent?.healthLevel);
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

	test("deriveHealthLevel returns 'critical' when failureRate7d > 0.5", async ({}) => {
		const result = deriveHealthLevel({ failureRate7d: 0.75, lastSessionCrashed: false });
		expect(result).toBe("critical");
	});

	test("deriveHealthLevel returns 'warning' when lastSessionCrashed", async ({}) => {
		const result = deriveHealthLevel({ failureRate7d: 0, lastSessionCrashed: true });
		expect(result).toBe("warning");
	});

	test("deriveHealthLevel returns 'healthy' when no issues", async ({}) => {
		const result = deriveHealthLevel({ failureRate7d: 0, lastSessionCrashed: false });
		expect(result).toBe("healthy");
	});

	test("deriveHealthDetail returns a non-empty string for each health level", async ({}) => {
		const criticalDetail = deriveHealthDetail({ failureRate7d: 0.75, lastSessionCrashed: false });
		const warningDetail = deriveHealthDetail({ failureRate7d: 0, lastSessionCrashed: true });
		const healthyDetail = deriveHealthDetail({ failureRate7d: 0, lastSessionCrashed: false });

		expect(typeof criticalDetail).toBe("string");
		expect(criticalDetail.length).toBeGreaterThan(0);
		expect(typeof warningDetail).toBe("string");
		expect(warningDetail.length).toBeGreaterThan(0);
		expect(typeof healthyDetail).toBe("string");
		expect(healthyDetail.length).toBeGreaterThan(0);
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
