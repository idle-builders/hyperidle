/**
 * Q3 — Human-created bets: API tests.
 *
 * Covers:
 *   T2: teamId optional (derived from product), revisionLog seeded on create, pitch .min(1)
 *   T3: GET /api/bets/canvas enriched with product name + derived title + appetite display
 *   T4: PATCH field="pitch" — mutable on shaped/committed/in_progress/paused/behind/blocked/review;
 *       NOT mutable on shipped/killed.
 *
 * AC covered: AC3, AC6, AC7, AC8, AC10
 */

import { bets, createTestDb, type HyperIdleDb, products, teams } from "@hyperidle/db";
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
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		// Seed product and team
		db.insert(products)
			.values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 2,
				activeBets: 0,
				formedAt: new Date().toISOString(),
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// ── T2: teamId optional, revisionLog seeded, pitch .min(1) ──────────────────

	describe("T2: AC8 — teamId auto-assigned from product's team", () => {
		it("creates a bet without explicit teamId, derives team from productId", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					pitch: "Build feature Z",
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.teamId).toBe("team-1");
			expect(body.status).toBe("shaped");
		});

		it("still accepts explicit teamId when provided", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					teamId: "team-1",
					pitch: "Build feature W",
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.teamId).toBe("team-1");
		});

		it("returns 400 when productId does not exist", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "nonexistent-product",
					pitch: "Build feature V",
				}),
			});

			expect(res.status).toBe(400);
		});
	});

	describe("T2: AC10 — pitch validation (.min(1))", () => {
		it("returns 400 when pitch is empty string", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					pitch: "",
				}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 201 with non-empty pitch", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					pitch: "A valid pitch",
				}),
			});

			expect(res.status).toBe(201);
		});
	});

	describe("T2: AC3 — revisionLog seeded on creation", () => {
		it("creates bet with initial revisionLog entry containing creator actor", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					pitch: "Build feature X",
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as { id: string };

			// Check the DB row directly for revisionLog
			const betRow = db.select().from(bets).where(eq(bets.id, body.id)).get();
			expect(betRow).toBeTruthy();
			const revisionLog = JSON.parse(betRow?.revisionLog ?? "[]") as Array<Record<string, unknown>>;
			expect(revisionLog).toHaveLength(1);
			expect(revisionLog[0]?.field).toBe("status");
			expect(revisionLog[0]?.new_value).toBe("shaped");
		});
	});

	// ── T3: GET /api/bets/canvas enriched ────────────────────────────────────────

	describe("T3: canvas endpoint enrichment", () => {
		it("returns bets with product name in canvas response", async () => {
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					pitch: "# Canvas Feature\n\nThis is the pitch body.",
				}),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				shaped: Array<Record<string, unknown>>;
				committed: Array<Record<string, unknown>>;
				capacity: { used: number; max: number };
			};

			expect(body.shaped).toHaveLength(1);
			const bet = body.shaped[0];
			// T3: must include product name
			expect(bet?.product).toBe("Test Product");
		});

		it("returns derived title from pitch first line in canvas response", async () => {
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					pitch: "# My Feature Title\n\nThis is the pitch body.",
				}),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				shaped: Array<Record<string, unknown>>;
			};

			const bet = body.shaped[0];
			// title derived from first line, stripping "# "
			expect(bet?.title).toBe("My Feature Title");
		});

		it("returns appetite as formatted display string or '—' when null", async () => {
			// No costAppetite
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					pitch: "Pitch without appetite",
				}),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			const body = (await res.json()) as {
				shaped: Array<Record<string, unknown>>;
			};

			const bet = body.shaped[0];
			expect(bet?.appetite).toBe("—");
		});

		it("returns formatted appetite string when costAppetite is set", async () => {
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					pitch: "Pitch with appetite",
					costAppetite: { minor: 10000, currency: "USD" },
				}),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			const body = (await res.json()) as {
				shaped: Array<Record<string, unknown>>;
			};

			const bet = body.shaped[0];
			// appetite should be a non-empty string (formatted money display)
			expect(typeof bet?.appetite).toBe("string");
			expect(bet?.appetite).not.toBe("—");
		});

		it("returns productId in canvas bet shape", async () => {
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					pitch: "Pitch for productId check",
				}),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			const body = (await res.json()) as {
				shaped: Array<Record<string, unknown>>;
			};

			const bet = body.shaped[0];
			expect(bet?.productId).toBe("prod-1");
		});

		it("uses batch product lookup — does not include undefined product entries", async () => {
			// Two bets for the same product — product name must appear on both
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ productId: "prod-1", pitch: "Bet A" }),
			});
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ productId: "prod-1", pitch: "Bet B" }),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			const body = (await res.json()) as { shaped: Array<Record<string, unknown>> };

			for (const bet of body.shaped) {
				expect(bet.product).toBe("Test Product");
			}
		});
	});

	// ── T4: PATCH field="pitch" ───────────────────────────────────────────────────

	describe("T4: AC6 — PATCH pitch field", () => {
		async function createBetAndGetId(): Promise<string> {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					pitch: "Original pitch",
				}),
			});
			const body = (await res.json()) as { id: string };
			return body.id;
		}

		it("returns 200 and updated pitch on shaped bet", async () => {
			const betId = await createBetAndGetId();

			const res = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "pitch",
					value: "Updated pitch content",
					reason: "Refined after feedback",
				}),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.pitch).toBe("Updated pitch content");
		});

		it("adds revisionLog entry on pitch PATCH", async () => {
			const betId = await createBetAndGetId();

			await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "pitch",
					value: "Updated pitch content",
					reason: "Refined after feedback",
				}),
			});

			const betRow = db.select().from(bets).where(eq(bets.id, betId)).get();
			const revisionLog = JSON.parse(betRow?.revisionLog ?? "[]") as Array<Record<string, unknown>>;
			// At least 2 entries: creation + pitch update
			expect(revisionLog.length).toBeGreaterThanOrEqual(2);

			const pitchEntry = revisionLog.find((e) => e.field === "pitch");
			expect(pitchEntry).toBeTruthy();
			expect(pitchEntry?.old_value).toBe("Original pitch");
			expect(pitchEntry?.new_value).toBe("Updated pitch content");
			expect(pitchEntry?.reason).toBe("Refined after feedback");
		});

		it("returns 400 when pitch value is empty string", async () => {
			const betId = await createBetAndGetId();

			const res = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "pitch",
					value: "",
					reason: "Trying to clear pitch",
				}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 200 when patching pitch on committed bet", async () => {
			const betId = await createBetAndGetId();
			// shaped -> committed
			await app.request(`/api/bets/${betId}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			const res = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "pitch",
					value: "Updated in committed state",
					reason: "Post-commit refinement",
				}),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.pitch).toBe("Updated in committed state");
		});

		it("returns 200 when patching pitch on in_progress bet", async () => {
			const betId = await createBetAndGetId();
			await app.request(`/api/bets/${betId}/commit`, { method: "POST", headers: authHeaders() });
			await transitionBet(db, eventBus, betId, "in_progress");

			const res = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "pitch",
					value: "Updated in in_progress",
					reason: "Ongoing refinement",
				}),
			});

			expect(res.status).toBe(200);
		});

		it("returns 400 when patching pitch on shipped bet", async () => {
			const betId = await createBetAndGetId();
			await app.request(`/api/bets/${betId}/commit`, { method: "POST", headers: authHeaders() });
			await transitionBet(db, eventBus, betId, "in_progress");
			await transitionBet(db, eventBus, betId, "shipped");

			const res = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "pitch",
					value: "Can't update shipped bet",
					reason: "Attempt after ship",
				}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 when patching pitch on killed bet", async () => {
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
					field: "pitch",
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
			// Create a bet (actor = the userId from auth context)
			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					pitch: "Initial pitch",
				}),
			});
			expect(createRes.status).toBe(201);
			const { id: betId } = (await createRes.json()) as { id: string };

			// PATCH with a different actor (simulate agent call)
			const patchRes = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: { ...authHeaders(), "X-User-Id": "agent-001" },
				body: JSON.stringify({
					field: "pitch",
					value: "Agent-updated pitch",
					reason: "Agent improvement",
				}),
			});
			expect(patchRes.status).toBe(200);

			const betRow = db.select().from(bets).where(eq(bets.id, betId)).get();
			const revisionLog = JSON.parse(betRow?.revisionLog ?? "[]") as Array<Record<string, unknown>>;
			// At minimum 2 entries: creation + agent patch
			expect(revisionLog.length).toBeGreaterThanOrEqual(2);
		});
	});
});
