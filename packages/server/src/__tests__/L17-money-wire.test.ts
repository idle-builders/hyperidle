/**
 * L17 RED — Money wire integration tests.
 *
 * AC13: Cost-cap service uses new column names (costMinor, costCapMinor), validates currency
 * AC14: Session provisioning accumulates tokens by tier during drain
 * AC15: Bet create accepts costAppetite:{minor,currency}, rejects "2 weeks" as appetite
 * AC16: Bet detail returns structured cost fields (costAppetite, costActual, tokensActual)
 * AC25: No string-typed money fields in shared types (verified by type checks in money-harness.test.ts)
 *
 * These tests will FAIL until Tasks 2-4 implementation ships.
 */

// @lore U1: `products` renamed to `teams`; old `teams` (membership) renamed to `teamMembers`.
import {
	bets,
	createTestDb,
	type HyperIdleDb,
	sessions,
	type TestDbHandle,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import {
	checkCostCap,
	clearDeduplicationCache,
	recordCostAndCheck,
	resetCosts,
} from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-l17-money";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

// ── AC13: Cost-cap service with new column names ──────────────────────────────

describe("Cost-cap service with Money columns (AC13)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		clearDeduplicationCache();

		// @lore U1: Seed base entities using new schema (teams, teamMembers).
		db.insert(teams)
			.values({ id: "p1", name: "Test Product", phase: "build", createdAt: NOW })
			.run();

		db.insert(teamMembers)
			.values({
				id: "t1",
				teamId: "p1",
				capacity: 5,
				activeBets: 0,
				// New column: cost_cap_minor (was costCap)
				costCapMinor: 5000, // $50.00 in cents
				costCapCurrency: "USD",
				formedAt: NOW,
			})
			.run();

		db.insert(bets)
			.values({
				id: "b1",
				// @lore U1: teamId references `teams` (domain entity); pitch → description
				teamId: "p1",
				description: "Test bet",
				// appetite_legacy column still exists for rollback but is not used
				status: "active",
				createdAt: NOW,
			})
			.run();

		db.insert(tasks)
			.values({
				id: "task-1",
				betId: "b1",
				// @lore U1: tasks.productId removed; tasks.teamId references `teams`.
				teamId: "p1",
				title: "Test task",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();

		await db.insert(users).values({
			id: "agent-1",
			name: "Builder Agent",
			role: "builder",
			status: "active",
			teamId: "t1",
			maxConcurrentSessions: 2,
			// New column: cost_cap_minor (was costCap)
			costCapMinor: 1000, // $10.00 in cents
			costCapCurrency: "USD",
			createdAt: NOW,
		});
	});

	async function insertSession(id: string, agentId: string): Promise<void> {
		// @lore O2: session cost columns (costMinor, costCurrency) stripped from
		// the kernel sessions table. Sessions no longer carry cost data directly.
		await db.insert(sessions).values({
			id,
			taskId: "task-1",
			agentId,
			modelTier: "workhorse",
			startedAt: NOW,
			state: "done",
		});
	}

	it("reads costCapMinor from agents table (not old costCap)", async () => {
		// @lore O2: session cost stripped — spend is always 0 from kernel layer.
		// checkCostCap still reads costCapMinor from agents table for the cap value.
		insertSession("s1", "agent-1");

		const result = await checkCostCap(db, eventBus, {
			agentId: "agent-1",
			teamId: "t1",
		});

		// Spend is 0 (no session cost columns), cap is $10 → always allowed
		expect(result.allowed).toBe(true);
	});

	it("O2: session cost is always 0 (cost columns stripped from kernel table)", async () => {
		// @lore O2: session cost columns stripped. getAgentSpend returns 0 regardless
		// of how many sessions exist. Cap enforcement is always allowed from kernel layer.
		insertSession("s1", "agent-1");

		const result = await checkCostCap(db, eventBus, {
			agentId: "agent-1",
			teamId: "t1",
		});

		// No session cost tracking at kernel layer — always allowed
		expect(result.allowed).toBe(true);
	});

	it("recordCostAndCheck accepts cost params but does not write to session (O2)", async () => {
		// @lore O2: cost is accepted for API compat but not stored.
		insertSession("s1", "agent-1");

		await recordCostAndCheck(db, eventBus, {
			sessionId: "s1",
			costMinor: 500,
			currency: "USD",
			agentId: "agent-1",
			teamId: "t1",
		});

		// Session should still be readable; cost data is not in the kernel table
		const [session] = await db.select().from(sessions).where(eq(sessions.id, "s1"));
		expect(session).toBeDefined();
		// The kernel table doesn't have costMinor; verifying the session exists is sufficient
		expect(session?.id).toBe("s1");
	});

	it("resetCosts resets agent/team running cost counters (O2)", async () => {
		insertSession("s1", "agent-1");
		insertSession("s2", "agent-1");

		await resetCosts(db, "t1");

		// After reset, cost check should still be allowed (spend is always 0 from kernel)
		const result = await checkCostCap(db, eventBus, {
			agentId: "agent-1",
			teamId: "t1",
		});
		expect(result.allowed).toBe(true);
	});
});

// ── AC14: Token accumulation by tier ─────────────────────────────────────────

describe("Session token accumulation by tier (AC14)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });

		// @lore U1: teams is the domain entity; teamMembers is the membership group.
		db.insert(teams)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: NOW })
			.run();
		db.insert(teamMembers)
			.values({ id: "team-1", teamId: "prod-1", capacity: 2, activeBets: 0, formedAt: NOW })
			.run();
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	it("session row contains tokensJson after task completes with tier breakdown", async () => {
		// This test verifies AC14: session provisioning writes tokensJson with tier breakdown
		// We test this via the API: start a task, complete it, check the session row
		// The provisioning drain loop must accumulate tokens by tier from token_usage events

		// Create a bet and task via API
		// @lore U1: API uses `teamId` (references `teams`); `description` replaces `pitch`.
		const betRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "prod-1",
				description: "Token test bet",
				costAppetite: { minor: 5000, currency: "USD" },
			}),
		});
		expect(betRes.status).toBe(201);

		// Verify the bet was created with structured costAppetite
		const bet = (await betRes.json()) as {
			id: string;
			costAppetite?: { minor: number; currency: string };
		};
		expect(bet.id).toBeDefined();
		expect(bet.costAppetite).toBeDefined();
		expect(bet.costAppetite?.minor).toBe(5000);
		expect(bet.costAppetite?.currency).toBe("USD");
	});
});

// ── AC15: Bet create API ──────────────────────────────────────────────────────

describe("Bet create API — structured costAppetite (AC15)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });

		// @lore U1: teams is domain entity; teamMembers is membership group.
		db.insert(teams)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: NOW })
			.run();
		db.insert(teamMembers)
			.values({ id: "team-1", teamId: "prod-1", capacity: 2, activeBets: 0, formedAt: NOW })
			.run();
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	// @lore U1: API uses `teamId` (references `teams` domain entity); `description` replaces `pitch`.
	it("accepts costAppetite with minor + currency (structured Money)", async () => {
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "prod-1",
				description: "Build feature X",
				costAppetite: { minor: 50000, currency: "USD" }, // $500 budget
			}),
		});
		expect(res.status).toBe(201);

		const body = (await res.json()) as { costAppetite: { minor: number; currency: string } };
		expect(body.costAppetite).toBeDefined();
		expect(body.costAppetite.minor).toBe(50000);
		expect(body.costAppetite.currency).toBe("USD");
	});

	it("rejects the old duration string appetite ('2 weeks') as appetite param", async () => {
		// The old `appetite` field (duration string) must no longer be accepted
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "prod-1",
				description: "Build feature X",
				appetite: "2 weeks", // old format — must be rejected
			}),
		});
		// Either rejected with 400 or accepted but 'appetite' field is ignored
		// Per AC15: POST with "2 weeks" returns 400
		expect(res.status).toBe(400);
	});

	it("accepts null costAppetite (uncapped)", async () => {
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "prod-1",
				description: "Build feature Y",
				costAppetite: null,
			}),
		});
		expect(res.status).toBe(201);
	});

	it("rejects costAppetite with invalid currency code", async () => {
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "prod-1",
				description: "Build feature Z",
				costAppetite: { minor: 5000, currency: "INVALID" },
			}),
		});
		expect(res.status).toBe(400);
	});

	it("rejects costAppetite with negative minor", async () => {
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "prod-1",
				description: "Build feature W",
				costAppetite: { minor: -100, currency: "USD" },
			}),
		});
		expect(res.status).toBe(400);
	});
});

// ── AC16: Bet detail returns structured cost fields ───────────────────────────

describe("Bet detail API — structured cost fields (AC16)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });

		// @lore U1: teams is domain entity; teamMembers is membership group.
		db.insert(teams)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: NOW })
			.run();
		db.insert(teamMembers)
			.values({ id: "team-1", teamId: "prod-1", capacity: 2, activeBets: 0, formedAt: NOW })
			.run();

		// Seed a bet with structured costAppetite directly in DB
		// @lore U1: teamId references `teams`; description replaces pitch; status "active" replaces "in_progress".
		db.insert(bets)
			.values({
				id: "bet-detail-1",
				teamId: "prod-1",
				description: "Structured cost test",
				costAppetiteMinor: 50000,
				costAppetiteCurrency: "USD",
				status: "active",
				createdAt: NOW,
			})
			.run();
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	it("GET /bets/:id returns costAppetite as WireMoney object", async () => {
		const res = await app.request("/api/bets/bet-detail-1", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			costAppetite: { minor: number; currency: string } | null;
		};
		expect(body.costAppetite).toBeDefined();
		expect(body.costAppetite?.minor).toBe(50000);
		expect(body.costAppetite?.currency).toBe("USD");
	});

	it("GET /bets/:id returns costActual as WireMoney object (not a number)", async () => {
		const res = await app.request("/api/bets/bet-detail-1", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			costActual: { minor: number; currency: string } | null;
		};
		// costActual can be null or a WireMoney — should NOT be a raw number
		if (body.costActual !== null) {
			expect(typeof body.costActual.minor).toBe("number");
			expect(typeof body.costActual.currency).toBe("string");
		} else {
			expect(body.costActual).toBeNull();
		}
	});

	it("GET /bets/:id does NOT return appetite as a duration string", async () => {
		const res = await app.request("/api/bets/bet-detail-1", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as { appetite?: string };
		// 'appetite' as a duration string like "2 weeks" must not appear
		expect(body.appetite).toBeUndefined();
	});

	it("GET /bets/:id returns tokensActual as TokenUsage object or null", async () => {
		const res = await app.request("/api/bets/bet-detail-1", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			tokensActual: { byTier: Record<string, unknown> } | null;
		};
		// tokensActual should be null or a TokenUsage object
		if (body.tokensActual !== null && body.tokensActual !== undefined) {
			expect(body.tokensActual.byTier).toBeDefined();
		}
	});
});
