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

import {
	bets,
	createTestDb,
	type HyperIdleDb,
	notificationQueue,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveHealthDetail, deriveHealthLevel } from "../../routes/agent-profile.js";
import { createTestApp } from "../../test-utils.js";

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
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedBase(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns idle operationalStatus for an agent with no sessions", async () => {
		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;
		expect(roster.length).toBeGreaterThan(0);

		const idleAgent = roster.find((m) => m.agentId === "ab2-agent-idle");
		expect(idleAgent).toBeDefined();
		expect(idleAgent?.operationalStatus).toBe("idle");
	});

	it("returns active operationalStatus when agent has an active session", async () => {
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

	it("returns healthLevel field for each roster member", async () => {
		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;

		for (const member of roster) {
			expect(member).toHaveProperty("healthLevel");
			const hl = member.healthLevel;
			expect(["healthy", "warning", "critical"]).toContain(hl);
		}
	});

	it("returns healthDetail field for each roster member", async () => {
		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;

		for (const member of roster) {
			expect(member).toHaveProperty("healthDetail");
			expect(typeof member.healthDetail).toBe("string");
		}
	});

	it("returns healthy when agent has no sessions", async () => {
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
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedBase(db);

		// Seed a bet + tasks for crash sessions
		await db.insert(bets).values({
			id: "ab2-bet-crash",
			teamId: "ab2-team",
			description: "Crash test bet",
			status: "active",
			createdAt: NOW,
		});
		for (let i = 1; i <= 6; i++) {
			const paddedId = i.toString().padStart(2, "0");
			await db.insert(tasks).values({
				id: `ab2-task-crash-${paddedId}`,
				betId: "ab2-bet-crash",
				teamId: "ab2-team",
				title: `Crash task ${paddedId}`,
				state: "completed",
				createdAt: NOW,
				updatedAt: NOW,
			});
		}
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("sets healthLevel=critical and operationalStatus=error when 5/6 sessions crashed in 7 days", async () => {
		// 5 crashed + 1 completed within 7 days = 83% failure rate
		for (let i = 1; i <= 5; i++) {
			const paddedId = i.toString().padStart(2, "0");
			await db.insert(sessions).values({
				id: `ab2-crash-sess-${paddedId}`,
				taskId: `ab2-task-crash-${paddedId}`,
				agentId: "ab2-agent-idle",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: THREE_DAYS_AGO,
				state: "completed",
				outcome: "crashed",
			});
		}
		await db.insert(sessions).values({
			id: "ab2-success-sess-06",
			taskId: "ab2-task-crash-06",
			agentId: "ab2-agent-idle",
			modelTier: "workhorse",
			startedAt: THREE_DAYS_AGO,
			endedAt: THREE_DAYS_AGO,
			state: "completed",
			outcome: "completed",
		});

		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;
		const agent = roster.find((m) => m.agentId === "ab2-agent-idle");

		expect(agent?.healthLevel).toBe("critical");
		expect(agent?.operationalStatus).toBe("error");
	});

	it("sets healthLevel=warning when lastSessionCrashed=true but failureRate<=50%", async () => {
		// 1 crash (most recent) + 2 success = 33% failure rate; last is a crash
		await db.insert(sessions).values([
			{
				id: "ab2-warn-s1",
				taskId: "ab2-task-crash-01",
				agentId: "ab2-agent-idle",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: THREE_DAYS_AGO,
				state: "completed",
				outcome: "completed",
			},
			{
				id: "ab2-warn-s2",
				taskId: "ab2-task-crash-02",
				agentId: "ab2-agent-idle",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: THREE_DAYS_AGO,
				state: "completed",
				outcome: "completed",
			},
			{
				id: "ab2-warn-s3",
				taskId: "ab2-task-crash-03",
				agentId: "ab2-agent-idle",
				modelTier: "workhorse",
				startedAt: NOW,
				endedAt: NOW,
				state: "completed",
				outcome: "crashed",
			},
		]);

		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;
		const agent = roster.find((m) => m.agentId === "ab2-agent-idle");

		// lastSessionCrashed + failureRate ~33% → degraded but not critical → warning
		expect(agent?.healthLevel).toBe("warning");
	});

	it("returns healthy for agent with all successful sessions", async () => {
		await db.insert(sessions).values({
			id: "ab2-healthy-s1",
			taskId: "ab2-task-crash-01",
			agentId: "ab2-agent-idle",
			modelTier: "workhorse",
			startedAt: THREE_DAYS_AGO,
			endedAt: THREE_DAYS_AGO,
			state: "completed",
			outcome: "completed",
		});

		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		const roster = body.roster as Array<Record<string, unknown>>;
		const agent = roster.find((m) => m.agentId === "ab2-agent-idle");

		expect(agent?.healthLevel).toBe("healthy");
		expect(agent?.operationalStatus).toBe("idle");
	});
});

// ---------------------------------------------------------------------------
// AC-6: Notification enqueued on error transition; throttled on repeat
// ---------------------------------------------------------------------------

describe("AB2 AC-6: Notification on error transition (throttled)", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedBase(db);

		// Seed sessions to put agent in error state (3 crashes in 7d)
		await db.insert(bets).values({
			id: "ab2-bet-notif",
			teamId: "ab2-team",
			description: "Notif test bet",
			status: "active",
			createdAt: NOW,
		});
		for (let i = 1; i <= 3; i++) {
			const paddedId = i.toString().padStart(2, "0");
			await db.insert(tasks).values({
				id: `ab2-task-notif-${paddedId}`,
				betId: "ab2-bet-notif",
				teamId: "ab2-team",
				title: `Notif task ${paddedId}`,
				state: "completed",
				createdAt: NOW,
				updatedAt: NOW,
			});
			// 3 out of 3 crashed → 100% failure rate → error state
			await db.insert(sessions).values({
				id: `ab2-notif-s${paddedId}`,
				taskId: `ab2-task-notif-${paddedId}`,
				agentId: "ab2-agent-idle",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: THREE_DAYS_AGO,
				state: "completed",
				outcome: "crashed",
			});
		}
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("enqueues a notification when agent transitions to error state", async () => {
		// Trigger the health check via GET /teams/:id
		const res = await app.request("/api/teams/ab2-team", { headers: authHeaders() });
		expect(res.status).toBe(200);

		// Check notification_queue has a row for this agent
		const rows = await db
			.select()
			.from(notificationQueue)
			.where(
				and(
					eq(notificationQueue.eventType, "agent.health.degraded"),
					eq(notificationQueue.subjectId, "ab2-agent-idle"),
				),
			);

		expect(rows.length).toBeGreaterThan(0);
		const row = rows[0];
		expect(row?.eventType).toBe("agent.health.degraded");
		expect(row?.subjectId).toBe("ab2-agent-idle");
		expect(row?.status).toBe("pending");
	});

	it("does NOT enqueue a second notification when one is already pending (throttle)", async () => {
		// First call — creates the notification
		await app.request("/api/teams/ab2-team", { headers: authHeaders() });

		// Second call — should NOT create another
		await app.request("/api/teams/ab2-team", { headers: authHeaders() });

		const rows = await db
			.select()
			.from(notificationQueue)
			.where(
				and(
					eq(notificationQueue.eventType, "agent.health.degraded"),
					eq(notificationQueue.subjectId, "ab2-agent-idle"),
					eq(notificationQueue.status, "pending"),
				),
			);

		// Should be exactly 1 — throttled
		expect(rows.length).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// deriveHealthLevel and deriveHealthDetail unit tests (AC-4 verification #2)
// ---------------------------------------------------------------------------

describe("AB2: deriveHealthLevel unit tests", () => {
	it("returns healthy when not degraded", () => {
		const result = deriveHealthLevel({
			failureRate7d: 0,
			lastSessionCrashed: false,
			harnessAvailable: true,
			idleDurationMs: null,
			degraded: false,
		});
		expect(result).toBe("healthy");
	});

	it("returns critical when failureRate7d > 0.5", () => {
		const result = deriveHealthLevel({
			failureRate7d: 0.8,
			lastSessionCrashed: false,
			harnessAvailable: true,
			idleDurationMs: null,
			degraded: true,
		});
		expect(result).toBe("critical");
	});

	it("returns critical when lastSessionCrashed=true", () => {
		const result = deriveHealthLevel({
			failureRate7d: 0.2,
			lastSessionCrashed: true,
			harnessAvailable: true,
			idleDurationMs: null,
			degraded: true,
		});
		expect(result).toBe("critical");
	});

	it("returns warning when degraded but not critical (harness unavailable)", () => {
		const result = deriveHealthLevel({
			failureRate7d: 0,
			lastSessionCrashed: false,
			harnessAvailable: false,
			idleDurationMs: null,
			degraded: true,
		});
		expect(result).toBe("warning");
	});
});

describe("AB2: deriveHealthDetail unit tests", () => {
	it("returns Healthy when not degraded", () => {
		const result = deriveHealthDetail({
			failureRate7d: 0,
			lastSessionCrashed: false,
			harnessAvailable: true,
			idleDurationMs: null,
			degraded: false,
		});
		expect(result).toBe("Healthy");
	});

	it("includes failure rate percentage when >50%", () => {
		const result = deriveHealthDetail({
			failureRate7d: 0.8,
			lastSessionCrashed: false,
			harnessAvailable: true,
			idleDurationMs: null,
			degraded: true,
		});
		expect(result).toContain("80%");
	});

	it("includes crash info when lastSessionCrashed=true", () => {
		const result = deriveHealthDetail({
			failureRate7d: 0,
			lastSessionCrashed: true,
			harnessAvailable: true,
			idleDurationMs: null,
			degraded: true,
		});
		expect(result.toLowerCase()).toContain("crash");
	});

	it("includes harness info when harnessAvailable=false", () => {
		const result = deriveHealthDetail({
			failureRate7d: 0,
			lastSessionCrashed: false,
			harnessAvailable: false,
			idleDurationMs: null,
			degraded: true,
		});
		expect(result.toLowerCase()).toContain("harness");
	});
});
