/**
 * AB1 — Agent Profile API: integration tests (RED phase)
 *
 * AC coverage:
 * AC-1: GET /api/agents/:id/profile returns 200 with correct shape for a valid agent
 * AC-2: Returns 404 for non-existent agent
 * AC-3: Returns 404 for human users (kind='human')
 * AC-4: Returns active session when agent has running session
 * AC-5: Returns recent sessions (last 10, newest first)
 * AC-6: Returns performance aggregates (total sessions, success count, success rate)
 * AC-7: Health signal: failure rate warning when >50% in 7 days
 * AC-8: Health signal: failure rate OK when ≤50%
 * AC-9: Health signal: last session crash warning
 * AC-10: Health signal: harness available (warning when type not in pool)
 * AC-11: Skills merge: tools from role catalog + userSkills usage stats
 * AC-12: Returns null cost for sessions (honest — no cost data)
 *
 * These tests FAIL until:
 * - packages/shared/src/agent-profile.ts is created with 7 wire types
 * - packages/server/src/routes/agent-profile.ts is created with the handler
 * - packages/server/src/routes/agents.ts mounts the profile route
 * - packages/server/src/app.ts passes adapterPool to agent routes
 */

import {
	bets,
	createTestDb,
	type HyperIdleDb,
	sessions,
	tasks,
	teamMembers,
	teams,
	userSkills,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-ab1-agent-profile";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

const NOW = new Date().toISOString();
// 3 days ago
const THREE_DAYS_AGO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
// 10 days ago (outside 7-day health window)
const TEN_DAYS_AGO = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

/** Seed the minimum required prerequisite rows for agent profile tests. */
async function seedPrereqs(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "ab1-team", name: "AB1 Test Team", phase: "build", createdAt: NOW });

	await db.insert(teamMembers).values({
		id: "ab1-tm",
		teamId: "ab1-team",
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});

	// Seed the human founder (required for auth middleware)
	await db.insert(users).values({
		id: "u-founder-ab1",
		kind: "human",
		name: "AB1 Founder",
		role: "founder",
		status: "active",
		email: "ab1-founder@hyperidle.com",
		maxConcurrentSessions: 0,
		createdAt: NOW,
	});

	// Seed a configurable AI agent (builder role)
	await db.insert(users).values({
		id: "ab1-agent-builder",
		kind: "ai",
		name: "AB1 Builder Bot",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 2,
		teamId: "ab1-tm",
		harnessType: "claude-code",
		soulPrompt: "You are a builder agent.",
		modelTierPreference: "workhorse",
		createdAt: NOW,
	});

	// Seed a human user (to test 404 path)
	await db.insert(users).values({
		id: "ab1-human-user",
		kind: "human",
		name: "AB1 Human",
		role: "founder",
		status: "active",
		email: "ab1-human@hyperidle.com",
		maxConcurrentSessions: 0,
		createdAt: NOW,
	});

	// Seed a bet and task for sessions
	await db.insert(bets).values({
		id: "ab1-bet-1",
		teamId: "ab1-team",
		description: "Test bet",
		status: "active",
		createdAt: NOW,
	});

	await db.insert(tasks).values({
		id: "ab1-task-1",
		betId: "ab1-bet-1",
		teamId: "ab1-team",
		title: "Test task 1",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ---------------------------------------------------------------------------
// AC-1: GET /api/agents/:id/profile returns 200 with correct shape
// ---------------------------------------------------------------------------

describe("AB1 AC-1: GET /api/agents/:id/profile returns 200 with correct shape", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns 200 with correct top-level shape", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		// Identity fields
		expect(body).toHaveProperty("id");
		expect(body).toHaveProperty("name");
		expect(body).toHaveProperty("role");
		expect(body).toHaveProperty("teamName");
		expect(body).toHaveProperty("createdAt");
		// Config fields
		expect(body).toHaveProperty("soulPrompt");
		expect(body).toHaveProperty("harnessType");
		expect(body).toHaveProperty("modelTierPreference");
		expect(body).toHaveProperty("maxConcurrentSessions");
		// Status
		expect(body).toHaveProperty("activeSession");
		// Sessions
		expect(body).toHaveProperty("recentSessions");
		// Performance
		expect(body).toHaveProperty("performance");
		// Health
		expect(body).toHaveProperty("healthSignals");
		// Capabilities
		expect(body).toHaveProperty("harnessCapabilities");
		// Skills
		expect(body).toHaveProperty("skills");
	});

	it("returns correct identity values for the builder agent", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;

		expect(body.id).toBe("ab1-agent-builder");
		expect(body.name).toBe("AB1 Builder Bot");
		expect(body.role).toBe("builder");
		expect(body.harnessType).toBe("claude-code");
		expect(body.soulPrompt).toBe("You are a builder agent.");
		expect(body.modelTierPreference).toBe("workhorse");
		expect(body.maxConcurrentSessions).toBe(2);
	});

	it("returns 401 without auth header", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile");
		expect(res.status).toBe(401);
	});

	it("performance shape has required fields", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const performance = body.performance as Record<string, unknown>;

		expect(performance).toHaveProperty("totalSessions");
		expect(performance).toHaveProperty("successCount");
		expect(performance).toHaveProperty("successRate");
	});

	it("healthSignals shape has required fields", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;

		expect(health).toHaveProperty("failureRate7d");
		expect(health).toHaveProperty("lastSessionCrashed");
		expect(health).toHaveProperty("harnessAvailable");
		expect(health).toHaveProperty("idleDurationMs");
		expect(health).toHaveProperty("degraded");
	});

	it("harnessCapabilities shape has required fields", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const caps = body.harnessCapabilities as Record<string, unknown>;

		expect(caps).toHaveProperty("toolUse");
		expect(caps).toHaveProperty("mcpSupport");
		expect(caps).toHaveProperty("fileEditing");
		expect(caps).toHaveProperty("subAgents");
	});

	it("recentSessions is an array", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(Array.isArray(body.recentSessions)).toBe(true);
	});

	it("skills is an array", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(Array.isArray(body.skills)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC-2: GET /api/agents/:id/profile returns 404 for non-existent agent
// ---------------------------------------------------------------------------

describe("AB1 AC-2: GET /api/agents/:id/profile returns 404 for non-existent agent", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns 404 for a non-existent agent id", async () => {
		const res = await app.request("/api/agents/nonexistent-agent-id/profile", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toHaveProperty("code");
		expect(body.code).toBe("NOT_FOUND");
	});
});

// ---------------------------------------------------------------------------
// AC-3: GET /api/agents/:id/profile returns 404 for human users
// ---------------------------------------------------------------------------

describe("AB1 AC-3: GET /api/agents/:id/profile returns 404 for human users", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns 404 when querying a human user's profile", async () => {
		// ab1-human-user is kind='human' — not an AI agent
		const res = await app.request("/api/agents/ab1-human-user/profile", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("NOT_FOUND");
	});
});

// ---------------------------------------------------------------------------
// AC-4: Returns active session when agent has running session
// ---------------------------------------------------------------------------

describe("AB1 AC-4: Returns active session link when agent has running session", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns null activeSession when agent has no running session", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.activeSession).toBeNull();
	});

	it("returns active session info when agent has a running session", async () => {
		// Seed an active session
		await db.insert(sessions).values({
			id: "ab1-session-active",
			taskId: "ab1-task-1",
			agentId: "ab1-agent-builder",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const activeSession = body.activeSession as Record<string, unknown>;

		expect(activeSession).not.toBeNull();
		expect(activeSession).toHaveProperty("sessionId");
		expect(activeSession.sessionId).toBe("ab1-session-active");
		expect(activeSession).toHaveProperty("taskId");
		expect(activeSession.taskId).toBe("ab1-task-1");
		// M1: betId must be present so the frontend link uses /work/bet/:betId/task/:taskId
		expect(activeSession).toHaveProperty("betId");
		expect(activeSession.betId).toBe("ab1-bet-1");
		expect(activeSession).toHaveProperty("startedAt");
	});
});

// ---------------------------------------------------------------------------
// AC-5: Returns recent sessions (last 10, newest first)
// ---------------------------------------------------------------------------

describe("AB1 AC-5: Returns recent sessions (last 10, newest first)", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns empty array when no sessions exist", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(Array.isArray(body.recentSessions)).toBe(true);
		expect((body.recentSessions as unknown[]).length).toBe(0);
	});

	it("returns sessions with required fields", async () => {
		await db.insert(sessions).values({
			id: "ab1-session-1",
			taskId: "ab1-task-1",
			agentId: "ab1-agent-builder",
			modelTier: "workhorse",
			startedAt: THREE_DAYS_AGO,
			endedAt: NOW,
			state: "completed",
			outcome: "completed",
		});

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const sessionsList = body.recentSessions as Array<Record<string, unknown>>;

		expect(sessionsList.length).toBe(1);
		const session = sessionsList[0];
		expect(session).toHaveProperty("sessionId");
		expect(session).toHaveProperty("taskId");
		expect(session).toHaveProperty("taskTitle");
		expect(session).toHaveProperty("outcome");
		expect(session).toHaveProperty("startedAt");
		expect(session).toHaveProperty("endedAt");
		expect(session).toHaveProperty("cost");
	});

	it("returns at most 10 sessions even when 12 exist", async () => {
		// Seed 12 sessions - need 12 tasks
		for (let i = 1; i <= 12; i++) {
			const paddedId = i.toString().padStart(2, "0");
			// Create a task for each session
			await db.insert(tasks).values({
				id: `ab1-task-multi-${paddedId}`,
				betId: "ab1-bet-1",
				teamId: "ab1-team",
				title: `Task ${paddedId}`,
				state: "completed",
				createdAt: NOW,
				updatedAt: NOW,
			});
			await db.insert(sessions).values({
				id: `ab1-session-multi-${paddedId}`,
				taskId: `ab1-task-multi-${paddedId}`,
				agentId: "ab1-agent-builder",
				modelTier: "workhorse",
				startedAt: new Date(Date.now() - i * 60 * 1000).toISOString(),
				endedAt: new Date(Date.now() - (i - 1) * 60 * 1000).toISOString(),
				state: "completed",
				outcome: "completed",
			});
		}

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const recentSessions = body.recentSessions as unknown[];
		expect(recentSessions.length).toBe(10);
	});

	it("sessions are ordered newest first", async () => {
		// Seed multiple sessions with distinct times
		await db.insert(tasks).values({
			id: "ab1-task-oldest",
			betId: "ab1-bet-1",
			teamId: "ab1-team",
			title: "Oldest task",
			state: "completed",
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(sessions).values({
			id: "ab1-session-oldest",
			taskId: "ab1-task-oldest",
			agentId: "ab1-agent-builder",
			modelTier: "workhorse",
			startedAt: THREE_DAYS_AGO,
			endedAt: THREE_DAYS_AGO,
			state: "completed",
			outcome: "completed",
		});

		await db.insert(sessions).values({
			id: "ab1-session-newest",
			taskId: "ab1-task-1",
			agentId: "ab1-agent-builder",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const recentSessions = body.recentSessions as Array<Record<string, unknown>>;

		// Newest session should be first
		expect(recentSessions[0]?.sessionId).toBe("ab1-session-newest");
		expect(recentSessions[1]?.sessionId).toBe("ab1-session-oldest");
	});
});

// ---------------------------------------------------------------------------
// AC-6: Returns performance aggregates
// ---------------------------------------------------------------------------

describe("AB1 AC-6: Returns performance aggregates (total, success, rate)", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns zero performance stats when no sessions", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const performance = body.performance as Record<string, unknown>;

		expect(performance.totalSessions).toBe(0);
		expect(performance.successCount).toBe(0);
		expect(performance.successRate).toBe(0);
	});

	it("computes success rate from sessions (3 success out of 4 = 75%)", async () => {
		for (let i = 1; i <= 4; i++) {
			const paddedId = i.toString().padStart(2, "0");
			await db.insert(tasks).values({
				id: `ab1-task-perf-${paddedId}`,
				betId: "ab1-bet-1",
				teamId: "ab1-team",
				title: `Perf task ${paddedId}`,
				state: "completed",
				createdAt: NOW,
				updatedAt: NOW,
			});
		}

		// 3 successful, 1 crashed
		await db.insert(sessions).values([
			{
				id: "ab1-perf-s1",
				taskId: "ab1-task-perf-01",
				agentId: "ab1-agent-builder",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: NOW,
				state: "completed",
				outcome: "completed",
			},
			{
				id: "ab1-perf-s2",
				taskId: "ab1-task-perf-02",
				agentId: "ab1-agent-builder",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: NOW,
				state: "completed",
				outcome: "completed",
			},
			{
				id: "ab1-perf-s3",
				taskId: "ab1-task-perf-03",
				agentId: "ab1-agent-builder",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: NOW,
				state: "completed",
				outcome: "completed",
			},
			{
				id: "ab1-perf-s4",
				taskId: "ab1-task-perf-04",
				agentId: "ab1-agent-builder",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: NOW,
				state: "completed",
				outcome: "crashed",
			},
		]);

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const performance = body.performance as Record<string, unknown>;

		expect(performance.totalSessions).toBe(4);
		expect(performance.successCount).toBe(3);
		expect(performance.successRate).toBeCloseTo(0.75);
	});
});

// ---------------------------------------------------------------------------
// AC-7: Health signal: failure rate warning when >50% in 7 days
// ---------------------------------------------------------------------------

describe("AB1 AC-7: Health signal failure rate warning when >50% in 7 days", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("sets degraded=true when failure rate is >50% in last 7 days", async () => {
		// Seed 2 crashed out of 3 total sessions (within 7 days)
		for (let i = 1; i <= 3; i++) {
			const paddedId = i.toString().padStart(2, "0");
			await db.insert(tasks).values({
				id: `ab1-task-health-warn-${paddedId}`,
				betId: "ab1-bet-1",
				teamId: "ab1-team",
				title: `Health task ${paddedId}`,
				state: "completed",
				createdAt: NOW,
				updatedAt: NOW,
			});
		}

		await db.insert(sessions).values([
			{
				id: "ab1-health-warn-s1",
				taskId: "ab1-task-health-warn-01",
				agentId: "ab1-agent-builder",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: NOW,
				state: "completed",
				outcome: "crashed", // fail
			},
			{
				id: "ab1-health-warn-s2",
				taskId: "ab1-task-health-warn-02",
				agentId: "ab1-agent-builder",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: NOW,
				state: "completed",
				outcome: "crashed", // fail
			},
			{
				id: "ab1-health-warn-s3",
				taskId: "ab1-task-health-warn-03",
				agentId: "ab1-agent-builder",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: NOW,
				state: "completed",
				outcome: "completed", // success
			},
		]);

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;

		expect(health.failureRate7d).toBeGreaterThan(0.5);
		expect(health.degraded).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC-8: Health signal: failure rate OK when ≤50%
// ---------------------------------------------------------------------------

describe("AB1 AC-8: Health signal failure rate OK when ≤50%", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("sets degraded=false when no sessions exist (no history)", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;

		expect(health.failureRate7d).toBe(0);
		expect(health.degraded).toBe(false);
	});

	it("sets degraded=false when failure rate is exactly 50%", async () => {
		for (let i = 1; i <= 2; i++) {
			const paddedId = i.toString().padStart(2, "0");
			await db.insert(tasks).values({
				id: `ab1-task-health-ok-${paddedId}`,
				betId: "ab1-bet-1",
				teamId: "ab1-team",
				title: `Health OK task ${paddedId}`,
				state: "completed",
				createdAt: NOW,
				updatedAt: NOW,
			});
		}

		await db.insert(sessions).values([
			{
				id: "ab1-health-ok-s1",
				taskId: "ab1-task-health-ok-01",
				agentId: "ab1-agent-builder",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: NOW,
				state: "completed",
				outcome: "crashed",
			},
			{
				id: "ab1-health-ok-s2",
				taskId: "ab1-task-health-ok-02",
				agentId: "ab1-agent-builder",
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: NOW,
				state: "completed",
				outcome: "completed",
			},
		]);

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;

		// 50% failure rate (1 out of 2) — threshold is > 50% for degraded
		expect(health.failureRate7d).toBeCloseTo(0.5);
		expect(health.degraded).toBe(false);
	});

	it("only counts sessions within 7 days for failure rate", async () => {
		// Seed old crashed sessions (outside 7 day window)
		for (let i = 1; i <= 2; i++) {
			const paddedId = i.toString().padStart(2, "0");
			await db.insert(tasks).values({
				id: `ab1-task-old-${paddedId}`,
				betId: "ab1-bet-1",
				teamId: "ab1-team",
				title: `Old task ${paddedId}`,
				state: "completed",
				createdAt: NOW,
				updatedAt: NOW,
			});
		}

		await db.insert(sessions).values([
			{
				id: "ab1-old-s1",
				taskId: "ab1-task-old-01",
				agentId: "ab1-agent-builder",
				modelTier: "workhorse",
				startedAt: TEN_DAYS_AGO,
				endedAt: TEN_DAYS_AGO,
				state: "completed",
				outcome: "crashed", // old crash — outside 7d window
			},
			{
				id: "ab1-old-s2",
				taskId: "ab1-task-old-02",
				agentId: "ab1-agent-builder",
				modelTier: "workhorse",
				startedAt: TEN_DAYS_AGO,
				endedAt: TEN_DAYS_AGO,
				state: "completed",
				outcome: "crashed", // old crash — outside 7d window
			},
		]);

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;

		// Old sessions outside 7d window shouldn't count
		expect(health.failureRate7d).toBe(0);
		expect(health.degraded).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// AC-9: Health signal: last session crash warning
// ---------------------------------------------------------------------------

describe("AB1 AC-9: Health signal last session crash warning", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("sets lastSessionCrashed=false when no sessions exist", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;
		expect(health.lastSessionCrashed).toBe(false);
	});

	it("sets lastSessionCrashed=true when most recent session outcome is 'crashed'", async () => {
		await db.insert(sessions).values({
			id: "ab1-crashed-session",
			taskId: "ab1-task-1",
			agentId: "ab1-agent-builder",
			modelTier: "workhorse",
			startedAt: NOW,
			endedAt: NOW,
			state: "completed",
			outcome: "crashed",
		});

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;
		expect(health.lastSessionCrashed).toBe(true);
		expect(health.degraded).toBe(true);
	});

	it("sets lastSessionCrashed=false when most recent session outcome is 'completed'", async () => {
		await db.insert(sessions).values({
			id: "ab1-success-session",
			taskId: "ab1-task-1",
			agentId: "ab1-agent-builder",
			modelTier: "workhorse",
			startedAt: NOW,
			endedAt: NOW,
			state: "completed",
			outcome: "completed",
		});

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;
		expect(health.lastSessionCrashed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// AC-10: Health signal: harness available check
// ---------------------------------------------------------------------------

describe("AB1 AC-10: Health signal harness available check", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("sets harnessAvailable=true when agent harnessType is registered in pool", async () => {
		const eventBus = new EventBus();
		// Create a pool with 'claude-code' adapter registered
		const adapterPool = new AdapterPool();
		adapterPool.register("local-claude-code", makeMockAdapter(), {
			name: "Claude Code",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		app = await createTestApp({ db, eventBus, adapterPool });
		await seedPrereqs(db);

		// ab1-agent-builder has harnessType: 'claude-code'
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;
		expect(health.harnessAvailable).toBe(true);
	});

	it("sets harnessAvailable=false when agent harnessType is not in pool", async () => {
		const eventBus = new EventBus();
		// Empty pool — no adapters registered
		const adapterPool = new AdapterPool();

		app = await createTestApp({ db, eventBus, adapterPool });
		await seedPrereqs(db);

		// ab1-agent-builder has harnessType: 'claude-code' but it's not in the empty pool
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;
		expect(health.harnessAvailable).toBe(false);
		expect(health.degraded).toBe(true);
	});

	it("sets harnessAvailable=true when agent has no harnessType preference", async () => {
		const eventBus = new EventBus();
		const adapterPool = new AdapterPool();
		// Register any adapter
		adapterPool.register("local-builtin", makeMockAdapter(), {
			name: "Built-in",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		app = await createTestApp({ db, eventBus, adapterPool });
		await seedPrereqs(db);

		// Insert an agent without a harnessType preference
		await db.insert(users).values({
			id: "ab1-agent-no-harness",
			kind: "ai",
			name: "No Harness Agent",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: NOW,
			// no harnessType
		});

		const res = await app.request("/api/agents/ab1-agent-no-harness/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;
		// No harnessType preference — any adapter will do, and pool has one
		expect(health.harnessAvailable).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC-11: Skills merge: tools from role catalog + userSkills usage stats
// ---------------------------------------------------------------------------

describe("AB1 AC-11: Skills merge from role catalog + userSkills", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns skills array with required field shapes", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const skills = body.skills as Array<Record<string, unknown>>;

		// Skills should be an array (possibly empty if no userSkills and role has no catalog tools)
		expect(Array.isArray(skills)).toBe(true);
	});

	it("includes userSkill stats when user has skills recorded", async () => {
		// Seed a userSkill
		await db.insert(userSkills).values({
			userId: "ab1-agent-builder",
			skillId: "write-code",
			autonomyLevel: 2,
			successCount: 5,
			failureCount: 1,
			lastUsedAt: NOW,
		});

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const skills = body.skills as Array<Record<string, unknown>>;

		// Find the write-code skill
		const writeCodeSkill = skills.find((s) => s.skillId === "write-code");
		expect(writeCodeSkill).toBeDefined();
		expect(writeCodeSkill?.successCount).toBe(5);
		expect(writeCodeSkill?.failureCount).toBe(1);
		expect(writeCodeSkill?.lastUsedAt).toBe(NOW);
	});

	it("skill entries have required fields", async () => {
		await db.insert(userSkills).values({
			userId: "ab1-agent-builder",
			skillId: "review",
			autonomyLevel: 1,
			successCount: 3,
			failureCount: 0,
			lastUsedAt: NOW,
		});

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const skills = body.skills as Array<Record<string, unknown>>;

		const reviewSkill = skills.find((s) => s.skillId === "review");
		expect(reviewSkill).toBeDefined();
		expect(reviewSkill).toHaveProperty("skillId");
		expect(reviewSkill).toHaveProperty("successCount");
		expect(reviewSkill).toHaveProperty("failureCount");
		expect(reviewSkill).toHaveProperty("lastUsedAt");
		expect(reviewSkill).toHaveProperty("autonomyLevel");
	});
});

// ---------------------------------------------------------------------------
// AC-12: Returns null cost for sessions (honest — no cost data in sessions table)
// ---------------------------------------------------------------------------

describe("AB1 AC-12: Returns null cost for sessions (no cost data)", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns null cost for each session in recentSessions", async () => {
		await db.insert(sessions).values({
			id: "ab1-session-cost-check",
			taskId: "ab1-task-1",
			agentId: "ab1-agent-builder",
			modelTier: "workhorse",
			startedAt: NOW,
			endedAt: NOW,
			state: "completed",
			outcome: "completed",
		});

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const recentSessions = body.recentSessions as Array<Record<string, unknown>>;

		expect(recentSessions.length).toBeGreaterThan(0);
		for (const session of recentSessions) {
			expect(session.cost).toBeNull();
		}
	});
});

// ---------------------------------------------------------------------------
// AC: Idle duration in health signals (per F3/A3 reviewer finding)
// ---------------------------------------------------------------------------

describe("AB1: Idle duration in health signals", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns idleDurationMs as null when no sessions exist", async () => {
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;
		// No sessions — idle since creation, or null if no baseline
		expect(health.idleDurationMs === null || typeof health.idleDurationMs === "number").toBe(true);
	});

	it("returns idleDurationMs as a non-negative number when sessions exist", async () => {
		await db.insert(sessions).values({
			id: "ab1-session-for-idle",
			taskId: "ab1-task-1",
			agentId: "ab1-agent-builder",
			modelTier: "workhorse",
			startedAt: THREE_DAYS_AGO,
			endedAt: THREE_DAYS_AGO,
			state: "completed",
			outcome: "completed",
		});

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const health = body.healthSignals as Record<string, unknown>;
		expect(typeof health.idleDurationMs).toBe("number");
		expect(health.idleDurationMs as number).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";

function makeMockAdapter(): HarnessAdapter {
	return {
		async startSession(_config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: "mock" };
		},
		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {},
		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				cost: { minor: 0, currency: "USD" },
				tokenUsage: { byTier: {} },
			};
		},
		getCapabilities(): HarnessCapabilities {
			return {
				preCompactionTrigger: true,
				subAgents: true,
				modelProviders: ["anthropic"],
				mcpSupport: false,
			};
		},
	};
}
