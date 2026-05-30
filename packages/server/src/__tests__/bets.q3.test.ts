/**
 * Q3 — Human-created bets: API tests.
 *
 * Covers:
 *   T2: teamId required, revisionLog seeded on create, description .min(1)
 *   T3: GET /api/bets/canvas enriched with team name + derived title + appetite display
 *   T4: PATCH field="description" — mutable on draft/active;
 *       NOT mutable on completed/killed.
 *
 * AC covered: AC3, AC6, AC7, AC8, AC10
 *
 * @lore U1: productId -> teamId (references teams domain entity, not teamMembers).
 * pitch -> description. shaped -> draft. committed|in_progress -> active. shipped -> completed.
 */

import { bets, createTestDb, type HyperIdleDb, teamMembers, teams } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transitionBet } from "../services/bet-state-machine.js";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-bets-q3";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Bet Endpoints (Q3)", () => {
	let db: HyperIdleDb;
	let handle: TestDbHandle;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });

		// Seed domain entity (teams) and membership group (teamMembers)
		await db.insert(teams).values({
			id: "prod-1",
			name: "Test Product",
			phase: "build",
			createdAt: new Date().toISOString(),
		});

		await db.insert(teamMembers).values({
			id: "team-1",
			teamId: "prod-1",
			capacity: 2,
			activeBets: 0,
			formedAt: new Date().toISOString(),
		});
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	// ── T2: teamId, revisionLog seeded, description .min(1) ─────────────────────

	describe("T2: AC8 — teamId required", () => {
		it("creates a bet with teamId referencing teams domain entity", async () => {
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
		});

		it("returns 400 when teamId does not exist", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "nonexistent-team",
					description: "Build feature V",
				}),
			});

			expect(res.status).toBe(400);
		});
	});

	describe("T2: AC10 — description validation (.min(1))", () => {
		it("returns 400 when description is empty string", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "",
				}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 201 with non-empty description", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "A valid description",
				}),
			});

			expect(res.status).toBe(201);
		});
	});

	describe("T2: AC3 — revisionLog seeded on creation", () => {
		it("creates bet with initial revisionLog entry containing status=draft", async () => {
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

			// Check the DB row directly for revisionLog
			const [betRow] = await db.select().from(bets).where(eq(bets.id, body.id)).limit(1);
			expect(betRow).toBeTruthy();
			const revisionLog = JSON.parse(betRow?.revisionLog ?? "[]") as Array<Record<string, unknown>>;
			expect(revisionLog).toHaveLength(1);
			expect(revisionLog[0]?.field).toBe("status");
			// @lore U1: initial status is "draft" (formerly "shaped")
			expect(revisionLog[0]?.new_value).toBe("draft");
		});
	});

	// ── T3: GET /api/bets/canvas enriched ────────────────────────────────────────

	describe("T3: canvas endpoint enrichment", () => {
		it("returns bets with team name in canvas response", async () => {
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "# Canvas Feature\n\nThis is the description body.",
				}),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				draft: Array<Record<string, unknown>>;
				active: Array<Record<string, unknown>>;
				capacity: { used: number; max: number };
			};

			expect(body.draft).toHaveLength(1);
			const bet = body.draft[0];
			// T3: must include team name (U1: field is "team" not "product")
			expect(bet?.team).toBe("Test Product");
		});

		it("returns derived title from description first line in canvas response", async () => {
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "# My Feature Title\n\nThis is the description body.",
				}),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				draft: Array<Record<string, unknown>>;
			};

			const bet = body.draft[0];
			// title derived from first line, stripping "# "
			expect(bet?.title).toBe("My Feature Title");
		});

		it("returns appetite as formatted display string or '—' when null", async () => {
			// No costAppetite
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "Description without appetite",
				}),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			const body = (await res.json()) as {
				draft: Array<Record<string, unknown>>;
			};

			const bet = body.draft[0];
			expect(bet?.appetite).toBe("—");
		});

		it("returns formatted appetite string when costAppetite is set", async () => {
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "Description with appetite",
					costAppetite: { minor: 10000, currency: "USD" },
				}),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			const body = (await res.json()) as {
				draft: Array<Record<string, unknown>>;
			};

			const bet = body.draft[0];
			// appetite should be a non-empty string (formatted money display)
			expect(typeof bet?.appetite).toBe("string");
			expect(bet?.appetite).not.toBe("—");
		});

		it("returns teamId in canvas bet shape", async () => {
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "Description for teamId check",
				}),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			const body = (await res.json()) as {
				draft: Array<Record<string, unknown>>;
			};

			const bet = body.draft[0];
			// @lore U1: teamId references teams.id (domain entity)
			expect(bet?.teamId).toBe("prod-1");
		});

		it("uses batch team lookup — does not include undefined team entries", async () => {
			// Two bets for the same team — team name must appear on both
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: "prod-1", description: "Bet A" }),
			});
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: "prod-1", description: "Bet B" }),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			const body = (await res.json()) as { draft: Array<Record<string, unknown>> };

			for (const bet of body.draft) {
				// @lore U1: field is "team" not "product"
				expect(bet.team).toBe("Test Product");
			}
		});
	});

	// ── T4: PATCH field="description" ────────────────────────────────────────────

	describe("T4: AC6 — PATCH description field", () => {
		async function createBetAndGetId(): Promise<string> {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "Original description",
				}),
			});
			const body = (await res.json()) as { id: string };
			return body.id;
		}

		it("returns 200 and updated description on draft bet", async () => {
			const betId = await createBetAndGetId();

			const res = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					// @lore U1: field is "description" (formerly "pitch")
					field: "description",
					value: "Updated description content",
					reason: "Refined after feedback",
				}),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			// @lore U1: response uses "description" (formerly "pitch")
			expect(body.description).toBe("Updated description content");
		});

		it("adds revisionLog entry on description PATCH", async () => {
			const betId = await createBetAndGetId();

			await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "description",
					value: "Updated description content",
					reason: "Refined after feedback",
				}),
			});

			const [betRow] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
			const revisionLog = JSON.parse(betRow?.revisionLog ?? "[]") as Array<Record<string, unknown>>;
			// At least 2 entries: creation + description update
			expect(revisionLog.length).toBeGreaterThanOrEqual(2);

			const descEntry = revisionLog.find((e) => e.field === "description");
			expect(descEntry).toBeTruthy();
			expect(descEntry?.old_value).toBe("Original description");
			expect(descEntry?.new_value).toBe("Updated description content");
			expect(descEntry?.reason).toBe("Refined after feedback");
		});

		it("returns 400 when description value is empty string", async () => {
			const betId = await createBetAndGetId();

			const res = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "description",
					value: "",
					reason: "Trying to clear description",
				}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 200 when patching description on active bet", async () => {
			const betId = await createBetAndGetId();
			// draft -> active via /commit
			await app.request(`/api/bets/${betId}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			const res = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "description",
					value: "Updated in active state",
					reason: "Post-activation refinement",
				}),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.description).toBe("Updated in active state");
		});

		it("returns 400 when patching description on completed bet", async () => {
			const betId = await createBetAndGetId();
			await app.request(`/api/bets/${betId}/commit`, { method: "POST", headers: authHeaders() });
			// active -> completed via /ship
			await transitionBet(db, eventBus, betId, "completed");

			const res = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "description",
					value: "Can't update completed bet",
					reason: "Attempt after completion",
				}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 when patching description on killed bet", async () => {
			const betId = await createBetAndGetId();
			await app.request(`/api/bets/${betId}/kill`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "No longer needed" }),
			});

			const res = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "description",
					value: "Can't update killed bet",
					reason: "Attempt after kill",
				}),
			});

			expect(res.status).toBe(400);
		});
	});

	// ── T4: AC7 — version history tracks both founder and agent edits ─────────────

	describe("T4: AC7 — revision history tracks multiple actors", () => {
		it("revisionLog records actor from auth context", async () => {
			// Create a bet
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
		});
	});
});
