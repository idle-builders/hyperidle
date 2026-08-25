/**
 * AF17 — AC3: Team routines provisioned at team creation.
 *
 * When a team is created (via POST /api/teams or create_team skill tool):
 *   - 4 built-in routine rows are inserted, each owned by a member of that
 *     team's roster (users.id) — BA1 D5 dropped `routines.team_id`; scope
 *     comes from the owner agent now.
 *   - A second team's provisioning does NOT re-create the three globally-
 *     scoped builtins (BA1 D7) — only `post-bet-retro` is per-team.
 *   - Owner fallback: if a team has no product_manager, routines still get a
 *     valid owner.
 *
 * @lore AU21 §9 Increment 5 (AC #7): practice-meeting deleted, no
 * replacement — the builtin count per team drops from 5 to 4
 * (post-bet-retro, portfolio-retro, knowledge-decay, knowledge-promotion).
 *
 * @lore BA1 D7: `portfolio-retro`, `knowledge-decay`, `knowledge-promotion`
 * are seeded ONCE, globally (bare `builtin:<kind>` id, no `:<teamId>`
 * suffix) — the second and every later team's `provisionTeamRoutines` call
 * is a no-op for those three (`onConflictDoNothing`). Only `post-bet-retro`
 * stays per-team (`builtin:post-bet-retro:<teamId>`), because
 * `registerBuiltinRoutineHandlers` reacts to `bet_state_changed` per team.
 * This retires AF17's original "two teams each get 4 built-in routines (8
 * total)" assertion — that premise is exactly the per-team duplication D7
 * fixes.
 */

import { routines, teams, users } from "@hyperidle/db";
import { inArray } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { seedTeamRoutines } from "./dispatch-test-helpers.js";

const TEST_API_KEY = "test-key-AF17";
const NOW = new Date().toISOString();

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

// @lore AU18: system prompt templates now read directly from docs/system-prompts/
// via the shared resolver (system-prompt-templates.ts) — no seeding needed;
// team creation resolves the real docs content.

// ─────────────────────────────────────────────────────────────────────────────
// AC3a: POST /api/teams provisions 4 built-in routines
// ─────────────────────────────────────────────────────────────────────────────

describe("AF17 AC3: POST /api/teams provisions built-in routines", () => {
	test("creates exactly 4 builtin routines owned by the new team's roster", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Acme Team",
				functions: ["development", "product"],
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const teamId = body.team.id;

		const rosterAgents = await db
			.select({ id: users.id })
			.from(users)
			.where(inArray(users.teamId, [teamId]));
		const rosterIds = rosterAgents.map((a) => a.id);

		// Must have exactly 4 builtin routines owned by this team's roster.
		const teamRoutines = await db
			.select()
			.from(routines)
			.where(inArray(routines.ownerAgentId, rosterIds));

		const builtinRows = teamRoutines.filter((r) => r.id.startsWith("builtin:"));
		expect(builtinRows).toHaveLength(4);

		vi.unstubAllEnvs();
	});

	test("only post-bet-retro's id contains the team id — the other three are global, bare ids", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Acme Team", functions: ["development", "product"] }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const teamId = body.team.id;

		const rosterAgents = await db
			.select({ id: users.id })
			.from(users)
			.where(inArray(users.teamId, [teamId]));
		const rosterIds = rosterAgents.map((a) => a.id);
		const builtinRows = (
			await db.select().from(routines).where(inArray(routines.ownerAgentId, rosterIds))
		).filter((r) => r.id.startsWith("builtin:"));

		const postBetRetro = builtinRows.find((r) => r.id.startsWith("builtin:post-bet-retro"));
		expect(postBetRetro?.id).toBe(`builtin:post-bet-retro:${teamId}`);

		const globals = builtinRows.filter((r) => !r.id.startsWith("builtin:post-bet-retro"));
		expect(globals).toHaveLength(3);
		for (const r of globals) {
			expect(r.id).not.toContain(teamId);
		}

		vi.unstubAllEnvs();
	});

	test("routine owner_agent_id is one of the team's roster users (not a factory agent)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Owner Check Team", functions: ["development", "product"] }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const teamId = body.team.id;
		// Get this team's roster agent ids
		// @lore AU44 B1: users.teamId references teams.id directly
		const rosterAgents = await db
			.select({ id: users.id })
			.from(users)
			.where(inArray(users.teamId, [teamId]));

		const rosterIds = new Set(rosterAgents.map((a) => a.id));
		expect(rosterIds.size).toBeGreaterThan(0);

		const builtinRows = (
			await db
				.select()
				.from(routines)
				.where(inArray(routines.ownerAgentId, [...rosterIds]))
		).filter((r) => r.id.startsWith("builtin:"));
		expect(builtinRows.length).toBe(4);

		for (const r of builtinRows) {
			expect(
				rosterIds.has(r.ownerAgentId!),
				`routine ${r.id} owner ${r.ownerAgentId} must be a roster agent`,
			).toBe(true);
		}

		vi.unstubAllEnvs();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3b: BA1 D7 — a second team's provisioning does not re-create the three
// globally-scoped builtins; only post-bet-retro is per-team.
// ─────────────────────────────────────────────────────────────────────────────

describe("AF17/BA1 D7: a second team's provisioning does not duplicate global builtins", () => {
	test("team two gets its own post-bet-retro but no new copy of the three global builtins", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Create first team — seeds the 3 global builtins (bare ids) + its own post-bet-retro.
		const res1 = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Team Alpha", functions: ["development", "product"] }),
		});
		expect(res1.status).toBe(201);

		const globalsBefore = (await db.select().from(routines)).filter(
			(r) => r.id.startsWith("builtin:") && !r.id.startsWith("builtin:post-bet-retro"),
		);
		expect(globalsBefore).toHaveLength(3);

		// Second team, seeded directly (POST /api/teams has a "first team"
		// idempotency guard unrelated to this test).
		const team2Id = "team-af17-test-2";
		const agent2Id = "agent-pm-af17-test-2";

		await db
			.insert(teams)
			.values({ id: team2Id, name: "Team Beta", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: agent2Id,
			kind: "ai",
			name: "Team Beta Product Manager",
			role: "product_manager",
			agentCategory: "team",
			status: "active",
			teamId: team2Id,
			createdAt: NOW,
		});

		await seedTeamRoutines(db, {
			teamId: team2Id,
			ownerByRole: { product_manager: agent2Id },
			leadAgentId: agent2Id,
		});

		// The 3 global builtins are UNCHANGED — still exactly 3 rows, still
		// owned by team one's roster (onConflictDoNothing made team two's
		// attempt a no-op).
		const globalsAfter = (await db.select().from(routines)).filter(
			(r) => r.id.startsWith("builtin:") && !r.id.startsWith("builtin:post-bet-retro"),
		);
		expect(globalsAfter).toHaveLength(3);
		const ownerById = (rows: typeof globalsAfter): Record<string, string | null> =>
			Object.fromEntries(rows.map((r) => [r.id, r.ownerAgentId]));
		expect(ownerById(globalsAfter)).toEqual(ownerById(globalsBefore));

		// Team two DOES get its own post-bet-retro row.
		const team2PostBetRetro = await db
			.select()
			.from(routines)
			.where(inArray(routines.ownerAgentId, [agent2Id]));
		expect(team2PostBetRetro).toHaveLength(1);
		expect(team2PostBetRetro[0]?.id).toBe(`builtin:post-bet-retro:${team2Id}`);

		vi.unstubAllEnvs();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3c: Owner fallback — team without product_manager still gets valid owners
// ─────────────────────────────────────────────────────────────────────────────

describe("AF17 AC3: owner fallback when team lacks a product_manager", () => {
	test("seedTeamRoutines falls back to leadAgentId when ownerByRole has no product_manager", async ({
		db,
	}) => {
		const teamId = "team-af17-fallback";
		const leadId = "agent-af17-fallback-lead";

		await db
			.insert(teams)
			.values({ id: teamId, name: "Marketing Team", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: leadId,
			kind: "ai",
			name: "Marketing Lead",
			role: "growth",
			agentCategory: "team",
			status: "active",
			teamId: teamId,
			createdAt: NOW,
		});

		// No product_manager in ownerByRole — should fall back to leadId
		await seedTeamRoutines(db, {
			teamId,
			ownerByRole: {}, // no product_manager
			leadAgentId: leadId,
		});

		const builtinRows = (
			await db
				.select()
				.from(routines)
				.where(inArray(routines.ownerAgentId, [leadId]))
		).filter((r) => r.id.startsWith("builtin:"));
		expect(builtinRows).toHaveLength(4);

		// All owners must be the leadId (fallback)
		for (const r of builtinRows) {
			expect(r.ownerAgentId).toBe(leadId);
		}
	});
});
