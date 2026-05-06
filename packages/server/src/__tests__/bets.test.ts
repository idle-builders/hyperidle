import { bets, createTestDb, type HyperIdleDb, products, teams } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-bets";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Bet Endpoints (E3)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		// Seed a product and team
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

	// Helper to create a bet via API
	async function createBet(overrides?: Record<string, unknown>): Promise<Record<string, unknown>> {
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				productId: "prod-1",
				teamId: "team-1",
				pitch: "Build feature X",
				// L17: costAppetite replaces the old `appetite` string
				costAppetite: { minor: 10000, currency: "USD" },
				...overrides,
			}),
		});
		return (await res.json()) as Record<string, unknown>;
	}

	// AC1: GET /api/bets — list grouped by status
	describe("AC1: GET /api/bets — list grouped by status", () => {
		it("returns bets grouped by status", async () => {
			// Arrange: create bets with different statuses
			await createBet();
			const bet2 = await createBet({ pitch: "Build feature Y" });
			// Commit bet2 to make it committed
			await app.request(`/api/bets/${bet2.id}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			// Act
			const res = await app.request("/api/bets", { headers: authHeaders() });

			// Assert
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown[]>;
			expect(body.shaped).toHaveLength(1);
			expect(body.committed).toHaveLength(1);
			expect(body.in_progress).toHaveLength(0);
			expect(body.shipped).toHaveLength(0);
		});

		it("returns empty groups when no bets exist", async () => {
			const res = await app.request("/api/bets", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown[]>;
			expect(body.shaped).toHaveLength(0);
			expect(body.committed).toHaveLength(0);
			expect(body.in_progress).toHaveLength(0);
			expect(body.shipped).toHaveLength(0);
		});
	});

	// AC2: GET /api/bets/:id — bet detail with tasks
	describe("AC2: GET /api/bets/:id — bet detail with tasks", () => {
		it("returns bet with its tasks", async () => {
			const bet = await createBet();
			const betId = bet.id as string;

			// Seed a task for this bet
			const { tasks } = await import("@hyperidle/db");
			db.insert(tasks)
				.values({
					id: "task-1",
					betId,
					productId: "prod-1",
					teamId: "team-1",
					title: "Implement X",
					state: "proposed",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				})
				.run();

			const res = await app.request(`/api/bets/${betId}`, { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.id).toBe(betId);
			expect(body.pitch).toBe("Build feature X");
			expect(Array.isArray(body.tasks)).toBe(true);
			expect((body.tasks as unknown[]).length).toBe(1);
		});

		it("returns 404 for non-existent bet", async () => {
			const res = await app.request("/api/bets/nonexistent", { headers: authHeaders() });
			expect(res.status).toBe(404);
		});
	});

	// AC3: POST /api/bets — create shaped bet
	describe("AC3: POST /api/bets — create shaped bet", () => {
		it("creates a bet with status shaped", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "prod-1",
					teamId: "team-1",
					pitch: "New bet pitch",
					// L17: costAppetite replaces old `appetite` duration string
					costAppetite: { minor: 20000, currency: "USD" },
					hypothesis: "Users will engage more",
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.status).toBe("shaped");
			expect(body.pitch).toBe("New bet pitch");
			expect(body.hypothesis).toBe("Users will engage more");
			expect(body.id).toBeTruthy();
			expect(body.createdAt).toBeTruthy();
		});

		it("returns 400 for missing required fields", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ productId: "prod-1" }),
			});
			expect(res.status).toBe(400);
		});
	});

	// AC4: PATCH /api/bets/:id — update fields (triggers revision logging)
	describe("AC4: PATCH /api/bets/:id — update fields with revision logging", () => {
		it("updates a field on an in_progress bet", async () => {
			// Create, commit, then transition to in_progress manually
			const bet = await createBet();
			const betId = bet.id as string;

			// shaped -> committed
			await app.request(`/api/bets/${betId}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			// committed -> in_progress (directly in DB since we don't have an endpoint for this)
			const { transitionBet } = await import("../services/bet-state-machine.js");
			await transitionBet(db, eventBus, betId, "in_progress");

			// Now update
			const res = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "done_condition",
					value: "All tests pass",
					reason: "Refined requirements",
				}),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.doneCondition).toBe("All tests pass");

			// Check revision log
			const betRow = db.select().from(bets).all()[0];
			const revisionLog = JSON.parse(betRow.revisionLog ?? "[]") as unknown[];
			expect(revisionLog.length).toBeGreaterThan(0);
		});

		it("returns 500 for non-in_progress bet", async () => {
			const bet = await createBet();
			const res = await app.request(`/api/bets/${bet.id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					field: "done_condition",
					value: "New condition",
					reason: "Change",
				}),
			});
			// updateBetField throws for non-in_progress which maps to 500
			expect(res.status).toBe(500);
		});
	});

	// AC5: POST /api/bets/:id/commit — shaped→committed (capacity enforced)
	describe("AC5: POST /api/bets/:id/commit — capacity enforced", () => {
		it("transitions shaped bet to committed", async () => {
			const bet = await createBet();
			const res = await app.request(`/api/bets/${bet.id}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.status).toBe("committed");
		});

		it("emits bet_state_changed event on commit", async () => {
			const events: unknown[] = [];
			eventBus.on("bet_state_changed", (e) => events.push(e));

			const bet = await createBet();
			await app.request(`/api/bets/${bet.id}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			expect(events.length).toBe(1);
		});

		it("rejects commit when team is at capacity (409)", async () => {
			// Fill capacity: capacity=2, create and commit 2 bets
			const bet1 = await createBet({ pitch: "Bet 1" });
			const bet2 = await createBet({ pitch: "Bet 2" });
			await app.request(`/api/bets/${bet1.id}/commit`, { method: "POST", headers: authHeaders() });
			await app.request(`/api/bets/${bet2.id}/commit`, { method: "POST", headers: authHeaders() });

			// Third bet should be rejected
			const bet3 = await createBet({ pitch: "Bet 3" });
			const res = await app.request(`/api/bets/${bet3.id}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as Record<string, string>;
			expect(body.code).toBe("CONFLICT");
		});
	});

	// AC6: POST /api/bets/:id/ship — in_progress→shipped
	describe("AC6: POST /api/bets/:id/ship", () => {
		it("transitions in_progress bet to shipped", async () => {
			const bet = await createBet();
			const betId = bet.id as string;

			// shaped -> committed -> in_progress
			await app.request(`/api/bets/${betId}/commit`, { method: "POST", headers: authHeaders() });
			const { transitionBet } = await import("../services/bet-state-machine.js");
			await transitionBet(db, eventBus, betId, "in_progress");

			const res = await app.request(`/api/bets/${betId}/ship`, {
				method: "POST",
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.status).toBe("shipped");
			expect(body.shippedAt).toBeTruthy();
		});

		it("rejects ship from shaped (invalid transition 409)", async () => {
			const bet = await createBet();
			const res = await app.request(`/api/bets/${bet.id}/ship`, {
				method: "POST",
				headers: authHeaders(),
			});

			expect(res.status).toBe(409);
		});
	});

	// AC7: POST /api/bets/:id/kill — kill with reason (required)
	describe("AC7: POST /api/bets/:id/kill", () => {
		it("kills a shaped bet with reason", async () => {
			const bet = await createBet();
			const res = await app.request(`/api/bets/${bet.id}/kill`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "No longer needed" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.status).toBe("killed");
		});

		it("returns 400 when reason is missing", async () => {
			const bet = await createBet();
			const res = await app.request(`/api/bets/${bet.id}/kill`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 when reason is empty string", async () => {
			const bet = await createBet();
			const res = await app.request(`/api/bets/${bet.id}/kill`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "" }),
			});

			expect(res.status).toBe(400);
		});
	});

	// AC11: GET /api/bets/canvas — canvas data with capacity info
	describe("AC11: GET /api/bets/canvas — canvas region data", () => {
		it("returns shaped, committed, and capacity info", async () => {
			await createBet({ pitch: "Shaped bet" });
			const bet2 = await createBet({ pitch: "Committed bet" });
			await app.request(`/api/bets/${bet2.id}/commit`, { method: "POST", headers: authHeaders() });

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				shaped: unknown[];
				committed: unknown[];
				capacity: { used: number; max: number };
			};

			expect(body.shaped).toHaveLength(1);
			expect(body.committed).toHaveLength(1);
			expect(body.capacity.max).toBe(2);
			expect(body.capacity.used).toBe(1);
		});

		it("returns zero capacity when no teams exist", async () => {
			// Use a fresh db with only products (no teams)
			const freshDb = createTestDb();
			const freshApp = createTestApp({ db: freshDb, eventBus });
			freshDb
				.insert(products)
				.values({ id: "prod-1", name: "Test", phase: "build", createdAt: new Date().toISOString() })
				.run();

			const res = await freshApp.request("/api/bets/canvas", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { capacity: { used: number; max: number } };
			expect(body.capacity.used).toBe(0);
			expect(body.capacity.max).toBe(0);
		});
	});

	// AC12: Concurrent commit at capacity — first succeeds, second rejected 409
	describe("AC12: Concurrent commit at capacity", () => {
		it("first commit succeeds, second rejected 409 (no race)", async () => {
			// eslint-disable-next-line drizzle/enforce-update-with-where -- test setup: single team in test DB
			db.update(teams).set({ capacity: 1 }).run();

			const bet1 = await createBet({ pitch: "Bet 1" });
			const bet2 = await createBet({ pitch: "Bet 2" });

			// Commit both concurrently
			const [res1, res2] = await Promise.all([
				app.request(`/api/bets/${bet1.id}/commit`, { method: "POST", headers: authHeaders() }),
				app.request(`/api/bets/${bet2.id}/commit`, { method: "POST", headers: authHeaders() }),
			]);

			// One should succeed (200), one should fail (409)
			const statuses = [res1.status, res2.status].sort();
			expect(statuses).toContain(200);
			expect(statuses).toContain(409);
		});
	});
});
