/**
 * U2 — API Layer: Products → Teams + Bet Endpoints
 *
 * Comprehensive red-phase tests covering all U2 acceptance criteria:
 *   AC-1: /api/products/* renamed to /api/teams/*
 *   AC-2: Bet responses use new status enum (draft|active|completed|killed)
 *   AC-3: Bet creation accepts `description` (not `pitch`), defaults to `draft`
 *   AC-4: Bet update accepts `at_risk` boolean; GET response returns boolean
 *   AC-5: State transitions enforce lifecycle with 400 on invalid
 *   AC-6: MUTABLE_BET_FIELDS includes "description" and "at_risk"
 *   AC-8: Bet detail response has `team` field but no `product` field
 *
 * CRITICAL (architecture-critique): at_risk must be boolean on the wire
 * (true/false), not integer (0/1). GET responses must normalize 0/1 to boolean.
 *
 * @lore U2: These tests are written in the red phase. They WILL fail until
 * the implementation in /write-code phase renames routes, adds at_risk PATCH,
 * catches InvalidTransitionError as 400, and drops the product field.
 */

import {
	bets,
	createTestDb,
	type HyperIdleDb,
	type TestDbHandle,
	teamMembers,
	teams,
} from "@hyperidle/db";
import { EventBus, MUTABLE_BET_FIELDS } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-U2";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

interface AppCtx {
	app: Hono;
	db: HyperIdleDb;
	eventBus: EventBus;
	handle: TestDbHandle;
}

async function setupApp(): Promise<AppCtx> {
	const handle = await createTestDb();
	const db = handle.db;
	const eventBus = new EventBus();
	const app = await createTestApp({ db, eventBus });
	return { app, db, eventBus, handle };
}

const NOW = new Date().toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: /api/teams/* routes (renamed from /api/products/*)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1: /api/teams routes", () => {
	let ctx: AppCtx;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = await setupApp();

		// Seed a team + teamMembers
		await ctx.db.insert(teams).values({
			id: "team-1",
			name: "Growth Team",
			phase: "build",
			createdAt: NOW,
		});
		await ctx.db.insert(teamMembers).values({
			id: "tm-1",
			teamId: "team-1",
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await ctx.handle.close();
	});

	// AC-1a: GET /api/teams returns list
	it("GET /api/teams returns 200 with teams list", async () => {
		const res = await ctx.app.request("/api/teams", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { teams: unknown[] };
		expect(Array.isArray(body.teams)).toBe(true);
	});

	// AC-1b: GET /api/teams/:id returns team detail
	it("GET /api/teams/:id returns 200 with team detail", async () => {
		const res = await ctx.app.request("/api/teams/team-1", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			team: { id: string; name: string };
			teamMembers: { id: string };
		};
		expect(body.team.id).toBe("team-1");
		expect(body.team.name).toBe("Growth Team");
		expect(body.teamMembers.id).toBe("tm-1");
	});

	// AC-1c: POST /api/teams creates a team (201)
	it("POST /api/teams creates a team and returns 201", async () => {
		const res = await ctx.app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "New Team" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { team?: { id: string } };
		// Team id should use the new "team-" prefix (not "product-")
		expect(body.team?.id).toBeDefined();
		expect(body.team?.id).toMatch(/^team-/);
	});

	// AC-1d: PATCH /api/teams/:teamId updates team
	it("PATCH /api/teams/:teamId returns 200 and updates the team", async () => {
		const res = await ctx.app.request("/api/teams/team-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ phase: "cool-down" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { team?: { phase: string } };
		expect(body.team?.phase).toBe("cool-down");
	});

	// AC-1e: GET /api/products returns 404 (no backward compat)
	it("GET /api/products returns 404 — no backward compat", async () => {
		const res = await ctx.app.request("/api/products", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});

	// AC-1f: GET /api/products/:id returns 404
	it("GET /api/products/:id returns 404 — no backward compat", async () => {
		const res = await ctx.app.request("/api/products/team-1", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});

	// AC-1f (bonus): GET /api/teams/:id returns 404 for unknown id
	it("GET /api/teams/:id returns 404 for unknown id", async () => {
		const res = await ctx.app.request("/api/teams/does-not-exist", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: Bet responses use draft | active | completed | killed
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2: Bet status values in responses", () => {
	let ctx: AppCtx;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = await setupApp();

		await ctx.db.insert(teams).values({ id: "p1", name: "Acme", phase: "build", createdAt: NOW });
		await ctx.db
			.insert(teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await ctx.handle.close();
	});

	it("GET /api/bets response has draft, active, completed, killed groups", async () => {
		// Seed bets in all 4 statuses directly in DB
		await ctx.db.insert(bets).values({
			id: "b-draft",
			teamId: "p1",
			description: "# Draft",
			appetite: "small",
			status: "draft",
			createdAt: NOW,
		});
		await ctx.db.insert(bets).values({
			id: "b-active",
			teamId: "p1",
			description: "# Active",
			appetite: "small",
			status: "active",
			createdAt: NOW,
		});
		await ctx.db.insert(bets).values({
			id: "b-completed",
			teamId: "p1",
			description: "# Completed",
			appetite: "small",
			status: "completed",
			createdAt: NOW,
			completedAt: NOW,
		});
		await ctx.db.insert(bets).values({
			id: "b-killed",
			teamId: "p1",
			description: "# Killed",
			appetite: "small",
			status: "killed",
			createdAt: NOW,
		});

		const res = await ctx.app.request("/api/bets", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown[]>;

		// All 4 new status groups must be present
		expect(body).toHaveProperty("draft");
		expect(body).toHaveProperty("active");
		expect(body).toHaveProperty("completed");
		expect(body).toHaveProperty("killed");

		// Old status values must NOT appear as group keys
		expect(body).not.toHaveProperty("shaped");
		expect(body).not.toHaveProperty("committed");
		expect(body).not.toHaveProperty("in_progress");
		expect(body).not.toHaveProperty("shipped");
	});

	it("No bet response contains old status values (shaped, committed, in_progress, shipped)", async () => {
		await ctx.db.insert(bets).values({
			id: "b-draft",
			teamId: "p1",
			description: "# Draft bet",
			appetite: "small",
			status: "draft",
			createdAt: NOW,
		});

		// Check the list endpoint
		const listRes = await ctx.app.request("/api/bets", { headers: authHeaders() });
		const listBody = (await listRes.json()) as Record<string, Array<Record<string, unknown>>>;
		const allBets = [
			...(listBody.draft ?? []),
			...(listBody.active ?? []),
			...(listBody.completed ?? []),
			...(listBody.killed ?? []),
		];
		const oldStatuses = ["shaped", "committed", "in_progress", "shipped"];
		for (const bet of allBets) {
			expect(oldStatuses).not.toContain(bet.status);
		}

		// Check the detail endpoint
		const detailRes = await ctx.app.request("/api/bets/b-draft", { headers: authHeaders() });
		const detailBody = (await detailRes.json()) as { status: string };
		expect(oldStatuses).not.toContain(detailBody.status);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: Bet creation accepts `description` (not `pitch`), defaults to `draft`
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-3: Bet creation with `description` field", () => {
	let ctx: AppCtx;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = await setupApp();

		await ctx.db.insert(teams).values({ id: "p1", name: "Acme", phase: "build", createdAt: NOW });
		await ctx.db
			.insert(teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await ctx.handle.close();
	});

	// AC-3a: POST /api/bets with `description` succeeds (201)
	it("POST /api/bets with `description` field succeeds with 201", async () => {
		const res = await ctx.app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "p1",
				description: "# Build feature X",
				costAppetite: { minor: 10000, currency: "USD" },
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { description: string; status: string };
		expect(body.description).toBe("# Build feature X");
	});

	// AC-3b: POST /api/bets with `pitch` is rejected (400)
	it("POST /api/bets with `pitch` field is rejected with 400", async () => {
		const res = await ctx.app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "p1",
				// `pitch` is the old field name — must be rejected by strict schema
				pitch: "# Build feature X",
				costAppetite: { minor: 10000, currency: "USD" },
			}),
		});
		// Strict schema should reject unknown field `pitch` (description is required)
		expect(res.status).toBe(400);
	});

	// AC-3c: Created bet status is `draft`
	it("POST /api/bets creates bet with status `draft`", async () => {
		const res = await ctx.app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "p1",
				description: "# Draft bet",
				costAppetite: { minor: 10000, currency: "USD" },
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("draft");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: Bet update accepts `at_risk` boolean
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-4: at_risk PATCH", () => {
	let ctx: AppCtx;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = await setupApp();

		await ctx.db.insert(teams).values({ id: "p1", name: "Acme", phase: "build", createdAt: NOW });
		await ctx.db
			.insert(teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });

		// Seed a draft bet
		await ctx.db.insert(bets).values({
			id: "bet-draft",
			teamId: "p1",
			description: "# Draft bet",
			appetite: "small",
			status: "draft",
			atRisk: 0,
			createdAt: NOW,
		});

		// Seed an active bet
		await ctx.db.insert(bets).values({
			id: "bet-active",
			teamId: "p1",
			description: "# Active bet",
			appetite: "small",
			status: "active",
			atRisk: 0,
			createdAt: NOW,
		});

		// Seed a completed bet
		await ctx.db.insert(bets).values({
			id: "bet-completed",
			teamId: "p1",
			description: "# Completed bet",
			appetite: "small",
			status: "completed",
			atRisk: 0,
			createdAt: NOW,
			completedAt: NOW,
		});

		// Seed a killed bet
		await ctx.db.insert(bets).values({
			id: "bet-killed",
			teamId: "p1",
			description: "# Killed bet",
			appetite: "small",
			status: "killed",
			atRisk: 0,
			createdAt: NOW,
		});
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await ctx.handle.close();
	});

	// AC-4a: PATCH at_risk=true on an active bet sets at_risk, GET returns boolean true
	it("PATCH at_risk=true on active bet succeeds; GET returns at_risk as boolean true", async () => {
		// PATCH
		const patchRes = await ctx.app.request("/api/bets/bet-active", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: true, reason: "Scope increased" }),
		});
		expect(patchRes.status).toBe(200);

		// GET — CRITICAL: at_risk must be boolean true, not integer 1
		const getRes = await ctx.app.request("/api/bets/bet-active", {
			headers: authHeaders(),
		});
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as { atRisk: unknown };
		// at_risk must be a boolean, not 0/1 integer
		expect(typeof body.atRisk).toBe("boolean");
		expect(body.atRisk).toBe(true);
	});

	// AC-4a (snake_case variant): GET returns at_risk as boolean (may be snake_case in response)
	it("GET /api/bets/:id returns at_risk field as boolean (not integer)", async () => {
		// Set at_risk directly in DB as 1 (integer, how SQLite stores it)
		// The GET endpoint must convert it to boolean
		await ctx.db
			.update(bets)
			.set({ atRisk: 1 })
			// @lore U2: drizzle enforce-update-with-where — use where clause
			.where(eq(bets.id, "bet-active"));

		const getRes = await ctx.app.request("/api/bets/bet-active", {
			headers: authHeaders(),
		});
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as Record<string, unknown>;

		// at_risk / atRisk must be a boolean (true), not an integer (1)
		const atRiskValue = body.atRisk ?? body.at_risk;
		expect(typeof atRiskValue).toBe("boolean");
		expect(atRiskValue).toBe(true);
	});

	// AC-4b: at_risk is mutable in `draft` status
	it("PATCH at_risk=true on draft bet succeeds", async () => {
		const res = await ctx.app.request("/api/bets/bet-draft", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: true, reason: "Risk identified early" }),
		});
		expect(res.status).toBe(200);
	});

	// AC-4b: at_risk is mutable in `active` status
	it("PATCH at_risk=false on active bet succeeds", async () => {
		const res = await ctx.app.request("/api/bets/bet-active", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: false, reason: "Risk resolved" }),
		});
		expect(res.status).toBe(200);
	});

	// AC-4c: at_risk is NOT mutable in `completed` status
	it("PATCH at_risk on completed bet returns 400", async () => {
		const res = await ctx.app.request("/api/bets/bet-completed", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: true, reason: "Too late" }),
		});
		expect(res.status).toBe(400);
	});

	// AC-4c: at_risk is NOT mutable in `killed` status
	it("PATCH at_risk on killed bet returns 400", async () => {
		const res = await ctx.app.request("/api/bets/bet-killed", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: true, reason: "Already killed" }),
		});
		expect(res.status).toBe(400);
	});

	// AC-4: reason is required for at_risk PATCH
	it("PATCH at_risk without reason returns 400", async () => {
		const res = await ctx.app.request("/api/bets/bet-active", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: true }),
		});
		expect(res.status).toBe(400);
	});

	// AC-4: at_risk value must be boolean (not string)
	it("PATCH at_risk with string value returns 400", async () => {
		const res = await ctx.app.request("/api/bets/bet-active", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: "true", reason: "bad value" }),
		});
		expect(res.status).toBe(400);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: State transitions enforce lifecycle with 400 on invalid
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-5: Bet lifecycle transitions with 400 on invalid", () => {
	let ctx: AppCtx;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = await setupApp();

		await ctx.db.insert(teams).values({ id: "p1", name: "Acme", phase: "build", createdAt: NOW });
		await ctx.db
			.insert(teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await ctx.handle.close();
	});

	async function createDraftBet(id: string): Promise<void> {
		await ctx.db.insert(bets).values({
			id,
			teamId: "p1",
			description: `# Bet ${id}`,
			appetite: "small",
			status: "draft",
			createdAt: NOW,
		});
	}

	async function setActiveBet(id: string): Promise<void> {
		await ctx.db.insert(bets).values({
			id,
			teamId: "p1",
			description: `# Bet ${id}`,
			appetite: "small",
			status: "active",
			createdAt: NOW,
		});
	}

	async function setCompletedBet(id: string): Promise<void> {
		await ctx.db.insert(bets).values({
			id,
			teamId: "p1",
			description: `# Bet ${id}`,
			appetite: "small",
			status: "completed",
			createdAt: NOW,
			completedAt: NOW,
		});
	}

	async function setKilledBet(id: string): Promise<void> {
		await ctx.db.insert(bets).values({
			id,
			teamId: "p1",
			description: `# Bet ${id}`,
			appetite: "small",
			status: "killed",
			createdAt: NOW,
		});
	}

	// AC-5a: draft→active (POST /commit) succeeds
	it("AC-5a: draft→active via POST /commit succeeds (200)", async () => {
		await createDraftBet("b-commit");
		const res = await ctx.app.request("/api/bets/b-commit/commit", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("active");
	});

	// AC-5b: active→completed (POST /ship) succeeds
	it("AC-5b: active→completed via POST /ship succeeds (200)", async () => {
		await setActiveBet("b-ship");
		const res = await ctx.app.request("/api/bets/b-ship/ship", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("completed");
	});

	// AC-5c: active→killed (POST /kill) succeeds
	it("AC-5c: active→killed via POST /kill succeeds (200)", async () => {
		await setActiveBet("b-kill-from-active");
		const res = await ctx.app.request("/api/bets/b-kill-from-active/kill", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "No longer needed" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("killed");
	});

	// AC-5d: draft→killed (POST /kill) succeeds
	it("AC-5d: draft→killed via POST /kill succeeds (200)", async () => {
		await createDraftBet("b-kill-from-draft");
		const res = await ctx.app.request("/api/bets/b-kill-from-draft/kill", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Changed plans" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("killed");
	});

	// AC-5e: draft→completed (POST /ship) returns 400 (not 409)
	it("AC-5e: draft→completed via POST /ship returns 400 (not 409)", async () => {
		await createDraftBet("b-bad-ship");
		const res = await ctx.app.request("/api/bets/b-bad-ship/ship", {
			method: "POST",
			headers: authHeaders(),
		});
		// CRITICAL: must be 400, not 409
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VALIDATION_ERROR");
	});

	// AC-5f: completed→active (POST /commit) returns 400
	it("AC-5f: completed→active via POST /commit returns 400 (not 409)", async () => {
		await setCompletedBet("b-bad-commit-completed");
		const res = await ctx.app.request("/api/bets/b-bad-commit-completed/commit", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VALIDATION_ERROR");
	});

	// AC-5g: killed→active (POST /commit) returns 400
	it("AC-5g: killed→active via POST /commit returns 400 (not 409)", async () => {
		await setKilledBet("b-bad-commit-killed");
		const res = await ctx.app.request("/api/bets/b-bad-commit-killed/commit", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VALIDATION_ERROR");
	});

	// AC-5h: All invalid transitions return HTTP 400 with code VALIDATION_ERROR
	it("AC-5h: completed→killed returns 400 with VALIDATION_ERROR code", async () => {
		await setCompletedBet("b-completed-kill");
		const res = await ctx.app.request("/api/bets/b-completed-kill/kill", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Changing" }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VALIDATION_ERROR");
	});

	it("AC-5h: killed→killed returns 400 with VALIDATION_ERROR code", async () => {
		await setKilledBet("b-killed-kill");
		const res = await ctx.app.request("/api/bets/b-killed-kill/kill", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Already dead" }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VALIDATION_ERROR");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6: MUTABLE_BET_FIELDS includes "description" and "at_risk"
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-6: MUTABLE_BET_FIELDS shared constant", () => {
	it("MUTABLE_BET_FIELDS includes 'description'", () => {
		expect(MUTABLE_BET_FIELDS).toContain("description");
	});

	it("MUTABLE_BET_FIELDS includes 'at_risk'", () => {
		expect(MUTABLE_BET_FIELDS).toContain("at_risk");
	});

	it("MUTABLE_BET_FIELDS still includes existing fields", () => {
		expect(MUTABLE_BET_FIELDS).toContain("done_condition");
		expect(MUTABLE_BET_FIELDS).toContain("hypothesis");
		expect(MUTABLE_BET_FIELDS).toContain("cost_appetite");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8: Bet detail response drops `product` field
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-8: Bet detail response has `team` not `product`", () => {
	let ctx: AppCtx;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = await setupApp();

		await ctx.db.insert(teams).values({ id: "p1", name: "Acme", phase: "build", createdAt: NOW });
		await ctx.db
			.insert(teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });

		await ctx.db.insert(bets).values({
			id: "bet-detail",
			teamId: "p1",
			description: "# Detail bet",
			appetite: "small",
			status: "draft",
			createdAt: NOW,
		});
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await ctx.handle.close();
	});

	it("GET /api/bets/:id has `team` field in response", async () => {
		const res = await ctx.app.request("/api/bets/bet-detail", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toHaveProperty("team");
		expect(body.team).toBeTruthy();
	});

	it("GET /api/bets/:id does NOT have `product` field in response", async () => {
		const res = await ctx.app.request("/api/bets/bet-detail", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		// product field must be absent — clean cut, no backward compat alias
		expect(body).not.toHaveProperty("product");
	});

	it("GET /api/bets/:id `team` field is the team name string", async () => {
		const res = await ctx.app.request("/api/bets/bet-detail", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { team: unknown };
		// team should be a non-empty string (the team name or id)
		expect(typeof body.team).toBe("string");
		expect(body.team).toBeTruthy();
	});
});
