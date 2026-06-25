/**
 * AL5 — /api/surface-adoptions route integration tests.
 *
 * Covers:
 *   Invariant #2: at-most-one adoption per (team, tool, kind) — unique DB index
 *   Invariant #6: adoption isolation by teamId query filter
 *   GET /api/surface-adoptions?teamId=… — returns team's adoptions
 *   POST /api/surface-adoptions — creates adoption, pins version, returns AdoptionView 201
 *   POST /api/surface-adoptions — second POST for same situation upserts (replaces), not duplicates
 *   DELETE /api/surface-adoptions/:id — 204, row absent after deletion
 *   DELETE /api/surface-adoptions/:id cross-team → 404 (don't leak existence)
 *   POST with unknown surfaceId → 400 (surfaceId must exist in registry)
 *   Auth gate — 401 without credentials
 *   GET /api/surface-registry — returns SurfaceManifest[]
 *
 * RED PHASE: routes do not exist; table does not exist. All tests fail at the
 * DB/route level as expected.
 *
 * Fixture pattern: test() from ../../test-fixtures.js with { db, app }.
 * Auth: X-API-Key header (same as all route integration tests).
 */

import { type HyperIdleDb, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-al5-adoptions";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

async function seedTeam(db: HyperIdleDb, id: string, name: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id, name, phase: "build", createdAt: now });
}

async function seedUser(db: HyperIdleDb, id: string, name: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id,
		kind: "human",
		name,
		role: "founder",
		status: "active",
		createdAt: now,
	});
}

// ── Auth gate ─────────────────────────────────────────────────────────────────

describe("AL5 surface-adoptions — auth gate", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/surface-adoptions returns 401 without auth", async ({ app }) => {
		const res = await app.request("/api/surface-adoptions?teamId=t1", { method: "GET" });
		expect(res.status).toBe(401);
	});

	test("POST /api/surface-adoptions returns 401 without auth", async ({ app }) => {
		const res = await app.request("/api/surface-adoptions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				teamId: "t1",
				tool: "stripe",
				kind: "action_operation",
				surfaceId: "stripe-refund-review",
			}),
		});
		expect(res.status).toBe(401);
	});

	test("DELETE /api/surface-adoptions/:id returns 401 without auth", async ({ app }) => {
		const res = await app.request("/api/surface-adoptions/sa-nonexistent", {
			method: "DELETE",
		});
		expect(res.status).toBe(401);
	});
});

// ── AC1/AC2: GET + POST happy path ────────────────────────────────────────────

describe("AL5 surface-adoptions — GET and POST happy path", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/surface-adoptions?teamId=… returns empty array when no adoptions", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "team-get-empty", "Get Empty Team");
		await seedUser(db, "user-get-empty", "Get Empty User");

		const res = await app.request("/api/surface-adoptions?teamId=team-get-empty", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as unknown[];
		expect(Array.isArray(body)).toBe(true);
		expect(body).toHaveLength(0);
	});

	test("POST /api/surface-adoptions creates an adoption and returns 201 AdoptionView", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "team-post-ok", "Post OK Team");
		await seedUser(db, "user-post-ok", "Post OK User");

		const res = await app.request("/api/surface-adoptions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "team-post-ok",
				tool: "stripe",
				kind: "action_operation",
				surfaceId: "stripe-refund-review",
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		// AdoptionView fields (architecture §5)
		expect(body.id).toBeTruthy();
		expect(body.tool).toBe("stripe");
		expect(body.kind).toBe("action_operation");
		expect(body.surfaceId).toBe("stripe-refund-review");
		expect(body.pinnedVersion).toBeTruthy(); // pinned to current registry version
		expect(body.provenance).toBe("first-party"); // from the registry manifest
		expect(body.trustTier).toBe("vetted"); // from the registry manifest
		expect(body.surfaceTitle).toBeTruthy();
		expect(body.baseCanvas).toBe("action_operation");
	});

	test("POST then GET returns the adoption in the list", async ({ db, app }) => {
		await seedTeam(db, "team-post-get", "Post Get Team");
		await seedUser(db, "user-post-get", "Post Get User");

		await app.request("/api/surface-adoptions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "team-post-get",
				tool: "stripe",
				kind: "action_operation",
				surfaceId: "stripe-refund-review",
			}),
		});

		const res = await app.request("/api/surface-adoptions?teamId=team-post-get", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;
		expect(body).toHaveLength(1);
		expect(body[0]?.surfaceId).toBe("stripe-refund-review");
	});
});

// ── Invariant #2: at-most-one per situation (unique index) ────────────────────

describe("AL5 surface-adoptions — invariant #2: at-most-one per (team, tool, kind)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("second POST for same (teamId, tool, kind) UPSERTS (replaces), not duplicates — GET returns one row", async ({
		db,
		app,
	}) => {
		// Invariant #2: unique index on (teamId, tool, kind) enforces at-most-one.
		// POST twice with same situation → only one row (upsert/replace, not accumulate).
		await seedTeam(db, "team-upsert", "Upsert Team");
		await seedUser(db, "user-upsert", "Upsert User");

		await app.request("/api/surface-adoptions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "team-upsert",
				tool: "stripe",
				kind: "action_operation",
				surfaceId: "stripe-refund-review",
			}),
		});

		// Second POST — same situation (upsert).
		const res2 = await app.request("/api/surface-adoptions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "team-upsert",
				tool: "stripe",
				kind: "action_operation",
				surfaceId: "stripe-refund-review",
			}),
		});
		// Either 200 (upsert updated) or 201 (created) — NOT 409 conflict.
		// The unique index must allow the upsert, not reject it.
		expect([200, 201]).toContain(res2.status);

		// GET must return exactly ONE row for this team.
		const listRes = await app.request("/api/surface-adoptions?teamId=team-upsert", {
			method: "GET",
			headers: authHeaders(),
		});
		const body = (await listRes.json()) as Array<Record<string, unknown>>;
		const stripeRows = body.filter(
			(r) => r.tool === "stripe" && r.kind === "action_operation",
		);
		expect(stripeRows).toHaveLength(1);
	});
});

// ── DELETE happy path ──────────────────────────────────────────────────────────

describe("AL5 surface-adoptions — DELETE happy path", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("DELETE /api/surface-adoptions/:id removes the adoption → 204, absent from GET", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "team-delete-ok", "Delete OK Team");
		await seedUser(db, "user-delete-ok", "Delete OK User");

		// Create an adoption.
		const postRes = await app.request("/api/surface-adoptions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "team-delete-ok",
				tool: "stripe",
				kind: "action_operation",
				surfaceId: "stripe-refund-review",
			}),
		});
		const { id } = (await postRes.json()) as { id: string };
		expect(id).toBeTruthy();

		// Delete it.
		const deleteRes = await app.request(`/api/surface-adoptions/${id}`, {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(deleteRes.status).toBe(204);

		// GET should return empty now (row absent = base canvas, i.e. default-by-absence).
		const listRes = await app.request("/api/surface-adoptions?teamId=team-delete-ok", {
			method: "GET",
			headers: authHeaders(),
		});
		const body = (await listRes.json()) as unknown[];
		expect(body).toHaveLength(0);
	});
});

// ── Invariant #6: adoption isolation by teamId ────────────────────────────────

describe("AL5 surface-adoptions — invariant #6: cross-team isolation", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/surface-adoptions?teamId=A does not return team B's adoptions", async ({
		db,
		app,
	}) => {
		// Invariant #6: isolation is enforced at DB query level (teamId filter).
		await seedTeam(db, "team-iso-a", "Iso Team A");
		await seedTeam(db, "team-iso-b", "Iso Team B");
		await seedUser(db, "user-iso", "Iso User");

		// Adopt for team B.
		await app.request("/api/surface-adoptions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "team-iso-b",
				tool: "stripe",
				kind: "action_operation",
				surfaceId: "stripe-refund-review",
			}),
		});

		// GET for team A — must not see team B's adoption.
		const res = await app.request("/api/surface-adoptions?teamId=team-iso-a", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as unknown[];
		expect(body).toHaveLength(0);
	});

	test("DELETE /api/surface-adoptions/:id cross-team → 404 (don't leak existence)", async ({
		db,
		app,
	}) => {
		// Invariant #6: cross-team DELETE matches 0 rows → 404.
		// This mirrors the connections.ts cross-user 404 pattern.
		await seedTeam(db, "team-cross-owner", "Cross Owner Team");
		await seedTeam(db, "team-cross-attacker", "Cross Attacker Team");
		await seedUser(db, "user-cross", "Cross User");

		// Create adoption for owner team.
		const postRes = await app.request("/api/surface-adoptions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "team-cross-owner",
				tool: "stripe",
				kind: "action_operation",
				surfaceId: "stripe-refund-review",
			}),
		});
		const { id } = (await postRes.json()) as { id: string };

		// The authenticated user belongs to a different team context.
		// Since auth resolves to the first human user, and teamId is passed in body/param,
		// we simulate cross-team access by using an id that belongs to a different team.
		// The route must scope the DELETE by teamId matching the adoption's teamId.
		// NOTE: the exact isolation mechanism depends on the route implementation.
		// The test asserts the behavior: if the requesting context is for a different team,
		// the adoption cannot be deleted (404).
		//
		// For this test, we use the adoption id that belongs to team-cross-owner,
		// but we do not pass teamId (the route will use the auth context's team).
		// Since the auth user might be "cross" and not in team-cross-owner, expect 404.
		const deleteRes = await app.request(`/api/surface-adoptions/${id}?teamId=team-cross-attacker`, {
			method: "DELETE",
			headers: authHeaders(),
		});
		// Cross-team → 404 (existence not leaked, mirroring connections.ts pattern).
		expect(deleteRes.status).toBe(404);
	});
});

// ── Validation: unknown surfaceId → 400 ──────────────────────────────────────

describe("AL5 surface-adoptions — POST validation", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST with unknown surfaceId → 400 (must exist in registry)", async ({ db, app }) => {
		// Architecture §5: POST validates surfaceId exists in registry (else 400).
		await seedTeam(db, "team-validate", "Validate Team");
		await seedUser(db, "user-validate", "Validate User");

		const res = await app.request("/api/surface-adoptions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "team-validate",
				tool: "stripe",
				kind: "action_operation",
				surfaceId: "nonexistent-surface-that-does-not-exist",
			}),
		});
		expect(res.status).toBe(400);
	});
});

// ── GET /api/surface-registry ─────────────────────────────────────────────────

describe("AL5 surface-registry route", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/surface-registry returns array of SurfaceManifest[]", async ({ db, app }) => {
		await seedUser(db, "user-registry", "Registry User");

		const res = await app.request("/api/surface-registry", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;
		expect(Array.isArray(body)).toBe(true);
		// Must include stripe-refund-review as a first-party manifest.
		const stripe = body.find((m) => m.id === "stripe-refund-review");
		expect(stripe).toBeDefined();
		expect(stripe?.baseCanvas).toBe("action_operation");
		expect(stripe?.provenance).toBe("first-party");
		expect(stripe?.trustTier).toBe("vetted");
	});

	test("GET /api/surface-registry returns 401 without auth", async ({ app }) => {
		const res = await app.request("/api/surface-registry", { method: "GET" });
		expect(res.status).toBe(401);
	});
});

// ── DB-level unique index test (structural guard for invariant #2) ─────────────

describe("AL5 surface-adoptions — DB unique index (structural invariant #2)", () => {
	test("direct DB insert of two rows with same (teamId, tool, kind) throws a unique constraint error", async ({
		db,
	}) => {
		// Invariant #2: the unique index on surface_adoptions (team_id, tool, kind) is
		// structural — the DB CANNOT hold two adoptions for the same (team, situation).
		// This is the lowest-level proof that the constraint is real, not just enforced at route level.

		// This import will fail until surfaceAdoptions is added to schema.ts.
		const { surfaceAdoptions } = await import("@hyperidle/db");

		await db.insert(teams).values({
			id: "team-db-unique",
			name: "DB Unique Team",
			phase: "build",
			createdAt: new Date().toISOString(),
		});
		await db.insert(users).values({
			id: "user-db-unique",
			kind: "human",
			name: "DB Unique User",
			role: "founder",
			status: "active",
			createdAt: new Date().toISOString(),
		});

		const now = new Date().toISOString();
		const base = {
			teamId: "team-db-unique",
			tool: "stripe",
			kind: "action_operation",
			surfaceId: "stripe-refund-review",
			pinnedVersion: "1.0.0",
			provenance: "first-party",
			trustTier: "vetted",
			adoptedBy: "user-db-unique",
			createdAt: now,
			updatedAt: now,
		};

		// First insert succeeds.
		await db.insert(surfaceAdoptions).values({ id: "sa-unique-1", ...base });

		// Second insert with same (teamId, tool, kind) MUST throw a unique constraint error.
		await expect(
			db.insert(surfaceAdoptions).values({ id: "sa-unique-2", ...base }),
		).rejects.toThrow();
	});
});
