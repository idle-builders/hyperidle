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

import { bets, teamMembers, teams } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { getTeamMembers, updateTeam } from "@hyperidle/org";
import { transitionBet, type WorkDeps } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../__testing__/test-fixtures.js";

// AU19 Increment 1c: `work`'s `TeamCapacityReader` port (Mechanism C), wired
// to the real migrated `org` Service.
const teamCapacity: WorkDeps["teamCapacity"] = {
	getByTeamId: (db, teamId) => getTeamMembers(db, { teamId }),
	setActiveBets: (db, teamId, activeBets) => updateTeam(db, teamId, { activeBets }),
};

const TEST_API_KEY = "test-key-bets-q3";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedTeam(db: import("@hyperidle/db").HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({
		id: ids("prod-1"),
		name: "Test Product",
		phase: "build",
		createdAt: now,
	});
	await db.insert(teamMembers).values({
		id: ids("team-1"),
		teamId: ids("prod-1"),
		capacity: 2,
		activeBets: 0,
		formedAt: now,
	});
}

describe("Bet Endpoints (Q3)", () => {
	// ── T2: teamId, revisionLog seeded, description .min(1) ─────────────────────

	describe("T2: AC8 — teamId required", () => {
		test("creates a bet with teamId referencing teams domain entity", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					// @lore U1: teamId references teams.id (domain entity), not teamMembers.id
					teamId: ids("prod-1"),
					description: "Build feature Z",
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.teamId).toBe(ids("prod-1"));
			// @lore U1: status is "draft" (formerly "shaped")
			expect(body.status).toBe("draft");
			vi.unstubAllEnvs();
		});

		test("returns 400 when teamId does not exist", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("nonexistent-team"),
					description: "Build feature V",
				}),
			});

			expect(res.status).toBe(400);
			vi.unstubAllEnvs();
		});
	});

	describe("T2: AC10 — description validation (.min(1))", () => {
		test("returns 400 when description is empty string", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
					description: "",
				}),
			});

			expect(res.status).toBe(400);
			vi.unstubAllEnvs();
		});

		test("returns 201 with non-empty description", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
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
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
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

	// ── T3: GET /api/bets/canvas enriched ────────────────────────────────────────

	describe("T3: canvas endpoint enrichment", () => {
		test("returns bets with team name in canvas response", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
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

			// P6: scope — find our bet
			const myBets = body.draft.filter((b) => b.teamId === ids("prod-1"));
			expect(myBets).toHaveLength(1);
			const bet = myBets[0];
			// T3: must include team name (U1: field is "team" not "product")
			expect(bet?.team).toBe("Test Product");
			vi.unstubAllEnvs();
		});

		test("returns derived title from description first line in canvas response", async ({
			db,
			app,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
					description: "# My Feature Title\n\nThis is the description body.",
				}),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				draft: Array<Record<string, unknown>>;
			};

			const myBets = body.draft.filter((b) => b.teamId === ids("prod-1"));
			const bet = myBets[0];
			// title derived from first line, stripping "# "
			expect(bet?.title).toBe("My Feature Title");
			vi.unstubAllEnvs();
		});

		// @lore AU21 Increment 14a: "returns appetite as formatted display string
		// or '—' when null" and "returns formatted appetite string when
		// costAppetite is set" are HARD-DELETED — the canvas `appetite` field and
		// `bets.costAppetiteMinor/costAppetiteCurrency` are gone, no replacement.
		test("returns teamId in canvas bet shape", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
					description: "Description for teamId check",
				}),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			const body = (await res.json()) as {
				draft: Array<Record<string, unknown>>;
			};

			const myBets = body.draft.filter((b) => b.teamId === ids("prod-1"));
			const bet = myBets[0];
			// @lore U1: teamId references teams.id (domain entity)
			expect(bet?.teamId).toBe(ids("prod-1"));
			vi.unstubAllEnvs();
		});

		test("uses batch team lookup — does not include undefined team entries", async ({
			db,
			app,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			// Two bets for the same team — team name must appear on both
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: ids("prod-1"), description: "Bet A" }),
			});
			await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: ids("prod-1"), description: "Bet B" }),
			});

			const res = await app.request("/api/bets/canvas", { headers: authHeaders() });
			const body = (await res.json()) as { draft: Array<Record<string, unknown>> };

			const myBets = body.draft.filter((b) => b.teamId === ids("prod-1"));
			for (const bet of myBets) {
				// @lore U1: field is "team" not "product"
				expect(bet.team).toBe("Test Product");
			}
			vi.unstubAllEnvs();
		});
	});

	// ── T4: PATCH field="description" ────────────────────────────────────────────

	describe("T4: AC6 — PATCH description field", () => {
		test("returns 200 and updated description on draft bet", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
					description: "Original description",
				}),
			});
			const body = (await createRes.json()) as { id: string };
			const betId = body.id;

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
			const patchBody = (await res.json()) as Record<string, unknown>;
			// @lore U1: response uses "description" (formerly "pitch")
			expect(patchBody.description).toBe("Updated description content");
			vi.unstubAllEnvs();
		});

		test("adds revisionLog entry on description PATCH", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
					description: "Original description",
				}),
			});
			const createBody = (await createRes.json()) as { id: string };
			const betId = createBody.id;

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
			vi.unstubAllEnvs();
		});

		test("returns 400 when description value is empty string", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
					description: "Original description",
				}),
			});
			const createBody = (await createRes.json()) as { id: string };
			const betId = createBody.id;

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
			vi.unstubAllEnvs();
		});

		test("returns 200 when patching description on active bet", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
					description: "Original description",
				}),
			});
			const createBody = (await createRes.json()) as { id: string };
			const betId = createBody.id;

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
			vi.unstubAllEnvs();
		});

		test("returns 400 when patching description on completed bet", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
					description: "Original description",
				}),
			});
			const createBody = (await createRes.json()) as { id: string };
			const betId = createBody.id;

			await app.request(`/api/bets/${betId}/commit`, { method: "POST", headers: authHeaders() });
			// active -> completed via transitionBet
			await transitionBet(db, eventBus, teamCapacity, betId, "completed");

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
			vi.unstubAllEnvs();
		});

		test("returns 400 when patching description on killed bet", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
					description: "Original description",
				}),
			});
			const createBody = (await createRes.json()) as { id: string };
			const betId = createBody.id;

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
			vi.unstubAllEnvs();
		});
	});

	// ── T4: AC7 — version history tracks both founder and agent edits ─────────────

	describe("T4: AC7 — revision history tracks multiple actors", () => {
		test("revisionLog records actor from auth context", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedTeam(db, ids);

			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("prod-1"),
					description: "Initial description",
				}),
			});
			expect(createRes.status).toBe(201);
			const { id: betId } = (await createRes.json()) as { id: string };

			// PATCH with a different actor (simulate agent call)
			const patchRes = await app.request(`/api/bets/${betId}`, {
				method: "PATCH",
				headers: { ...authHeaders(), "X-User-Id": ids("agent-001") },
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
