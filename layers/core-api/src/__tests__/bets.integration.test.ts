import { bets, teamMembers, teams } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { createTestDb } from "@hyperidle/db/testing";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../__testing__/test-fixtures.js";
import { createTestApp } from "../__testing__/test-utils.js";

// @lore U1: teams = domain entity (formerly products); teamMembers = membership group.
// POST /api/bets accepts teamId referencing teams.id (NOT teamMembers.id).
// Status map: shaped->draft, committed|in_progress->active, shipped->completed.
// pitch -> description, productId -> teamId, shippedAt -> completedAt.

const TEST_API_KEY = "test-key-bets";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedTeamAndMembers(
	db: import("@hyperidle/db").HyperIdleDb,
	ids: ScopedIds,
): Promise<{ teamId: string; teamMembersId: string }> {
	const teamId = ids("t1");
	const teamMembersId = ids("tm1");
	await db.insert(teams).values({
		id: teamId,
		name: "Test Product",
		phase: "build",
		createdAt: new Date().toISOString(),
	});
	await db.insert(teamMembers).values({
		id: teamMembersId,
		teamId,
		capacity: 2,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	});
	return { teamId, teamMembersId };
}

describe("Bet Endpoints (E3)", () => {
	test("AC1: returns bets grouped by status", async ({ db, app, eventBus: _eb, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Seed domain entity and membership group
		const { teamId } = await seedTeamAndMembers(db, ids);

		async function createBet(
			overrides?: Record<string, unknown>,
		): Promise<Record<string, unknown>> {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId,
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

	test("AC1: returns empty groups for own team when no bets exist", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// Arrange own team (no bets for it)
		const { teamId } = await seedTeamAndMembers(db, ids);
		const res = await app.request("/api/bets", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			draft: unknown[];
			active: unknown[];
			completed: unknown[];
			killed: unknown[];
		};
		// Scoped: only our team's bets count
		const own = (group: unknown[]) =>
			(group as Array<Record<string, unknown>>).filter((b) => b.teamId === teamId);
		expect(own(body.draft)).toHaveLength(0);
		expect(own(body.active)).toHaveLength(0);
		expect(own(body.completed)).toHaveLength(0);
		expect(own(body.killed)).toHaveLength(0);
		vi.unstubAllEnvs();
	});

	test("AC2: returns bet with its tasks", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId,
				description: "Build feature X",
			}),
		});
		const bet = (await createRes.json()) as Record<string, unknown>;
		const betId = bet.id as string;

		const { tasks } = await import("@hyperidle/db");
		await db.insert(tasks).values({
			id: ids("task1"),
			betId,
			teamId,
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

	test("AC3: creates a bet with status draft", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId,
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

	test("AC3: returns 400 for missing required fields", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ teamId }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("AC4: updates a field on an active bet", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId,
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

		const rows = await db.select().from(bets).where(eq(bets.teamId, teamId));
		const betRow = rows[0];
		const revisionLog = JSON.parse(betRow!.revisionLog ?? "[]") as unknown[];
		expect(revisionLog.length).toBeGreaterThan(0);
		vi.unstubAllEnvs();
	});

	test("AC4: returns 500 for non-active bet", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId,
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
		expect(res.status).toBe(500);
		vi.unstubAllEnvs();
	});

	test("AC5: transitions draft bet to active", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId,
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

	test("AC5: emits bet_state_changed event on commit", async ({ db, app, eventBus, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		const events: unknown[] = [];
		eventBus.on("bet_state_changed", (e: unknown) => events.push(e));

		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId,
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

	test("AC5: rejects commit when team is at capacity (409)", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		async function createBet(desc: string): Promise<Record<string, unknown>> {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId,
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

	test("AC6: transitions active bet to completed", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId,
				description: "Build feature X",
			}),
		});
		const bet = (await createRes.json()) as Record<string, unknown>;
		const betId = bet.id as string;

		await app.request(`/api/bets/${betId}/commit`, { method: "POST", headers: authHeaders() });

		const res = await app.request(`/api/bets/${betId}/ship`, {
			method: "POST",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.status).toBe("completed");
		expect(body.completedAt).toBeTruthy();
		vi.unstubAllEnvs();
	});

	// @lore U2: Invalid bet transitions return 400 (not 409). 409 is reserved for
	// capacity conflicts (ApiError CONFLICT). InvalidTransitionError -> 400 VALIDATION_ERROR.
	test("AC6: rejects ship from draft (invalid transition 400)", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId,
				description: "Build feature X",
			}),
		});
		const bet = (await createRes.json()) as Record<string, unknown>;

		const res = await app.request(`/api/bets/${bet.id}/ship`, {
			method: "POST",
			headers: authHeaders(),
		});

		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("AC7: kills a draft bet with reason", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId,
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

	test("AC7: returns 400 when reason is missing", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId,
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

	test("AC7: returns 400 when reason is empty string", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId,
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

	test("AC11: returns draft, active, and capacity info", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const { teamId } = await seedTeamAndMembers(db, ids);

		async function createBet(
			overrides?: Record<string, unknown>,
		): Promise<Record<string, unknown>> {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId,
					description: "Build feature X",
					...overrides,
				}),
			});
			return (await res.json()) as Record<string, unknown>;
		}

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
		vi.unstubAllEnvs();
	});

	test("AC11: returns zero capacity when no teamMembers exist", async ({ eventBus }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Use a fresh db with only teams/products (no teamMembers)
		const freshHandle = await createTestDb();
		const freshApp = await createTestApp({ db: freshHandle.db, eventBus });
		await freshHandle.db.insert(teams).values({
			id: "prod-1",
			name: "Test",
			phase: "build",
			createdAt: new Date().toISOString(),
		});

		const res = await freshApp.request("/api/bets/canvas", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { capacity: { used: number; max: number } };
		expect(body.capacity.used).toBe(0);
		expect(body.capacity.max).toBe(0);
		await freshHandle.close();
		vi.unstubAllEnvs();
	});

	test("AC12: first commit succeeds, second rejected 409 (no race)", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const teamId = ids("t1");
		await db.insert(teams).values({
			id: teamId,
			name: "Test Product",
			phase: "build",
			createdAt: new Date().toISOString(),
		});
		// @lore U1: capacity is on teamMembers, not teams (domain entity)
		await db.insert(teamMembers).values({
			id: ids("tm1"),
			teamId,
			capacity: 1,
			activeBets: 0,
			formedAt: new Date().toISOString(),
		});

		async function createBet(desc: string): Promise<Record<string, unknown>> {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId,
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
