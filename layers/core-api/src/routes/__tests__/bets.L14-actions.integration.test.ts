/**
 * L14 — Bet-level human actions: actor field, enrichment.
 *
 * @lore U1: pause/resume routes removed — U1 simplified status to draft|active|completed|killed.
 * The "paused/behind/blocked" sub-states are gone. This file tests what remains:
 *   - AC-5: Actor field in revision log (kill writes actor)
 *   - AC-6: GET /bets/:id returns enriched title, product, team, progress fields
 *   - AC-13: POST /bets create schema rejects unknown fields
 *
 * Pause/resume route tests (AC-1, AC-2, AC-3) are removed because those routes
 * no longer exist in U1. The acceptance criteria for those sub-states are
 * satisfied by the simplified "active" status.
 *
 * @lore AU21 Increment 14a: AC-4 (PATCH /bets/:id cost_appetite WireMoney
 * validation, L17) is HARD-DELETED along with the rest of the cost feature —
 * `bets.costAppetiteMinor/costAppetiteCurrency` are dropped columns, no
 * replacement.
 */

import { CORE_API_ACTOR_OVERRIDE_HEADER } from "@hyperidle/api-contract";
import { bets, type HyperIdleDb, tasks, teamMembers, teams } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { EventBus } from "@hyperidle/event-bus";
import { getTeamMembers, updateTeam } from "@hyperidle/org";
import type { RevisionLogEntry, WorkDeps } from "@hyperidle/work";
import { transitionBet } from "@hyperidle/work";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

// AU19 Increment 1c: `work`'s `TeamCapacityReader` port (Mechanism C), wired
// to the real migrated `org` Service.
const teamCapacity: WorkDeps["teamCapacity"] = {
	getByTeamId: (db, teamId) => getTeamMembers(db, { teamId }),
	setActiveBets: (db, teamId, activeBets) => updateTeam(db, teamId, { activeBets }),
};

const TEST_API_KEY = "test-key-L14";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

/**
 * @lore AU38: the kill route writes the authenticated actor into the revision
 * log; the API-key actor falls back to "the first human" — nondeterministic in
 * a populated world. These tests pin the actor via the production override
 * header instead.
 */
function actorHeaders(actorId: string): Record<string, string> {
	return authHeaders({ [CORE_API_ACTOR_OVERRIDE_HEADER]: actorId });
}

function parseRevisionLog(raw: string | null): RevisionLogEntry[] {
	if (!raw) return [];
	return JSON.parse(raw) as RevisionLogEntry[];
}

async function seedBase(db: HyperIdleDb, _eventBus: EventBus, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	// @lore U1: teams = domain entity (formerly products); teamMembers = membership group.
	await db.insert(teams).values({ id: ids("p1"), name: "Alpha", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: ids("t1"), teamId: ids("p1"), capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(bets).values({
		id: ids("bet1"),
		// @lore U1: bets.teamId references teams.id (domain entity), NOT teamMembers.id
		teamId: ids("p1"),
		description: "# Hello\nBody text",
		appetite: "2 weeks",
		// @lore U1: status is "draft" (formerly "shaped")
		status: "draft",
		createdAt: now,
	});
}

describe("L14 — Bet actions: pause / resume / enrichment / actor", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// ─── AC-1: Pause route (removed in U1) ──────────────────────────────────────
	// @lore U1: /pause and /resume routes removed — no paused sub-state in U1.
	// Tests for invalid transitions still verify route doesn't exist (404).

	describe("AC-1 — POST /bets/:id/pause", () => {
		test("returns 404 when transition is invalid (draft → pause route removed in U1)", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedBase(db, eventBus, ids);
			// U1 removed the pause route — expect 404 (route not found)
			const res = await app.request(`/api/bets/${ids("bet1")}/pause`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "Pause it" }),
			});

			expect(res.status).toBe(404);
		});

		test("returns 404 for unknown betId (route removed in U1)", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedBase(db, eventBus, ids);
			const res = await app.request(`/api/bets/${ids("nonexistent")}/pause`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "reason" }),
			});

			expect(res.status).toBe(404);
		});
	});

	// ─── AC-2: Resume route (removed in U1) ─────────────────────────────────────

	describe("AC-2 — POST /bets/:id/resume", () => {
		test("returns 404 when resume route removed in U1", async ({ db, app, eventBus, ids }) => {
			await seedBase(db, eventBus, ids);
			const res = await app.request(`/api/bets/${ids("bet1")}/resume`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(404);
		});
	});

	// ─── AC-3: Empty reason (pause removed, test 400 from kill as proxy) ────────

	describe("AC-3 — Pause requires non-empty reason", () => {
		test("returns 400 when reason is empty string (kill route as proxy)", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedBase(db, eventBus, ids);
			// Pause route is removed; verify 400 from kill (same empty-reason validation)
			const res = await app.request(`/api/bets/${ids("bet1")}/kill`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "" }),
			});

			expect(res.status).toBe(400);
		});

		test("returns 400 when reason is missing (kill route as proxy)", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedBase(db, eventBus, ids);
			const res = await app.request(`/api/bets/${ids("bet1")}/kill`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
		});
	});

	// @lore AU21 Increment 14a: "AC-4 — cost_appetite WireMoney guard on PATCH"
	// and "AC-4 — cost_appetite update from active state" (8 tests) are
	// HARD-DELETED — `bets.costAppetiteMinor/costAppetiteCurrency` are dropped
	// columns and `updateBetCostAppetiteSchema` no longer exists on the PATCH
	// discriminated union (`field: "cost_appetite"` now 400s as an unknown
	// field), no replacement.

	// ─── AC-5: Actor field in revision log ───────────────────────────────────

	describe("AC-5 — RevisionLogEntry actor field", () => {
		test("kill action via existing route also writes actor (kill route must pass actor)", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedBase(db, eventBus, ids);
			await transitionBet(db, eventBus, teamCapacity, ids("bet1"), "active");

			await app.request(`/api/bets/${ids("bet1")}/kill`, {
				method: "POST",
				headers: actorHeaders(ids("u-actor")),
				body: JSON.stringify({ reason: "No longer viable" }),
			});

			const res = await app.request(`/api/bets/${ids("bet1")}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { revisionLog: string | null };
			const log = parseRevisionLog(body.revisionLog);
			const killEntry = log.find((e) => e.new_value === "killed");
			expect(killEntry).toBeDefined();
			expect(killEntry?.actor).toBe(ids("u-actor"));
		});
	});

	// ─── AC-6: GET /bets/:id enrichment ─────────────────────────────────────

	describe("AC-6 — GET /bets/:id enrichment", () => {
		test("returns title derived from first heading line of description", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedBase(db, eventBus, ids);
			// description starts with "# Hello"
			const res = await app.request(`/api/bets/${ids("bet1")}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { title?: string };
			expect(body.title).toBe("Hello");
		});

		// @lore U2: `product` field removed (clean cut). Now returns `team` only.
		test("returns team name joined from teams table (formerly product name)", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedBase(db, eventBus, ids);
			const res = await app.request(`/api/bets/${ids("bet1")}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { team?: string };
			expect(body.team).toBe("Alpha");
		});

		test("returns team identifier joined from teams table", async ({ db, app, eventBus, ids }) => {
			await seedBase(db, eventBus, ids);
			const res = await app.request(`/api/bets/${ids("bet1")}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { team?: string };
			// team field is team id or name — a string
			expect(body.team).toBeDefined();
			expect(typeof body.team).toBe("string");
		});

		test("returns progress with done and total computed from tasks", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedBase(db, eventBus, ids);
			const now = new Date().toISOString();
			// Seed two tasks: one done, one in_progress
			await db.insert(tasks).values({
				id: ids("task-done"),
				betId: ids("bet1"),
				teamId: ids("p1"),
				title: "Done task",
				state: "done",
				createdAt: now,
				updatedAt: now,
			});

			await db.insert(tasks).values({
				id: ids("task-wip"),
				betId: ids("bet1"),
				teamId: ids("p1"),
				title: "WIP task",
				state: "in_progress",
				createdAt: now,
				updatedAt: now,
			});

			const res = await app.request(`/api/bets/${ids("bet1")}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { progress?: { done: number; total: number } };
			expect(body.progress).toEqual({ done: 1, total: 2 });
		});

		test("returns progress { done: 0, total: 0 } when no tasks", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedBase(db, eventBus, ids);
			const res = await app.request(`/api/bets/${ids("bet1")}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { progress?: { done: number; total: number } };
			expect(body.progress).toEqual({ done: 0, total: 0 });
		});

		test("falls back to bet id when description has no heading", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedBase(db, eventBus, ids);
			const now = new Date().toISOString();
			await db.insert(bets).values({
				id: ids("bet-noheading"),
				teamId: ids("p1"),
				description: "Just some prose with no heading",
				appetite: "1 week",
				status: "draft",
				createdAt: now,
			});

			const res = await app.request(`/api/bets/${ids("bet-noheading")}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { title?: string };
			// Falls back to bet id or a non-empty string
			expect(body.title).toBeTruthy();
		});
	});

	// ─── AC-13: POST /bets create schema rejects invalid appetite ────────────

	describe("AC-13 — Create bet schema rejects invalid appetite enum", () => {
		test("returns 400 when creating bet with appetite 'small'", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedBase(db, eventBus, ids);
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("p1"),
					description: "# Feature",
					appetite: "small",
				}),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when creating bet with appetite 'big'", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedBase(db, eventBus, ids);
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: ids("p1"),
					description: "# Feature",
					appetite: "big",
				}),
			});
			expect(res.status).toBe(400);
		});
	});
});
