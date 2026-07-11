/**
 * AF17 — AC3: Team routines provisioned at team creation.
 *
 * When a team is created (via POST /api/teams or create_team skill tool):
 *   - 5 built-in routine rows are inserted with routines.team_id = teams.id
 *   - Each routine's owner_agent_id is a member of that team's roster (users.id)
 *   - routines.team_id is NOT team_members.id (FK load-bearing: must pass FK check)
 *   - A second team gets its own 5 routines (no collision — per-team id scheme)
 *   - Owner fallback: if a team has no product_manager, routines still get a valid owner
 *
 * RED PHASE: Fails until provisionTeamRoutines is wired into POST /api/teams
 * and create_team skill tool.
 */

import {
	factorySettings,
	type HyperIdleDb,
	routines,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { provisionTeamRoutines } from "../services/builtin-routine-handlers.js";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-AF17";
const NOW = new Date().toISOString();

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/** Seed factory system templates so team creation can resolve them. */
async function seedFactoryTemplates(db: HyperIdleDb): Promise<void> {
	const roles = ["product_manager", "builder", "qa_engineer", "facilitator", "designer"];
	for (const role of roles) {
		await db
			.insert(factorySettings)
			.values({ key: `system_template:${role}`, value: `You are a ${role} agent.`, updatedAt: NOW })
			.onConflictDoNothing();
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// AC3a: POST /api/teams provisions 5 built-in routines
// ─────────────────────────────────────────────────────────────────────────────

describe("AF17 AC3: POST /api/teams provisions built-in routines", () => {
	test("creates exactly 5 builtin routines for the new team", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedFactoryTemplates(db);

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

		// Must have exactly 5 builtin routines scoped to this team
		const builtinRoutines = await db.select().from(routines).where(eq(routines.teamId, teamId));

		const builtinRows = builtinRoutines.filter((r) => r.id.startsWith("builtin:"));
		expect(builtinRows).toHaveLength(5);

		vi.unstubAllEnvs();
	});

	test("each routine id contains the team id (per-team id scheme)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedFactoryTemplates(db);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Acme Team", functions: ["development", "product"] }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const teamId = body.team.id;

		const builtinRoutines = await db.select().from(routines).where(eq(routines.teamId, teamId));

		const builtinRows = builtinRoutines.filter((r) => r.id.startsWith("builtin:"));
		for (const r of builtinRows) {
			// id must contain the teamId as a suffix (builtin:<kind>:<teamId>)
			expect(r.id).toContain(teamId);
		}

		vi.unstubAllEnvs();
	});

	test("routines.team_id equals teams.id, NOT team_members.id (FK load-bearing)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedFactoryTemplates(db);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "FK Check Team", functions: ["development", "product"] }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const teamsId = body.team.id;
		const teamMembersId = body.teamMembers.id;

		// These two ids must be different (both are UUIDs with different prefixes)
		expect(teamsId).not.toBe(teamMembersId);

		const builtinRows = await db.select().from(routines).where(eq(routines.teamId, teamsId));

		expect(builtinRows.filter((r) => r.id.startsWith("builtin:")).length).toBe(5);

		// Each routine must reference teams.id (not team_members.id)
		for (const r of builtinRows) {
			expect(r.teamId).toBe(teamsId);
			expect(r.teamId).not.toBe(teamMembersId);
		}

		vi.unstubAllEnvs();
	});

	test("routine owner_agent_id is one of the team's roster users (not a factory agent)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedFactoryTemplates(db);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Owner Check Team", functions: ["development", "product"] }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const teamId = body.team.id;
		const teamMembersId = body.teamMembers.id;

		// Get this team's roster agent ids
		const rosterAgents = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.teamId, teamMembersId));

		const rosterIds = new Set(rosterAgents.map((a) => a.id));
		expect(rosterIds.size).toBeGreaterThan(0);

		const builtinRows = await db.select().from(routines).where(eq(routines.teamId, teamId));

		const builtinFiltered = builtinRows.filter((r) => r.id.startsWith("builtin:"));
		expect(builtinFiltered.length).toBe(5);

		for (const r of builtinFiltered) {
			expect(
				rosterIds.has(r.ownerAgentId!),
				`routine ${r.id} owner ${r.ownerAgentId} must be a roster agent`,
			).toBe(true);
		}

		vi.unstubAllEnvs();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3b: Per-team non-collision — second team gets its own 5 routines
// ─────────────────────────────────────────────────────────────────────────────

describe("AF17 AC3: per-team id scheme prevents collision across two teams", () => {
	test("two teams each get 5 built-in routines (10 total, no collision)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedFactoryTemplates(db);

		// Create first team
		const res1 = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Team Alpha", functions: ["development", "product"] }),
		});
		expect(res1.status).toBe(201);
		const body1 = (await res1.json()) as { team: { id: string }; teamMembers: { id: string } };

		// Create second team (use create_team skill path via a different route, or reset idempotency guard)
		// Since POST /api/teams has a "first team" idempotency guard, we test via DB direct insertion
		// followed by a call to provisionTeamRoutines if available; otherwise we test via the skill tool.
		// For the integration path, we call provisionTeamRoutines directly if it exists.
		// @lore AF17: The idempotency guard on POST /api/teams means only one team can be created via that
		// route per DB. The second team is created via direct DB insertion + provisionTeamRoutines call.

		// Insert a second team directly
		const team2Id = "team-af17-test-2";
		const teamMembers2Id = "team-af17-tm-2";
		const agent2Id = "agent-pm-af17-test-2";

		await db
			.insert(teams)
			.values({ id: team2Id, name: "Team Beta", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: teamMembers2Id, teamId: team2Id, capacity: 5, activeBets: 0, formedAt: NOW });
		await db.insert(users).values({
			id: agent2Id,
			kind: "ai",
			name: "Team Beta Product Manager",
			role: "product_manager",
			agentCategory: "team",
			status: "active",
			teamId: teamMembers2Id,
			createdAt: NOW,
		});

		await provisionTeamRoutines(db, {
			teamId: team2Id,
			ownerByRole: { product_manager: agent2Id },
			leadAgentId: agent2Id,
		});

		// Count all builtin routines across both teams
		const team1Routines = await db
			.select()
			.from(routines)
			.where(eq(routines.teamId, body1.team.id));
		const team2Routines = await db.select().from(routines).where(eq(routines.teamId, team2Id));

		const t1Builtins = team1Routines.filter((r) => r.id.startsWith("builtin:"));
		const t2Builtins = team2Routines.filter((r) => r.id.startsWith("builtin:"));

		expect(t1Builtins).toHaveLength(5);
		expect(t2Builtins).toHaveLength(5);

		// ids must be disjoint
		const t1Ids = new Set(t1Builtins.map((r) => r.id));
		const t2Ids = new Set(t2Builtins.map((r) => r.id));
		for (const id of t2Ids) {
			expect(t1Ids.has(id), `team2 routine id ${id} must not collide with team1`).toBe(false);
		}

		vi.unstubAllEnvs();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3c: Owner fallback — team without product_manager still gets valid owners
// ─────────────────────────────────────────────────────────────────────────────

describe("AF17 AC3: owner fallback when team lacks a product_manager", () => {
	test("provisionTeamRoutines falls back to leadAgentId when ownerByRole has no product_manager", async ({
		db,
	}) => {
		const teamId = "team-af17-fallback";
		const tmId = "team-af17-fallback-tm";
		const leadId = "agent-af17-fallback-lead";

		await db
			.insert(teams)
			.values({ id: teamId, name: "Marketing Team", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: tmId, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
		await db.insert(users).values({
			id: leadId,
			kind: "ai",
			name: "Marketing Lead",
			role: "growth",
			agentCategory: "team",
			status: "active",
			teamId: tmId,
			createdAt: NOW,
		});

		// No product_manager in ownerByRole — should fall back to leadId
		await provisionTeamRoutines(db, {
			teamId,
			ownerByRole: {}, // no product_manager
			leadAgentId: leadId,
		});

		const builtinRows = await db.select().from(routines).where(eq(routines.teamId, teamId));

		const builtinFiltered = builtinRows.filter((r) => r.id.startsWith("builtin:"));
		expect(builtinFiltered).toHaveLength(5);

		// All owners must be the leadId (fallback)
		for (const r of builtinFiltered) {
			expect(r.ownerAgentId).toBe(leadId);
		}
	});
});
