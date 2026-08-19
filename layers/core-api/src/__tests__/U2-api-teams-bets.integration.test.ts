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

import { bets, type HyperIdleDb, teamMembers, teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-U2";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

const NOW = new Date().toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: /api/teams/* routes (renamed from /api/products/*)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1: /api/teams routes", () => {
	async function seedAC1(db: HyperIdleDb): Promise<void> {
		await db
			.insert(teams)
			.values({ id: "team-1", name: "Growth Team", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: "tm-1", teamId: "team-1", capacity: 3, activeBets: 0, formedAt: NOW });
	}

	// AC-1a: GET /api/teams returns list
	test("GET /api/teams returns 200 with teams list", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC1(db);
		const res = await app.request("/api/teams", { method: "GET", headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { teams: unknown[] };
		expect(Array.isArray(body.teams)).toBe(true);
		vi.unstubAllEnvs();
	});

	// AC-1b: GET /api/teams/:id returns team detail
	test("GET /api/teams/:id returns 200 with team detail", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC1(db);
		const res = await app.request("/api/teams/team-1", { method: "GET", headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			team: { id: string; name: string };
			teamMembers: { id: string };
		};
		expect(body.team.id).toBe("team-1");
		expect(body.team.name).toBe("Growth Team");
		expect(body.teamMembers.id).toBe("tm-1");
		vi.unstubAllEnvs();
	});

	// AC-1c: POST /api/teams creates a team (201)
	// @lore AF15: seedAC1 is intentionally NOT called here — the idempotency
	// guard (AF15 AC-4) returns 200 when a team already exists. Creating the
	// first team must be tested on an empty DB to get 201.
	test("POST /api/teams creates a team and returns 201", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "New Team" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { team?: { id: string } };
		expect(body.team?.id).toBeDefined();
		expect(body.team?.id).toMatch(/^team-/);
		vi.unstubAllEnvs();
	});

	// AC-1d: PATCH /api/teams/:teamId updates team
	test("PATCH /api/teams/:teamId returns 200 and updates the team", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC1(db);
		const res = await app.request("/api/teams/team-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ phase: "cool-down" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { team?: { phase: string } };
		expect(body.team?.phase).toBe("cool-down");
		vi.unstubAllEnvs();
	});

	// AC-1e: GET /api/products returns 404 (no backward compat)
	test("GET /api/products returns 404 — no backward compat", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/products", { method: "GET", headers: authHeaders() });
		expect(res.status).toBe(404);
		vi.unstubAllEnvs();
	});

	// AC-1f: GET /api/products/:id returns 404
	test("GET /api/products/:id returns 404 — no backward compat", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/products/team-1", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
		vi.unstubAllEnvs();
	});

	// AC-1f (bonus): GET /api/teams/:id returns 404 for unknown id
	test("GET /api/teams/:id returns 404 for unknown id", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/teams/does-not-exist", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
		vi.unstubAllEnvs();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: Bet responses use draft | active | completed | killed
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2: Bet status values in responses", () => {
	async function seedAC2(db: HyperIdleDb): Promise<void> {
		await db.insert(teams).values({ id: "p1", name: "Acme", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	}

	test("GET /api/bets response has draft, active, completed, killed groups", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC2(db);

		// Seed bets in all 4 statuses directly in DB
		await db.insert(bets).values({
			id: "b-draft",
			teamId: "p1",
			description: "# Draft",
			appetite: "small",
			status: "draft",
			createdAt: NOW,
		});
		await db.insert(bets).values({
			id: "b-active",
			teamId: "p1",
			description: "# Active",
			appetite: "small",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(bets).values({
			id: "b-completed",
			teamId: "p1",
			description: "# Completed",
			appetite: "small",
			status: "completed",
			createdAt: NOW,
			completedAt: NOW,
		});
		await db.insert(bets).values({
			id: "b-killed",
			teamId: "p1",
			description: "# Killed",
			appetite: "small",
			status: "killed",
			createdAt: NOW,
		});

		const res = await app.request("/api/bets", { headers: authHeaders() });
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
		vi.unstubAllEnvs();
	});

	test("No bet response contains old status values (shaped, committed, in_progress, shipped)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC2(db);

		await db.insert(bets).values({
			id: "b-draft",
			teamId: "p1",
			description: "# Draft bet",
			appetite: "small",
			status: "draft",
			createdAt: NOW,
		});

		// Check the list endpoint
		const listRes = await app.request("/api/bets", { headers: authHeaders() });
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
		const detailRes = await app.request("/api/bets/b-draft", { headers: authHeaders() });
		const detailBody = (await detailRes.json()) as { status: string };
		expect(oldStatuses).not.toContain(detailBody.status);
		vi.unstubAllEnvs();
	});

	// CRITICAL (W-1): at_risk must be boolean on the wire in the LIST endpoint too
	test("GET /api/bets list response normalizes atRisk to boolean (not 0/1 integer)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC2(db);

		// Insert a bet with atRisk = 1 (raw DB integer representation)
		await db.insert(bets).values({
			id: "b-at-risk",
			teamId: "p1",
			description: "# At risk bet",
			appetite: "small",
			status: "active",
			atRisk: 1,
			createdAt: NOW,
		});

		const res = await app.request("/api/bets", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, Array<{ atRisk: unknown }>>;

		const activeBets = body.active ?? [];
		const atRiskBet = activeBets.find((b) => (b as { id?: string }).id === "b-at-risk");
		expect(atRiskBet).toBeDefined();
		// CRITICAL: atRisk must be boolean true, not integer 1
		expect(typeof atRiskBet?.atRisk).toBe("boolean");
		expect(atRiskBet?.atRisk).toBe(true);
		vi.unstubAllEnvs();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: Bet creation accepts `description` (not `pitch`), defaults to `draft`
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-3: Bet creation with `description` field", () => {
	async function seedAC3(db: HyperIdleDb): Promise<void> {
		await db.insert(teams).values({ id: "p1", name: "Acme", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	}

	// AC-3a: POST /api/bets with `description` succeeds (201)
	test("POST /api/bets with `description` field succeeds with 201", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC3(db);
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "p1",
				description: "# Build feature X",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { description: string; status: string };
		expect(body.description).toBe("# Build feature X");
		vi.unstubAllEnvs();
	});

	// AC-3b: POST /api/bets with `pitch` is rejected (400)
	test("POST /api/bets with `pitch` field is rejected with 400", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC3(db);
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "p1",
				pitch: "# Build feature X",
			}),
		});
		// Strict schema should reject unknown field `pitch` (description is required)
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// AC-3c: Created bet status is `draft`
	test("POST /api/bets creates bet with status `draft`", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC3(db);
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "p1",
				description: "# Draft bet",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("draft");
		vi.unstubAllEnvs();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: Bet update accepts `at_risk` boolean
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-4: at_risk PATCH", () => {
	async function seedAC4(db: HyperIdleDb): Promise<void> {
		await db.insert(teams).values({ id: "p1", name: "Acme", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });

		await db.insert(bets).values({
			id: "bet-draft",
			teamId: "p1",
			description: "# Draft bet",
			appetite: "small",
			status: "draft",
			atRisk: 0,
			createdAt: NOW,
		});
		await db.insert(bets).values({
			id: "bet-active",
			teamId: "p1",
			description: "# Active bet",
			appetite: "small",
			status: "active",
			atRisk: 0,
			createdAt: NOW,
		});
		await db.insert(bets).values({
			id: "bet-completed",
			teamId: "p1",
			description: "# Completed bet",
			appetite: "small",
			status: "completed",
			atRisk: 0,
			createdAt: NOW,
			completedAt: NOW,
		});
		await db.insert(bets).values({
			id: "bet-killed",
			teamId: "p1",
			description: "# Killed bet",
			appetite: "small",
			status: "killed",
			atRisk: 0,
			createdAt: NOW,
		});
	}

	// AC-4a: PATCH at_risk=true on an active bet sets at_risk, GET returns boolean true
	test("PATCH at_risk=true on active bet succeeds; GET returns at_risk as boolean true", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC4(db);
		// PATCH
		const patchRes = await app.request("/api/bets/bet-active", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: true, reason: "Scope increased" }),
		});
		expect(patchRes.status).toBe(200);

		// GET — CRITICAL: at_risk must be boolean true, not integer 1
		const getRes = await app.request("/api/bets/bet-active", { headers: authHeaders() });
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as { atRisk: unknown };
		expect(typeof body.atRisk).toBe("boolean");
		expect(body.atRisk).toBe(true);
		vi.unstubAllEnvs();
	});

	// AC-4a (snake_case variant): GET returns at_risk as boolean (may be snake_case in response)
	test("GET /api/bets/:id returns at_risk field as boolean (not integer)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC4(db);
		// Set at_risk directly in DB as 1 (integer, how SQLite stores it)
		// The GET endpoint must convert it to boolean
		await db
			.update(bets)
			.set({ atRisk: 1 })
			// @lore U2: drizzle enforce-update-with-where — use where clause
			.where(eq(bets.id, "bet-active"));

		const getRes = await app.request("/api/bets/bet-active", { headers: authHeaders() });
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as Record<string, unknown>;

		// at_risk / atRisk must be a boolean (true), not an integer (1)
		const atRiskValue = body.atRisk ?? body.at_risk;
		expect(typeof atRiskValue).toBe("boolean");
		expect(atRiskValue).toBe(true);
		vi.unstubAllEnvs();
	});

	// AC-4b: at_risk is mutable in `draft` status
	test("PATCH at_risk=true on draft bet succeeds", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC4(db);
		const res = await app.request("/api/bets/bet-draft", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: true, reason: "Risk identified early" }),
		});
		expect(res.status).toBe(200);
		vi.unstubAllEnvs();
	});

	// AC-4b: at_risk is mutable in `active` status
	test("PATCH at_risk=false on active bet succeeds", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC4(db);
		const res = await app.request("/api/bets/bet-active", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: false, reason: "Risk resolved" }),
		});
		expect(res.status).toBe(200);
		vi.unstubAllEnvs();
	});

	// AC-4c: at_risk is NOT mutable in `completed` status
	test("PATCH at_risk on completed bet returns 400", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC4(db);
		const res = await app.request("/api/bets/bet-completed", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: true, reason: "Too late" }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// AC-4c: at_risk is NOT mutable in `killed` status
	test("PATCH at_risk on killed bet returns 400", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC4(db);
		const res = await app.request("/api/bets/bet-killed", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: true, reason: "Already killed" }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// AC-4: reason is required for at_risk PATCH
	test("PATCH at_risk without reason returns 400", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC4(db);
		const res = await app.request("/api/bets/bet-active", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: true }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// AC-4: at_risk value must be boolean (not string)
	test("PATCH at_risk with string value returns 400", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC4(db);
		const res = await app.request("/api/bets/bet-active", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "at_risk", value: "true", reason: "bad value" }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: State transitions enforce lifecycle with 400 on invalid
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-5: Bet lifecycle transitions with 400 on invalid", () => {
	async function seedAC5Base(db: HyperIdleDb): Promise<void> {
		await db.insert(teams).values({ id: "p1", name: "Acme", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	}

	async function createDraftBet(db: HyperIdleDb, id: string): Promise<void> {
		await db.insert(bets).values({
			id,
			teamId: "p1",
			description: `# Bet ${id}`,
			appetite: "small",
			status: "draft",
			createdAt: NOW,
		});
	}

	async function setActiveBet(db: HyperIdleDb, id: string): Promise<void> {
		await db.insert(bets).values({
			id,
			teamId: "p1",
			description: `# Bet ${id}`,
			appetite: "small",
			status: "active",
			createdAt: NOW,
		});
	}

	async function setCompletedBet(db: HyperIdleDb, id: string): Promise<void> {
		await db.insert(bets).values({
			id,
			teamId: "p1",
			description: `# Bet ${id}`,
			appetite: "small",
			status: "completed",
			createdAt: NOW,
			completedAt: NOW,
		});
	}

	async function setKilledBet(db: HyperIdleDb, id: string): Promise<void> {
		await db.insert(bets).values({
			id,
			teamId: "p1",
			description: `# Bet ${id}`,
			appetite: "small",
			status: "killed",
			createdAt: NOW,
		});
	}

	// AC-5a: draft→active (POST /commit) succeeds
	test("AC-5a: draft→active via POST /commit succeeds (200)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC5Base(db);
		await createDraftBet(db, "b-commit");
		const res = await app.request("/api/bets/b-commit/commit", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("active");
		vi.unstubAllEnvs();
	});

	// AC-5c: active→killed (POST /kill) succeeds
	test("AC-5c: active→killed via POST /kill succeeds (200)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC5Base(db);
		await setActiveBet(db, "b-kill-from-active");
		const res = await app.request("/api/bets/b-kill-from-active/kill", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "No longer needed" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("killed");
		vi.unstubAllEnvs();
	});

	// AC-5d: draft→killed (POST /kill) succeeds
	test("AC-5d: draft→killed via POST /kill succeeds (200)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC5Base(db);
		await createDraftBet(db, "b-kill-from-draft");
		const res = await app.request("/api/bets/b-kill-from-draft/kill", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Changed plans" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("killed");
		vi.unstubAllEnvs();
	});

	// AC-5f: completed→active (POST /commit) returns 400
	test("AC-5f: completed→active via POST /commit returns 400 (not 409)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC5Base(db);
		await setCompletedBet(db, "b-bad-commit-completed");
		const res = await app.request("/api/bets/b-bad-commit-completed/commit", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VALIDATION_ERROR");
		vi.unstubAllEnvs();
	});

	// AC-5g: killed→active (POST /commit) returns 400
	test("AC-5g: killed→active via POST /commit returns 400 (not 409)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC5Base(db);
		await setKilledBet(db, "b-bad-commit-killed");
		const res = await app.request("/api/bets/b-bad-commit-killed/commit", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VALIDATION_ERROR");
		vi.unstubAllEnvs();
	});

	// AC-5h: All invalid transitions return HTTP 400 with code VALIDATION_ERROR
	test("AC-5h: completed→killed returns 400 with VALIDATION_ERROR code", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC5Base(db);
		await setCompletedBet(db, "b-completed-kill");
		const res = await app.request("/api/bets/b-completed-kill/kill", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Changing" }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VALIDATION_ERROR");
		vi.unstubAllEnvs();
	});

	test("AC-5h: killed→killed returns 400 with VALIDATION_ERROR code", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC5Base(db);
		await setKilledBet(db, "b-killed-kill");
		const res = await app.request("/api/bets/b-killed-kill/kill", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Already dead" }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VALIDATION_ERROR");
		vi.unstubAllEnvs();
	});

	// CRITICAL (W-1): transition responses must also normalize atRisk to boolean
	test("POST /commit response normalizes atRisk to boolean (not integer)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC5Base(db);
		await db.insert(bets).values({
			id: "b-commit-atrisk",
			teamId: "p1",
			description: "# Commit atRisk",
			appetite: "small",
			status: "draft",
			atRisk: 1,
			createdAt: NOW,
		});
		const res = await app.request("/api/bets/b-commit-atrisk/commit", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { atRisk: unknown };
		expect(typeof body.atRisk).toBe("boolean");
		expect(body.atRisk).toBe(true);
		vi.unstubAllEnvs();
	});

	test("POST /kill response normalizes atRisk to boolean (not integer)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC5Base(db);
		await db.insert(bets).values({
			id: "b-kill-atrisk",
			teamId: "p1",
			description: "# Kill atRisk",
			appetite: "small",
			status: "active",
			atRisk: 1,
			createdAt: NOW,
		});
		const res = await app.request("/api/bets/b-kill-atrisk/kill", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Abandoning" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { atRisk: unknown };
		expect(typeof body.atRisk).toBe("boolean");
		expect(body.atRisk).toBe(true);
		vi.unstubAllEnvs();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8: Bet detail response drops `product` field
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-8: Bet detail response has `team` not `product`", () => {
	async function seedAC8(db: HyperIdleDb): Promise<void> {
		await db.insert(teams).values({ id: "p1", name: "Acme", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
		await db.insert(bets).values({
			id: "bet-detail",
			teamId: "p1",
			description: "# Detail bet",
			appetite: "small",
			status: "draft",
			createdAt: NOW,
		});
	}

	test("GET /api/bets/:id has `team` field in response", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC8(db);
		const res = await app.request("/api/bets/bet-detail", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toHaveProperty("team");
		expect(body.team).toBeTruthy();
		vi.unstubAllEnvs();
	});

	test("GET /api/bets/:id does NOT have `product` field in response", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC8(db);
		const res = await app.request("/api/bets/bet-detail", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		// product field must be absent — clean cut, no backward compat alias
		expect(body).not.toHaveProperty("product");
		vi.unstubAllEnvs();
	});

	test("GET /api/bets/:id `team` field is the team name string", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAC8(db);
		const res = await app.request("/api/bets/bet-detail", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { team: unknown };
		// team should be a non-empty string (the team name or id)
		expect(typeof body.team).toBe("string");
		expect(body.team).toBeTruthy();
		vi.unstubAllEnvs();
	});
});
