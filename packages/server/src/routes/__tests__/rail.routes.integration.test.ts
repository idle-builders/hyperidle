/**
 * V1 — Route integration tests for the Rail endpoint.
 *
 * GET /api/rail — ambient awareness dashboard
 */

import {
	bets,
	factorySettings,
	items,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-rail";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

interface RailResponse {
	bets: Array<{
		id: string;
		title: string;
		status: string;
		progress: { done: number; total: number };
	}>;
	blockers: Array<{
		taskId: string;
		title: string;
		owner: string | null;
		durationBlockedMs: number;
	}>;
	awaitingOrdering: Array<{ id: string; title: string; createdAt: string }>;
	costBurnRate: {
		todaySpend: { minor: number; currency: string } | null;
		todayCap: { minor: number; currency: string } | null;
		weekSpend: { minor: number; currency: string } | null;
		weekCap: { minor: number; currency: string } | null;
		weekTokens: number | null;
	};
}

describe("rail routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("rail auth", () => {
		test("returns 401 without auth header on GET /api/rail", async ({ app }) => {
			const res = await app.request("/api/rail", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/rail", () => {
		test("returns 200 with rail response shape", async ({ app }) => {
			const res = await app.request("/api/rail", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as RailResponse;
			expect(Array.isArray(body.bets)).toBe(true);
			expect(Array.isArray(body.blockers)).toBe(true);
			expect(Array.isArray(body.awaitingOrdering)).toBe(true);
			expect(typeof body.costBurnRate).toBe("object");
		});

		test("returns empty arrays when no data exists", async ({ app }) => {
			const res = await app.request("/api/rail", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as RailResponse;
			expect(body.bets).toHaveLength(0);
			expect(body.blockers).toHaveLength(0);
			expect(body.awaitingOrdering).toHaveLength(0);
		});

		test("includes active bets with progress counters", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db
				.insert(teams)
				.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: now });
			await db
				.insert(teamMembers)
				.values({ id: "tm-1", teamId: "team-1", capacity: 5, activeBets: 0, formedAt: now });
			await db.insert(users).values({
				id: "agent-1",
				kind: "ai",
				name: "Test Agent",
				role: "builder",
				status: "active",
				teamId: "tm-1",
				createdAt: now,
			});
			await db.insert(bets).values({
				id: "bet-1",
				teamId: "team-1",
				description: "Test bet",
				appetite: "small",
				status: "active",
				createdAt: now,
			});
			await db.insert(tasks).values({
				id: "task-1",
				title: "Done task",
				betId: "bet-1",
				teamId: "team-1",
				state: "done",
				ownerAgentId: "agent-1",
				createdAt: now,
				updatedAt: now,
			});
			await db.insert(tasks).values({
				id: "task-2",
				title: "In-progress task",
				betId: "bet-1",
				teamId: "team-1",
				state: "in_progress",
				ownerAgentId: "agent-1",
				createdAt: now,
				updatedAt: now,
			});

			const res = await app.request("/api/rail", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as RailResponse;
			expect(body.bets).toHaveLength(1);
			expect(body.bets[0]?.id).toBe("bet-1");
			expect(body.bets[0]?.progress.done).toBe(1);
			expect(body.bets[0]?.progress.total).toBe(2);
		});

		test("includes blocked tasks as blockers", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db
				.insert(teams)
				.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: now });
			await db
				.insert(teamMembers)
				.values({ id: "tm-1", teamId: "team-1", capacity: 5, activeBets: 0, formedAt: now });
			await db.insert(users).values({
				id: "agent-1",
				kind: "ai",
				name: "Test Agent",
				role: "builder",
				status: "active",
				teamId: "tm-1",
				createdAt: now,
			});
			await db.insert(bets).values({
				id: "bet-1",
				teamId: "team-1",
				description: "Test bet",
				appetite: "small",
				status: "active",
				createdAt: now,
			});
			await db.insert(tasks).values({
				id: "task-blocked",
				title: "Blocked task",
				betId: "bet-1",
				teamId: "team-1",
				state: "blocked",
				ownerAgentId: "agent-1",
				createdAt: now,
				updatedAt: now,
			});

			const res = await app.request("/api/rail", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as RailResponse;
			expect(body.blockers).toHaveLength(1);
			expect(body.blockers[0]?.taskId).toBe("task-blocked");
			expect(typeof body.blockers[0]?.durationBlockedMs).toBe("number");
		});

		test("includes items with kind=ordering in awaitingOrdering", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db
				.insert(teams)
				.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: now });
			await db
				.insert(teamMembers)
				.values({ id: "tm-1", teamId: "team-1", capacity: 5, activeBets: 0, formedAt: now });
			await db.insert(users).values({
				id: "human-rail",
				kind: "human",
				name: "Initiator",
				role: "admin",
				status: "active",
				createdAt: now,
			});
			await db.insert(bets).values({
				id: "bet-1",
				teamId: "team-1",
				description: "Test bet",
				appetite: "small",
				status: "active",
				createdAt: now,
			});
			await db.insert(threads).values({
				id: "thread-rail",
				hostKind: "bet",
				hostId: "bet-1",
				initiatorId: "human-rail",
				participants: "[]",
				createdAt: now,
				lastActiveAt: now,
			});
			await db.insert(items).values({
				id: "item-ordering",
				title: "Needs ordering",
				kind: "ordering",
				threadId: "thread-rail",
				createdAt: now,
			});

			const res = await app.request("/api/rail", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as RailResponse;
			expect(body.awaitingOrdering).toHaveLength(1);
			expect(body.awaitingOrdering[0]?.id).toBe("item-ordering");
		});

		test("returns costBurnRate with factory settings caps", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db
				.insert(factorySettings)
				.values({ key: "cost_currency", value: "EUR", updatedAt: now });
			await db
				.insert(factorySettings)
				.values({ key: "cost_cap_daily_minor", value: "5000", updatedAt: now });
			await db
				.insert(factorySettings)
				.values({ key: "cost_cap_weekly_minor", value: "30000", updatedAt: now });

			const res = await app.request("/api/rail", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as RailResponse;
			expect(body.costBurnRate.todayCap?.minor).toBe(5000);
			expect(body.costBurnRate.todayCap?.currency).toBe("EUR");
			expect(body.costBurnRate.weekCap?.minor).toBe(30000);
		});
	});
});
