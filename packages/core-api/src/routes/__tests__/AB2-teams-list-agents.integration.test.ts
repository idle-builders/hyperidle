/**
 * AB2 — GET /teams: agentCount, activeAgentCount, agentHealthWarning (RED phase)
 *
 * AC coverage:
 * AC-5: Portfolio page shows per-team agent summary (server side)
 *   - agentCount: total AI agents in the team
 *   - activeAgentCount: agents with state="active" session
 *   - agentHealthWarning: true when any agent has >50% crashes in 7d or lastSessionCrashed
 *
 * These tests FAIL until:
 * - TeamListItem extended with agentCount, activeAgentCount, agentHealthWarning in packages/shared/src/team.ts
 * - GET /teams enriches each team with agent summary data
 */

import {
	agentRunConfig,
	bets,
	type HyperIdleDb,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-ab2-teams-list";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

const NOW = new Date().toISOString();
const THREE_DAYS_AGO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

async function seedTeamWithAgents(
	db: HyperIdleDb,
	teamId: string,
	teamName: string,
	agentCount: number,
): Promise<string[]> {
	await db.insert(teams).values({ id: teamId, name: teamName, phase: "build", createdAt: NOW });
	const tmId = `${teamId}-tm`;
	await db
		.insert(teamMembers)
		.values({ id: tmId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });

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
		await db
			.insert(teamMembers)
			.values({ id: "empty-tm", teamId: "empty-team", capacity: 5, activeBets: 0, formedAt: NOW });

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

	test("returns activeAgentCount = 0 when no agents have active sessions", async ({ db, app }) => {
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
		await seedTeamWithAgents(db, "ab2-list-team-2", "List Team Two", 2);

		const res = await app.request("/api/teams", { headers: authHeaders() });
		const body = (await res.json()) as { teams: Array<Record<string, unknown>> };
		const team = body.teams.find((t) => t.id === "ab2-list-team-2");

		expect(team?.activeAgentCount).toBe(0);
	});

	test("returns activeAgentCount correctly when one agent has active session", async ({
		db,
		app,
	}) => {
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
		const agentIds = await seedTeamWithAgents(db, "ab2-list-team-3", "List Team Three", 2);

		// Seed a bet + task for the session
		await db.insert(bets).values({
			id: "ab2-list-bet-1",
			teamId: "ab2-list-team-3",
			description: "Test bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "ab2-list-task-1",
			betId: "ab2-list-bet-1",
			teamId: "ab2-list-team-3",
			title: "Test task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});

		// Give agent 1 an active session
		const activeAgentId = agentIds[0];
		if (!activeAgentId) throw new Error("No agent seeded");
		await db.insert(sessions).values({
			id: "ab2-list-sess-active",
			taskId: "ab2-list-task-1",
			agentId: activeAgentId,
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});

		const res = await app.request("/api/teams", { headers: authHeaders() });
		const body = (await res.json()) as { teams: Array<Record<string, unknown>> };
		const team = body.teams.find((t) => t.id === "ab2-list-team-3");

		expect(team?.activeAgentCount).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// AC-5 (server): agentHealthWarning
// ---------------------------------------------------------------------------

describe("AB2 AC-5: GET /teams agentHealthWarning", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns agentHealthWarning=false when all agents are healthy", async ({ db, app }) => {
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
		const agentIds = await seedTeamWithAgents(db, "ab2-health-team-ok", "Health Team OK", 1);

		// Seed a successful session
		await db.insert(bets).values({
			id: "ab2-health-bet-ok",
			teamId: "ab2-health-team-ok",
			description: "Test",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "ab2-health-task-ok",
			betId: "ab2-health-bet-ok",
			teamId: "ab2-health-team-ok",
			title: "Task",
			state: "completed",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const agentId = agentIds[0];
		if (!agentId) throw new Error("No agent seeded");
		await db.insert(sessions).values({
			id: "ab2-health-sess-ok",
			taskId: "ab2-health-task-ok",
			agentId,
			modelTier: "workhorse",
			startedAt: THREE_DAYS_AGO,
			endedAt: THREE_DAYS_AGO,
			state: "completed",
			outcome: "completed",
		});

		const res = await app.request("/api/teams", { headers: authHeaders() });
		const body = (await res.json()) as { teams: Array<Record<string, unknown>> };
		const team = body.teams.find((t) => t.id === "ab2-health-team-ok");

		expect(team?.agentHealthWarning).toBe(false);
	});

	test("returns agentHealthWarning=true when an agent has >50% crash rate in 7d", async ({
		db,
		app,
	}) => {
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
		const agentIds = await seedTeamWithAgents(db, "ab2-health-team-bad", "Health Team Bad", 1);
		const agentId = agentIds[0];
		if (!agentId) throw new Error("No agent seeded");

		// Seed 3 crashed + 1 success = 75% crash rate in 7d
		await db.insert(bets).values({
			id: "ab2-health-bet-bad",
			teamId: "ab2-health-team-bad",
			description: "Test",
			status: "active",
			createdAt: NOW,
		});
		for (let i = 1; i <= 4; i++) {
			const paddedId = i.toString().padStart(2, "0");
			await db.insert(tasks).values({
				id: `ab2-health-task-bad-${paddedId}`,
				betId: "ab2-health-bet-bad",
				teamId: "ab2-health-team-bad",
				title: `Task ${i}`,
				state: "completed",
				createdAt: NOW,
				updatedAt: NOW,
			});
			await db.insert(sessions).values({
				id: `ab2-health-sess-bad-${paddedId}`,
				taskId: `ab2-health-task-bad-${paddedId}`,
				agentId,
				modelTier: "workhorse",
				startedAt: THREE_DAYS_AGO,
				endedAt: THREE_DAYS_AGO,
				state: "completed",
				outcome: i <= 3 ? "crashed" : "completed",
			});
		}

		const res = await app.request("/api/teams", { headers: authHeaders() });
		const body = (await res.json()) as { teams: Array<Record<string, unknown>> };
		const team = body.teams.find((t) => t.id === "ab2-health-team-bad");

		expect(team?.agentHealthWarning).toBe(true);
	});

	test("returns agentHealthWarning=false when team has no agents", async ({ db, app }) => {
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
		await db
			.insert(teams)
			.values({ id: "ab2-no-agents", name: "No Agents", phase: "build", createdAt: NOW });
		await db.insert(teamMembers).values({
			id: "ab2-no-agents-tm",
			teamId: "ab2-no-agents",
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});

		const res = await app.request("/api/teams", { headers: authHeaders() });
		const body = (await res.json()) as { teams: Array<Record<string, unknown>> };
		const team = body.teams.find((t) => t.id === "ab2-no-agents");

		expect(team?.agentHealthWarning).toBe(false);
	});

	test("returns TeamListItem with agentCount, activeAgentCount, agentHealthWarning fields", async ({
		db,
		app,
	}) => {
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
		expect(team).toHaveProperty("agentCount");
		expect(team).toHaveProperty("activeAgentCount");
		expect(team).toHaveProperty("agentHealthWarning");
		expect(typeof team?.agentCount).toBe("number");
		expect(typeof team?.activeAgentCount).toBe("number");
		expect(typeof team?.agentHealthWarning).toBe("boolean");
	});
});
