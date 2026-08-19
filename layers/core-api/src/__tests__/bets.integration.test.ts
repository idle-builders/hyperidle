import { bets, teams } from "@hyperidle/db";
import { describe, expect, test, vi } from "../__testing__/test-fixtures.js";

// @lore U1: teams = domain entity (formerly products); teamMembers = membership group.
// POST /api/bets accepts teamId referencing teams.id (NOT teamMembers.id).
// Status map: shaped->draft, committed|in_progress->active, shipped->completed.
// pitch -> description, productId -> teamId, shippedAt -> completedAt.

const TEST_API_KEY = "test-key-bets";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Bet Endpoints (E3)", () => {
	test("AC1: returns bets grouped by status", async ({ db, app, eventBus: _eb }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Seed domain entity and membership group
		await db.insert(teams).values({
			id: "prod-1",
			name: "Test Product",
			phase: "build",
			createdAt: new Date().toISOString(),
		});

		async function createBet(
			overrides?: Record<string, unknown>,
		): Promise<Record<string, unknown>> {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: "Build feature X",
					...overrides,
				}),
			});
			return (await res.json()) as Record<string, unknown>;
		}

		await createBet();
		const bet2 = await createBet({ description: "Build feature Y" });
		await app.request(`/api/bets/${bet2.id}/commit`, {
			method: "POST",
			headers: authHeaders(),
		});

		const res = await app.request("/api/bets", { headers: authHeaders() });

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown[]>;
		expect(body.draft).toHaveLength(1);
		expect(body.active).toHaveLength(1);
		expect(body.completed).toHaveLength(0);
		expect(body.killed).toHaveLength(0);
		vi.unstubAllEnvs();
	});

	test("AC1: returns empty groups when no bets exist", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/bets", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown[]>;
		expect(body.draft).toHaveLength(0);
		expect(body.active).toHaveLength(0);
		expect(body.completed).toHaveLength(0);
		expect(body.killed).toHaveLength(0);
		vi.unstubAllEnvs();
	});

	test("AC2: returns bet with its tasks", async ({ db, app }) => {
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
				description: "Build feature X",
			}),
		});
		const bet = (await createRes.json()) as Record<string, unknown>;
		const betId = bet.id as string;

		const { tasks } = await import("@hyperidle/db");
		await db.insert(tasks).values({
			id: "task-1",
			betId,
			teamId: "prod-1",
			title: "Implement X",
			state: "proposed",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		const res = await app.request(`/api/bets/${betId}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.id).toBe(betId);
		expect(body.description).toBe("Build feature X");
		expect(Array.isArray(body.tasks)).toBe(true);
		expect((body.tasks as unknown[]).length).toBe(1);
		vi.unstubAllEnvs();
	});

	test("AC2: returns 404 for non-existent bet", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/bets/nonexistent", { headers: authHeaders() });
		expect(res.status).toBe(404);
		vi.unstubAllEnvs();
	});

	test("AC3: creates a bet with status draft", async ({ db, app }) => {
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
				description: "New bet pitch",
				hypothesis: "Users will engage more",
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.status).toBe("draft");
		expect(body.description).toBe("New bet pitch");
		expect(body.hypothesis).toBe("Users will engage more");
		expect(body.id).toBeTruthy();
		expect(body.createdAt).toBeTruthy();
		vi.unstubAllEnvs();
	});

	test("AC3: returns 400 for missing required fields", async ({ db, app }) => {
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
			body: JSON.stringify({ teamId: "prod-1" }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("AC4: updates a field on an active bet", async ({ db, app }) => {
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
				description: "Build feature X",
			}),
		});
		const bet = (await createRes.json()) as Record<string, unknown>;
		const betId = bet.id as string;

		await app.request(`/api/bets/${betId}/commit`, {
			method: "POST",
			headers: authHeaders(),
		});

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

		const rows = await db.select().from(bets);
		const betRow = rows[0];
		const revisionLog = JSON.parse(betRow!.revisionLog ?? "[]") as unknown[];
		expect(revisionLog.length).toBeGreaterThan(0);
		vi.unstubAllEnvs();
	});

	test("AC4: returns 400 for non-active bet", async ({ db, app }) => {
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
				description: "Build feature X",
			}),
		});
		const bet = (await createRes.json()) as Record<string, unknown>;

		const res = await app.request(`/api/bets/${bet.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				field: "done_condition",
				value: "New condition",
				reason: "Change",
			}),
		});
		// AU44 B3: updateBetField folded into route. Now returns 400 (not 500
		// from an uncaught exception) for a non-active bet patch.
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("AC5: transitions draft bet to active", async ({ db, app }) => {
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
				description: "Build feature X",
			}),
		});
		const bet = (await createRes.json()) as Record<string, unknown>;

		const res = await app.request(`/api/bets/${bet.id}/commit`, {
			method: "POST",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.status).toBe("active");
		vi.unstubAllEnvs();
	});

	test("AC5: emits bet_state_changed event on commit", async ({ db, app, eventBus }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		await db.insert(teams).values({
			id: "prod-1",
			name: "Test Product",
			phase: "build",
			createdAt: new Date().toISOString(),
		});

		const events: unknown[] = [];
		eventBus.on("bet_state_changed", (e: unknown) => events.push(e));

		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "prod-1",
				description: "Build feature X",
			}),
		});
		const bet = (await createRes.json()) as Record<string, unknown>;
		await app.request(`/api/bets/${bet.id}/commit`, {
			method: "POST",
			headers: authHeaders(),
		});

		expect(events.length).toBe(1);
		vi.unstubAllEnvs();
	});

	test("AC5: rejects commit when team is at capacity (409)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		await db.insert(teams).values({
			id: "prod-1",
			name: "Test Product",
			phase: "build",
			createdAt: new Date().toISOString(),
		});

		async function createBet(desc: string): Promise<Record<string, unknown>> {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: desc,
				}),
			});
			return (await res.json()) as Record<string, unknown>;
		}

		const bet1 = await createBet("Bet 1");
		const bet2 = await createBet("Bet 2");
		await app.request(`/api/bets/${bet1.id}/commit`, { method: "POST", headers: authHeaders() });
		await app.request(`/api/bets/${bet2.id}/commit`, { method: "POST", headers: authHeaders() });

		const bet3 = await createBet("Bet 3");
		const res = await app.request(`/api/bets/${bet3.id}/commit`, {
			method: "POST",
			headers: authHeaders(),
		});

		expect(res.status).toBe(409);
		const body = (await res.json()) as Record<string, string>;
		expect(body.code).toBe("CONFLICT");
		vi.unstubAllEnvs();
	});

	// POST /api/bets/:id/ship (door #30) deleted. Tests removed with the route.

	test("AC7: kills a draft bet with reason", async ({ db, app }) => {
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
				description: "Build feature X",
			}),
		});
		const bet = (await createRes.json()) as Record<string, unknown>;

		const res = await app.request(`/api/bets/${bet.id}/kill`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "No longer needed" }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.status).toBe("killed");
		vi.unstubAllEnvs();
	});

	test("AC7: returns 400 when reason is missing", async ({ db, app }) => {
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
				description: "Build feature X",
			}),
		});
		const bet = (await createRes.json()) as Record<string, unknown>;

		const res = await app.request(`/api/bets/${bet.id}/kill`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("AC7: returns 400 when reason is empty string", async ({ db, app }) => {
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
				description: "Build feature X",
			}),
		});
		const bet = (await createRes.json()) as Record<string, unknown>;

		const res = await app.request(`/api/bets/${bet.id}/kill`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "" }),
		});

		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// GET /api/bets/canvas (door #24) deleted. Tests removed with the route.

	test("AC12: first commit succeeds, second rejected 409 (no race)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		await db.insert(teams).values({
			id: "prod-1",
			name: "Test Product",
			phase: "build",
			createdAt: new Date().toISOString(),
		});
		// @lore U1: capacity is on teamMembers, not teams (domain entity)

		async function createBet(desc: string): Promise<Record<string, unknown>> {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "prod-1",
					description: desc,
				}),
			});
			return (await res.json()) as Record<string, unknown>;
		}

		const bet1 = await createBet("Bet 1");
		const bet2 = await createBet("Bet 2");

		const [res1, res2] = await Promise.all([
			app.request(`/api/bets/${bet1.id}/commit`, { method: "POST", headers: authHeaders() }),
			app.request(`/api/bets/${bet2.id}/commit`, { method: "POST", headers: authHeaders() }),
		]);

		const statuses = [res1.status, res2.status].sort();
		expect(statuses).toContain(200);
		expect(statuses).toContain(409);
		vi.unstubAllEnvs();
	});
});
