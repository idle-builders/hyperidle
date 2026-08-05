/**
 * AB3 — Teams route: agentCategory field in roster response.
 *
 * AC coverage:
 * AC-1: GET /api/teams/:id roster members include `agentCategory` field.
 * AC-4: PATCH /api/agents/:id with modelTierPreference returns updated value.
 * AC-5: POST /api/agents creates agent with teamId (teamMembers.id), returns 201.
 *
 * These tests FAIL until:
 * - RosterMember interface in @hyperidle/shared includes `agentCategory`
 * - GET /api/teams/:id includes agentCategory in the roster assembly
 */

import { agentRunConfig, type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-ab3-teams";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

const NOW = new Date().toISOString();

async function seedTeamWithCategorizedAgents(db: HyperIdleDb): Promise<{
	teamId: string;
	teamMembersId: string;
	teamAgentId: string;
	strategyAgentId: string;
}> {
	const teamId = "ab3-team";
	const teamMembersId = "ab3-tm";
	const teamAgentId = "ab3-agent-team";
	const strategyAgentId = "ab3-agent-strategy";

	await db
		.insert(teams)
		.values({ id: teamId, name: "AB3 Test Team", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: teamMembersId,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});

	// Team category agent
	await db.insert(users).values({
		id: teamAgentId,
		kind: "ai",
		name: "Team Builder",
		role: "builder",
		status: "active",
		teamId: teamMembersId,
		agentCategory: "team",
		createdAt: NOW,
	});
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: teamAgentId,
		maxConcurrentSessions: 2,
	});

	// Strategy category agent
	await db.insert(users).values({
		id: strategyAgentId,
		kind: "ai",
		name: "Scout Agent",
		role: "scout",
		status: "active",
		teamId: teamMembersId,
		agentCategory: "strategy",
		createdAt: NOW,
	});

	await db
		.update(teamMembers)
		.set({ leadAgentId: teamAgentId })
		.where(eq(teamMembers.id, teamMembersId));

	return { teamId, teamMembersId, teamAgentId, strategyAgentId };
}

describe("AB3 — teams routes: agentCategory in roster", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC-1: roster members include agentCategory
	describe("GET /api/teams/:id — roster includes agentCategory (AC-1)", () => {
		test("returns agentCategory field on each roster member", async ({ db, app }) => {
			const { teamId } = await seedTeamWithCategorizedAgents(db);

			const res = await app.request(`/api/teams/${teamId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				roster: Array<{
					agentId: string;
					name: string;
					role: string;
					isLead: boolean;
					agentCategory: string | null;
				}>;
			};
			expect(Array.isArray(body.roster)).toBe(true);
			expect(body.roster.length).toBe(2);

			// Every roster member must have an agentCategory field (not undefined)
			for (const member of body.roster) {
				expect("agentCategory" in member).toBe(true);
			}
		});

		test("roster member with agentCategory='team' is present", async ({ db, app }) => {
			const { teamId, teamAgentId } = await seedTeamWithCategorizedAgents(db);

			const res = await app.request(`/api/teams/${teamId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				roster: Array<{ agentId: string; agentCategory: string | null }>;
			};
			const teamMember = body.roster.find((m) => m.agentId === teamAgentId);
			expect(teamMember).toBeDefined();
			expect(teamMember?.agentCategory).toBe("team");
		});

		test("roster member with agentCategory='strategy' is present", async ({ db, app }) => {
			const { teamId, strategyAgentId } = await seedTeamWithCategorizedAgents(db);

			const res = await app.request(`/api/teams/${teamId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				roster: Array<{ agentId: string; agentCategory: string | null }>;
			};
			const stratMember = body.roster.find((m) => m.agentId === strategyAgentId);
			expect(stratMember).toBeDefined();
			expect(stratMember?.agentCategory).toBe("strategy");
		});

		test("roster member with null agentCategory returns null (not undefined)", async ({
			db,
			app,
		}) => {
			// Seed an agent with no agentCategory set
			const teamId = "ab3-team-null-cat";
			const teamMembersId = "ab3-tm-null-cat";
			await db
				.insert(teams)
				.values({ id: teamId, name: "Null Cat Team", phase: "build", createdAt: NOW });
			await db.insert(teamMembers).values({
				id: teamMembersId,
				teamId,
				capacity: 3,
				activeBets: 0,
				formedAt: NOW,
			});
			await db.insert(users).values({
				id: "ab3-agent-no-cat",
				kind: "ai",
				name: "No Category Agent",
				role: "builder",
				status: "active",
				teamId: teamMembersId,
				// agentCategory deliberately not set
				createdAt: NOW,
			});

			const res = await app.request(`/api/teams/${teamId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				roster: Array<{ agentId: string; agentCategory: string | null }>;
			};
			expect(body.roster.length).toBe(1);
			// Field must be present and null (not undefined)
			const firstMember = body.roster[0];
			expect(firstMember).toBeDefined();
			expect("agentCategory" in (firstMember ?? {})).toBe(true);
			expect(firstMember?.agentCategory).toBeNull();
		});
	});

	// AC-4: PATCH /api/agents/:id with modelTierPreference returns 200 + updated value
	describe("PATCH /api/agents/:id — modelTierPreference update (AC-4)", () => {
		test("returns 200 with updated modelTierPreference", async ({ db, app }) => {
			const { teamMembersId } = await seedTeamWithCategorizedAgents(db);

			// First seed an agent directly accessible to the agents endpoint
			await db.insert(users).values({
				id: "ab3-patch-agent",
				kind: "ai",
				name: "Patch Test Agent",
				role: "builder",
				status: "active",
				teamId: teamMembersId,
				createdAt: NOW,
			});
			// @lore AU26 G1: the run config left `users` for `agent_run_config`.
			await db.insert(agentRunConfig).values({
				agentUserId: "ab3-patch-agent",
				maxConcurrentSessions: 1,
				modelTierPreference: null,
			});

			const res = await app.request("/api/agents/ab3-patch-agent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ modelTierPreference: "reasoning" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as { modelTierPreference: string | null };
			expect(body.modelTierPreference).toBe("reasoning");
		});
	});

	// AC-5: POST /api/agents creates agent with teamMembersId, returns 201
	describe("POST /api/agents — create with teamId (AC-5)", () => {
		test("returns 201 with created agent when teamId is a valid teamMembers id", async ({
			db,
			app,
		}) => {
			const { teamMembersId } = await seedTeamWithCategorizedAgents(db);

			const res = await app.request("/api/agents", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					name: "New Custom Agent",
					role: "builder",
					teamId: teamMembersId,
				}),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as { id: string; name: string; role: string };
			expect(body.name).toBe("New Custom Agent");
			expect(body.role).toBe("builder");
			expect(typeof body.id).toBe("string");
		});
	});
});
