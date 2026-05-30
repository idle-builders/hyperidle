import { bets, createTestDb, type HyperIdleDb, teamMembers, teams } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

// @lore U1: teams = domain entity (formerly products); teamMembers = membership group.
// POST /api/bets accepts teamId referencing teams.id (NOT teamMembers.id).
// Status map: shaped->draft, committed|in_progress->active, shipped->completed.
// pitch -> description, productId -> teamId, shippedAt -> completedAt.

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

		// Seed a product (domain entity) and teamMembers (membership group)
		db.insert(teams)
			.values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(teamMembers)
			.values({
				id: "team-1",
				teamId: "prod-1",
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
	// @lore U1: POST /api/bets uses teamId (references teams.id = "prod-1"), not teamMembers.id.
	async function createBet(overrides?: Record<string, unknown>): Promise<Record<string, unknown>> {
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "prod-1",
				description: "Build feature X",
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
			const bet2 = await createBet({ description: "Build feature Y" });
			// Commit bet2 to make it active (draft → active)
			await app.request(`/api/bets/${bet2.id}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			// Act
			const res = await app.request("/api/bets", { headers: authHeaders() });

			// Assert
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown[]>;
			// @lore U1: status groups are now draft/active/completed/killed
			expect(body.draft).toHaveLength(1);
			expect(body.active).toHaveLength(1);
			expect(body.completed).toHaveLength(0);
			expect(body.killed).toHaveLength(0);
		});

		it("returns empty groups when no bets exist", async () => {
			const res = await app.request("/api/bets", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown[]>;
			expect(body.draft).toHaveLength(0);
			expect(body.active).toHaveLength(0);
			expect(body.completed).toHaveLength(0);
			expect(body.killed).toHaveLength(0);
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
					teamId: "prod-1",
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
			// @lore U1: `description` (formerly `pitch`)
			expect(body.description).toBe("Build feature X");
			expect(Array.isArray(body.tasks)).toBe(true);
			expect((body.tasks as unknown[]).length).toBe(1);
		});

		it("returns 404 for non-existent bet", async () => {
			const res = await app.request("/api/bets/nonexistent", { headers: authHeaders() });
			expect(res.status).toBe(404);
		});
	});

	// AC3: POST /api/bets — create draft bet (formerly "shaped")
	describe("AC3: POST /api/bets — create shaped bet", () => {
		it("creates a bet with status draft", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					// @lore U1: teamId references teams.id (domain entity), not teamMembers.id
					teamId: "prod-1",
					description: "New bet pitch",
					// L17: costAppetite replaces old `appetite` duration string
					costAppetite: { minor: 20000, currency: "USD" },
					hypothesis: "Users will engage more",
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			// @lore U1: status is "draft" (formerly "shaped")
			expect(body.status).toBe("draft");
			// @lore U1: field is "description" (formerly "pitch")
			expect(body.description).toBe("New bet pitch");
			expect(body.hypothesis).toBe("Users will engage more");
			expect(body.id).toBeTruthy();
			expect(body.createdAt).toBeTruthy();
		});

		it("returns 400 for missing required fields", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: "prod-1" }),
			});
			expect(res.status).toBe(400);
		});
	});

	// AC4: PATCH /api/bets/:id — update fields (triggers revision logging)
	describe("AC4: PATCH /api/bets/:id — update fields with revision logging", () => {
		it("updates a field on an active bet", async () => {
			// Create, commit to active
			const bet = await createBet();
			const betId = bet.id as string;

			// draft -> active via /commit
			await app.request(`/api/bets/${betId}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			// Now update done_condition
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

		it("returns 500 for non-active bet", async () => {
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
			// updateBetField throws for non-active which maps to 500
			expect(res.status).toBe(500);
		});
	});

	// AC5: POST /api/bets/:id/commit — draft→active (formerly shaped→committed)
	describe("AC5: POST /api/bets/:id/commit — capacity enforced", () => {
		it("transitions draft bet to active", async () => {
			const bet = await createBet();
			const res = await app.request(`/api/bets/${bet.id}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			// @lore U1: status is "active" (formerly "committed")
			expect(body.status).toBe("active");
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
			const bet1 = await createBet({ description: "Bet 1" });
			const bet2 = await createBet({ description: "Bet 2" });
			await app.request(`/api/bets/${bet1.id}/commit`, { method: "POST", headers: authHeaders() });
			await app.request(`/api/bets/${bet2.id}/commit`, { method: "POST", headers: authHeaders() });

			// Third bet should be rejected
			const bet3 = await createBet({ description: "Bet 3" });
			const res = await app.request(`/api/bets/${bet3.id}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as Record<string, string>;
			expect(body.code).toBe("CONFLICT");
		});
	});

	// AC6: POST /api/bets/:id/ship — active→completed (formerly in_progress→shipped)
	describe("AC6: POST /api/bets/:id/ship", () => {
		it("transitions active bet to completed", async () => {
			const bet = await createBet();
			const betId = bet.id as string;

			// draft -> active via /commit
			await app.request(`/api/bets/${betId}/commit`, { method: "POST", headers: authHeaders() });

			const res = await app.request(`/api/bets/${betId}/ship`, {
				method: "POST",
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			// @lore U1: "completed" (formerly "shipped"), "completedAt" (formerly "shippedAt")
			expect(body.status).toBe("completed");
			expect(body.completedAt).toBeTruthy();
		});

		it("rejects ship from draft (invalid transition 409)", async () => {
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
		it("kills a draft bet with reason", async () => {
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
		it("returns draft, active, and capacity info", async () => {
			await createBet({ description: "Draft bet" });
			const bet2 = await createBet({ description: "Active bet" });
			await app.request(`/api/bets/${bet2.id}/commit`, { method: "POST", headers: authHeaders() });

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				draft: unknown[];
				active: unknown[];
				capacity: { used: number; max: number };
			};

			expect(body.draft).toHaveLength(1);
			expect(body.active).toHaveLength(1);
			expect(body.capacity.max).toBe(2);
			expect(body.capacity.used).toBe(1);
		});

		it("returns zero capacity when no teamMembers exist", async () => {
			// Use a fresh db with only teams/products (no teamMembers)
			const freshDb = createTestDb();
			const freshApp = createTestApp({ db: freshDb, eventBus });
			freshDb
				.insert(teams)
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
			// @lore U1: capacity is on teamMembers, not teams (domain entity)
			// eslint-disable-next-line drizzle/enforce-update-with-where -- test setup: single teamMembers in test DB
			db.update(teamMembers).set({ capacity: 1 }).run();

			const bet1 = await createBet({ description: "Bet 1" });
			const bet2 = await createBet({ description: "Bet 2" });

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
