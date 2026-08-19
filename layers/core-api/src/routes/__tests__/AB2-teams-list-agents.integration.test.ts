/**
 * AB2 — GET /teams: the per-team agent summary.
 *
 * AC coverage:
 * AC-5: Portfolio page shows per-team agent summary (server side)
 *   - agentCount: total AI agents in the team
 *
 * @lore AU26 J1: `activeAgentCount` and `agentHealthWarning` were DELETED from
 * this response along with the batched `sessions` read that produced them —
 * neither had a production reader (only stories/tests and a comment saying the
 * simplified row deliberately does NOT use `agentHealthWarning`). Their absence
 * is pinned by `core-api-serves-no-agent-run-decorations.integration.test.ts`.
 * `agentCount` is a `users` read — core's own table — and stays.
 */

import { agentRunConfig, type HyperIdleDb, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ab2-teams-list";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

const NOW = new Date().toISOString();

async function seedTeamWithAgents(
	db: HyperIdleDb,
	teamId: string,
	teamName: string,
	agentCount: number,
): Promise<string[]> {
	await db.insert(teams).values({ id: teamId, name: teamName, phase: "build", createdAt: NOW });
	const tmId = `${teamId}-tm`;
	
	const agentIds: string[] = [];
	for (let i = 1; i <= agentCount; i++) {
		const agentId = `${teamId}-agent-${i}`;
		agentIds.push(agentId);
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: `${teamName} Agent ${i}`,
			role: "builder",
			status: "active",
			teamId: tmId,
			createdAt: NOW,
		});
		// @lore AU26 G1: the run config left `users` for `agent_run_config`.
		await db.insert(agentRunConfig).values({
			agentUserId: agentId,
			maxConcurrentSessions: 2,
		});
	}
	return agentIds;
}

// ---------------------------------------------------------------------------
// AC-5 (server): GET /teams includes agentCount
// ---------------------------------------------------------------------------

describe("AB2 AC-5: GET /teams includes agentCount", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns agentCount = 0 for a team with no agents", async ({ db, app }) => {
		// Founder required for auth
		await db.insert(users).values({
			id: "u-founder-ab2-list",
			kind: "human",
			name: "AB2 List Founder",
			role: "founder",
			status: "active",
			email: "ab2-list@hyperidle.com",
			createdAt: NOW,
		});
		// @lore AU26 G1: the run config left `users` for `agent_run_config`.
		await db.insert(agentRunConfig).values({
			agentUserId: "u-founder-ab2-list",
			maxConcurrentSessions: 0,
		});
		await db
			.insert(teams)
			.values({ id: "empty-team", name: "Empty Team", phase: "build", createdAt: NOW });
		
		const res = await app.request("/api/teams", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as { teams: Array<Record<string, unknown>> };
		const team = body.teams.find((t) => t.id === "empty-team");
		expect(team).toBeDefined();
		expect(team?.agentCount).toBe(0);
	});

	test("returns correct agentCount for a team with agents", async ({ db, app }) => {
		await db.insert(users).values({
			id: "u-founder-ab2-list",
			kind: "human",
			name: "AB2 List Founder",
			role: "founder",
			status: "active",
			email: "ab2-list@hyperidle.com",
			createdAt: NOW,
		});
		// @lore AU26 G1: the run config left `users` for `agent_run_config`.
		await db.insert(agentRunConfig).values({
			agentUserId: "u-founder-ab2-list",
			maxConcurrentSessions: 0,
		});
		await seedTeamWithAgents(db, "ab2-list-team-1", "List Team One", 3);

		const res = await app.request("/api/teams", { headers: authHeaders() });
		const body = (await res.json()) as { teams: Array<Record<string, unknown>> };
		const team = body.teams.find((t) => t.id === "ab2-list-team-1");

		expect(team?.agentCount).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// AC-5 (server): the shape TeamListItem actually carries
// ---------------------------------------------------------------------------

describe("AB2 AC-5: GET /teams agent summary shape", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns TeamListItem with a numeric agentCount", async ({ db, app }) => {
		await db.insert(users).values({
			id: "u-founder-ab2-health",
			kind: "human",
			name: "AB2 Health Founder",
			role: "founder",
			status: "active",
			email: "ab2-health@hyperidle.com",
			createdAt: NOW,
		});
		// @lore AU26 G1: the run config left `users` for `agent_run_config`.
		await db.insert(agentRunConfig).values({
			agentUserId: "u-founder-ab2-health",
			maxConcurrentSessions: 0,
		});
		await seedTeamWithAgents(db, "ab2-shape-team", "Shape Team", 2);

		const res = await app.request("/api/teams", { headers: authHeaders() });
		const body = (await res.json()) as { teams: Array<Record<string, unknown>> };
		const team = body.teams.find((t) => t.id === "ab2-shape-team");

		expect(team).toBeDefined();
		expect(team?.agentCount).toBe(2);
	});
});
