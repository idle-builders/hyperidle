/**
 * AB3 — Teams route: agentCategory field in roster response.
 *
 * AC coverage:
 * AC-1: GET /api/teams/:id roster members include `agentCategory` field.
 * AC-5: POST /api/agents creates agent with teamId (teamMembers.id), returns 201.
 *
 * These tests FAIL until:
 * - RosterMember interface in @hyperidle/domain-model includes `agentCategory`
 * - GET /api/teams/:id includes agentCategory in the roster assembly
 */

import { agentRunConfig, type HyperIdleDb, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

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
	// @lore AU44 B1: teamMembersId = teamId after fold (one row, one id).
	const teamMembersId = teamId;
	const teamAgentId = "ab3-agent-team";
	const strategyAgentId = "ab3-agent-strategy";

	await db
		.insert(teams)
		.values({ id: teamId, name: "AB3 Test Team", phase: "build", createdAt: NOW });

	// Team category agent
	await db.insert(users).values({
		id: teamAgentId,
		kind: "ai",
		name: "Team Builder",
		role: "builder",
		status: "active",
		teamId,
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
		teamId,
		agentCategory: "strategy",
		createdAt: NOW,
	});

	await db.update(teams).set({ leadAgentId: teamAgentId }).where(eq(teams.id, teamId));

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
			await db
				.insert(teams)
				.values({ id: teamId, name: "Null Cat Team", phase: "build", createdAt: NOW });
			await db.insert(users).values({
				id: "ab3-agent-no-cat",
				kind: "ai",
				name: "No Category Agent",
				role: "builder",
				status: "active",
				teamId,
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

	// @lore An AC-4 block here PATCHed `modelTierPreference` and asserted the
	// updated value came back. That dial is gone: it named a model-gateway entry,
	// selected nothing once the gateway went, and was unreachable on the path every
	// real session takes. A model is chosen per agent instead.

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
