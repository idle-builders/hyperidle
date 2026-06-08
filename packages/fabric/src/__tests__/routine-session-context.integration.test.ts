/**
 * AA2 — Routine session context tests.
 *
 * AC-3: buildRoutineSessionContextData returns routine, agent, team data.
 *       Does NOT return task or bet fields.
 * AC-4: context includes lastRunSummary (clean session start with continuity).
 */

import { type HyperIdleDb, routines, teamMembers, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import {
	buildRoutineSessionContextData,
	type RoutineSessionContextConfig,
} from "../session-context.js";

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	await db.insert(teams).values({
		id: "team-ctx",
		name: "Context Team",
		phase: "build",
		createdAt: now,
	});

	await db.insert(teamMembers).values({
		id: "tm-ctx",
		teamId: "team-ctx",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});

	await db.insert(users).values({
		id: "agent-ctx",
		name: "Context Agent",
		role: "builder",
		status: "active",
		teamId: "tm-ctx",
		createdAt: now,
	});

	await db.insert(routines).values({
		id: "routine-ctx",
		name: "Context Routine",
		description: "Tests the context builder",
		ownerAgentId: "agent-ctx",
		teamId: "team-ctx",
		state: "active",
		triggerType: "calendar",
		active: true,
		lastRunSummary: "Previous run completed 5 tasks.",
	});
}

describe("buildRoutineSessionContextData", () => {
	test("returns routine name and description", async ({ db }) => {
		await seedBase(db);
		const config: RoutineSessionContextConfig = {
			sessionId: "session-test",
			routineId: "routine-ctx",
			agentId: "agent-ctx",
			agentRole: "builder",
			teamId: "team-ctx",
		};

		const ctx = await buildRoutineSessionContextData(db, config);

		expect(ctx.routine.id).toBe("routine-ctx");
		expect(ctx.routine.name).toBe("Context Routine");
		expect(ctx.routine.description).toBe("Tests the context builder");
	});

	test("includes lastRunSummary from routines table (AC-4 continuity)", async ({ db }) => {
		await seedBase(db);
		const config: RoutineSessionContextConfig = {
			sessionId: "session-test",
			routineId: "routine-ctx",
			agentId: "agent-ctx",
			agentRole: "builder",
			teamId: "team-ctx",
		};

		const ctx = await buildRoutineSessionContextData(db, config);

		expect(ctx.routine.lastRunSummary).toBe("Previous run completed 5 tasks.");
	});

	test("returns null lastRunSummary when no previous runs", async ({ db }) => {
		await seedBase(db);
		await db.insert(routines).values({
			id: "routine-no-summary",
			name: "First run routine",
			ownerAgentId: "agent-ctx",
			teamId: "team-ctx",
			state: "active",
			triggerType: "calendar",
			active: true,
			// lastRunSummary NOT set
		});

		const config: RoutineSessionContextConfig = {
			sessionId: "session-test",
			routineId: "routine-no-summary",
			agentId: "agent-ctx",
			agentRole: "builder",
			teamId: "team-ctx",
		};

		const ctx = await buildRoutineSessionContextData(db, config);

		expect(ctx.routine.lastRunSummary).toBeNull();
	});

	test("returns agent name and role", async ({ db }) => {
		await seedBase(db);
		const config: RoutineSessionContextConfig = {
			sessionId: "session-test",
			routineId: "routine-ctx",
			agentId: "agent-ctx",
			agentRole: "builder",
			teamId: "team-ctx",
		};

		const ctx = await buildRoutineSessionContextData(db, config);

		expect(ctx.agent.id).toBe("agent-ctx");
		expect(ctx.agent.name).toBe("Context Agent");
		expect(ctx.agent.role).toBe("builder");
	});

	test("returns team name and id", async ({ db }) => {
		await seedBase(db);
		const config: RoutineSessionContextConfig = {
			sessionId: "session-test",
			routineId: "routine-ctx",
			agentId: "agent-ctx",
			agentRole: "builder",
			teamId: "team-ctx",
		};

		const ctx = await buildRoutineSessionContextData(db, config);

		expect(ctx.team.id).toBe("team-ctx");
		expect(ctx.team.name).toBe("Context Team");
	});

	test("does NOT include task or bet fields (AC-3: clean context)", async ({ db }) => {
		await seedBase(db);
		const config: RoutineSessionContextConfig = {
			sessionId: "session-test",
			routineId: "routine-ctx",
			agentId: "agent-ctx",
			agentRole: "builder",
			teamId: "team-ctx",
		};

		const ctx = await buildRoutineSessionContextData(db, config);

		// Type-safety: these fields should not exist on the context
		expect("task" in ctx).toBe(false);
		expect("bet" in ctx).toBe(false);
	});

	test("throws when routine is not found", async ({ db }) => {
		await seedBase(db);
		const config: RoutineSessionContextConfig = {
			sessionId: "session-test",
			routineId: "nonexistent-routine",
			agentId: "agent-ctx",
			agentRole: "builder",
			teamId: "team-ctx",
		};

		await expect(buildRoutineSessionContextData(db, config)).rejects.toThrow(
			"Routine nonexistent-routine not found",
		);
	});

	test("throws when agent is not found", async ({ db }) => {
		await seedBase(db);
		const config: RoutineSessionContextConfig = {
			sessionId: "session-test",
			routineId: "routine-ctx",
			agentId: "nonexistent-agent",
			agentRole: "builder",
			teamId: "team-ctx",
		};

		await expect(buildRoutineSessionContextData(db, config)).rejects.toThrow(
			"Agent nonexistent-agent not found",
		);
	});

	test("throws when team is not found", async ({ db }) => {
		await seedBase(db);
		const config: RoutineSessionContextConfig = {
			sessionId: "session-test",
			routineId: "routine-ctx",
			agentId: "agent-ctx",
			agentRole: "builder",
			teamId: "nonexistent-team",
		};

		await expect(buildRoutineSessionContextData(db, config)).rejects.toThrow(
			"Team nonexistent-team not found",
		);
	});
});
