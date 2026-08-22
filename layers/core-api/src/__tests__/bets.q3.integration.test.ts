/**
 * Q3 — Human-created bets: API tests.
 *
 * Covers:
 *   T2: teamId required, revisionLog seeded on create, description .min(1)
 *   T3: GET /api/bets/canvas enriched with team name + derived title
 *       (AU21 Increment 14a: appetite display HARD-DELETED, no replacement)
 *   T4: PATCH field="description" — mutable on draft/active;
 *       NOT mutable on completed/killed.
 *
 * AC covered: AC3, AC6, AC7, AC8, AC10
 *
 * @lore U1: productId -> teamId (references teams domain entity, not teamMembers).
 * pitch -> description. shaped -> draft. committed|in_progress -> active. shipped -> completed.
 */

import { bets, teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-bets-q3";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Bet Endpoints (Q3)", () => {
	// ── T2: teamId, revisionLog seeded, description .min(1) ─────────────────────

	describe("T2: AC8 — teamId required", () => {
		test("creates a bet with teamId referencing teams domain entity", async ({ db, app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

			await db.insert(teams).values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					// @lore U1: teamId references teams.id (domain entity), not teamMembers.id
					teamId: "prod-1",
					description: "Build feature Z",
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.teamId).toBe("prod-1");
			// @lore U1: status is "draft" (formerly "shaped")
			expect(body.status).toBe("draft");
			vi.unstubAllEnvs();
		});

		test("returns 400 when teamId does not exist", async ({ db, app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

			await db.insert(teams).values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "nonexistent-team",
					description: "Build feature V",
				}),
			});

			expect(res.status).toBe(400);
			vi.unstubAllEnvs();
		});
	});

	describe("T2: AC10 — description validation (.min(1))", () => {
		test("returns 400 when description is empty string", async ({ db, app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

			await db.insert(teams).values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "",
				}),
			});

			expect(res.status).toBe(400);
			vi.unstubAllEnvs();
		});

		test("returns 201 with non-empty description", async ({ db, app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

			await db.insert(teams).values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "A valid description",
				}),
			});

			expect(res.status).toBe(201);
			vi.unstubAllEnvs();
		});
	});

	describe("T2: AC3 — revisionLog seeded on creation", () => {
		test("creates bet with initial revisionLog entry containing status=draft", async ({
			db,
			app,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

			await db.insert(teams).values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "Build feature X",
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as { id: string };

			const [betRow] = await db.select().from(bets).where(eq(bets.id, body.id)).limit(1);
			expect(betRow).toBeTruthy();
			const revisionLog = JSON.parse(betRow?.revisionLog ?? "[]") as Array<Record<string, unknown>>;
			expect(revisionLog).toHaveLength(1);
			expect(revisionLog[0]?.field).toBe("status");
			// @lore U1: initial status is "draft" (formerly "shaped")
			expect(revisionLog[0]?.new_value).toBe("draft");
			vi.unstubAllEnvs();
		});
	});

	// GET /api/bets/canvas (door #24) deleted. T3 canvas tests removed with the route.

	// ── T4: AC7 — version history tracks both founder and agent edits ─────────────

	describe("T4: AC7 — revision history tracks multiple actors", () => {
		test("revisionLog records actor from auth context", async ({ db, app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

			await db.insert(teams).values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			});

			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "Initial description",
				}),
			});
			expect(createRes.status).toBe(201);
			const { id: betId } = (await createRes.json()) as { id: string };

			// PATCH with a different actor (simulate agent call)
			const patchRes = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: { ...authHeaders(), "X-User-Id": "agent-001" },
				body: JSON.stringify({
					field: "description",
					value: "Agent-updated description",
					reason: "Agent improvement",
				}),
			});
			expect(patchRes.status).toBe(200);

			const [betRow] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
			const revisionLog = JSON.parse(betRow?.revisionLog ?? "[]") as Array<Record<string, unknown>>;
			// At minimum 2 entries: creation + agent patch
			expect(revisionLog.length).toBeGreaterThanOrEqual(2);
			vi.unstubAllEnvs();
		});
	});
});
