/**
 * X8: Delegation scenarios (interaction 24).
 *
 * Tests the checkAndFireRoutine() delegation logic:
 * - Successful delegation: owner at WIP limit, delegate found
 * - No delegate available: owner at WIP limit, only candidate also at WIP limit
 * - Delegation not allowed: owner at WIP limit, delegationAllowed=false
 */

import { randomUUID } from "node:crypto";
import { routines, sessions } from "@hyperidle/db";
import { checkAndFireRoutine } from "@hyperidle/server/routines";
import { EventBus } from "@hyperidle/shared";
import { eq, ne } from "drizzle-orm";
import {
	seedActiveSession,
	seedAgent,
	seedMinimalWorld,
	seedRoutine,
	seedTask,
	seedUserSkill,
} from "../seeding.js";
import type {
	DimensionScore,
	EvalScenario,
	JudgeContext,
	ScenarioSeedResult,
	SeedContext,
	TriggerContext,
	TriggerResult,
} from "../types.js";

function makeSyntheticResult(startMs: number, fired: boolean): TriggerResult {
	return {
		sessionId: randomUUID(),
		outcome: fired ? "completed" : "crashed",
		totalCostCents: 0,
		taskId: randomUUID(),
		durationMs: Date.now() - startMs,
	};
}

// ---------------------------------------------------------------------------
// del-successful-delegation
// ---------------------------------------------------------------------------

let delSuccessRoutineId = "";
let delSuccessOwnerAgentId = "";
let delSuccessDelegateAgentId = "";

const delSuccessfulDelegation: EvalScenario = {
	id: "del-successful-delegation",
	description: "Delegation: owner at WIP limit, session created with delegate's agentId",
	feature: "delegation",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "assistant",
			taskTitle: "Primary delegation task",
		});
		delSuccessOwnerAgentId = world.agentId;

		// Create a task for the delegate
		const { taskId: delegateTaskId } = await seedTask(ctx.db, {
			betId: world.betId,
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			title: "Delegate task",
		});

		// Seed delegate agent on the same team
		const { agentId: delegateId } = await seedAgent(ctx.db, {
			name: "Delegate Agent",
			role: "assistant",
			teamMembersId: world.teamMembersId,
			systemPrompt: "You are a delegate system agent.",
		});
		delSuccessDelegateAgentId = delegateId;

		// Both owner and delegate have the same skill
		await seedUserSkill(ctx.db, {
			userId: world.agentId,
			skillId: "portfolio_review",
			autonomyLevel: 3,
		});
		await seedUserSkill(ctx.db, {
			userId: delegateId,
			skillId: "portfolio_review",
			autonomyLevel: 3,
		});

		// Put owner at WIP limit (max 1 concurrent session by default)
		await seedActiveSession(ctx.db, {
			taskId: delegateTaskId,
			agentId: world.agentId,
		});

		// Create the routine for delegation
		const { taskId: routineTaskId } = await seedTask(ctx.db, {
			betId: world.betId,
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			title: "Routine trigger task",
		});

		const { routineId } = await seedRoutine(ctx.db, {
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			triggerType: "heartbeat",
			triggerConfig: { intervalSeconds: 900, taskId: routineTaskId },
			skillId: "portfolio_review",
			delegationAllowed: true,
			active: true,
		});
		delSuccessRoutineId = routineId;
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const [routine] = await ctx.db
			.select()
			.from(routines)
			.where(eq(routines.id, delSuccessRoutineId))
			.limit(1);
		if (!routine) return makeSyntheticResult(startMs, false);
		const result = await checkAndFireRoutine(ctx.db, eventBus, routine);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "routine_fired",
				label: "Delegation Routine Fired",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [routine] = await ctx.db
						.select({ lastRunAt: routines.lastRunAt })
						.from(routines)
						.where(eq(routines.id, delSuccessRoutineId))
						.limit(1);
					const fired = routine?.lastRunAt !== null && routine?.lastRunAt !== undefined;
					return {
						score: fired ? 1.0 : 0.0,
						note: fired ? undefined : "Routine did not fire",
					};
				},
			},
			{
				id: "delegate_used",
				label: "Delegate Agent Used",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// Session should be created for the delegate, not the owner
					const [delegateSession] = await ctx.db
						.select({ agentId: sessions.agentId })
						.from(sessions)
						.where(ne(sessions.agentId, delSuccessOwnerAgentId))
						.limit(1);
					const delegated = delegateSession !== undefined;
					return {
						score: delegated ? 1.0 : 0.0,
						note: delegated
							? `Delegated to agent: ${delegateSession.agentId}`
							: "No session for a different agent (delegation did not occur)",
					};
				},
			},
			{
				id: "session_agent_correct",
				label: "Session Belongs to Delegate Agent",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [newSession] = await ctx.db
						.select({ agentId: sessions.agentId })
						.from(sessions)
						.where(eq(sessions.agentId, delSuccessDelegateAgentId))
						.limit(1);
					const correct = newSession !== undefined;
					return {
						score: correct ? 1.0 : 0.0,
						note: correct
							? `Session agentId=${delSuccessDelegateAgentId} (delegate)`
							: "No session for the specific delegate agent",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// del-no-delegate-available
// ---------------------------------------------------------------------------

let delNoDelegateRoutineId = "";

const delNoDelegateAvailable: EvalScenario = {
	id: "del-no-delegate-available",
	description: "No delegate: owner at WIP limit, only candidate also at WIP limit",
	feature: "delegation",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "assistant",
			taskTitle: "No delegate available task",
		});

		// Seed delegate agent
		const { taskId: ownerBlockingTaskId } = await seedTask(ctx.db, {
			betId: world.betId,
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			title: "Owner blocking task",
		});
		const { agentId: candidateId } = await seedAgent(ctx.db, {
			name: "Candidate Agent",
			role: "assistant",
			teamMembersId: world.teamMembersId,
		});
		const { taskId: candidateTaskId } = await seedTask(ctx.db, {
			betId: world.betId,
			teamId: world.teamId,
			ownerAgentId: candidateId,
			title: "Candidate blocking task",
		});

		// Both have the skill
		await seedUserSkill(ctx.db, { userId: world.agentId, skillId: "analytics", autonomyLevel: 2 });
		await seedUserSkill(ctx.db, { userId: candidateId, skillId: "analytics", autonomyLevel: 2 });

		// Both at WIP limit
		await seedActiveSession(ctx.db, { taskId: ownerBlockingTaskId, agentId: world.agentId });
		await seedActiveSession(ctx.db, { taskId: candidateTaskId, agentId: candidateId });

		const { taskId: routineTaskId } = await seedTask(ctx.db, {
			betId: world.betId,
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			title: "Deferred routine task",
		});
		const { routineId } = await seedRoutine(ctx.db, {
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			triggerType: "heartbeat",
			triggerConfig: { intervalSeconds: 900, taskId: routineTaskId },
			skillId: "analytics",
			delegationAllowed: true,
			active: true,
		});
		delNoDelegateRoutineId = routineId;
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const [routine] = await ctx.db
			.select()
			.from(routines)
			.where(eq(routines.id, delNoDelegateRoutineId))
			.limit(1);
		if (!routine) return makeSyntheticResult(startMs, false);
		const result = await checkAndFireRoutine(ctx.db, eventBus, routine);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "routine_not_fired",
				label: "Routine Not Fired (No Delegate Available)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [routine] = await ctx.db
						.select({ lastRunAt: routines.lastRunAt })
						.from(routines)
						.where(eq(routines.id, delNoDelegateRoutineId))
						.limit(1);
					const notFired = routine?.lastRunAt === null || routine?.lastRunAt === undefined;
					return {
						score: notFired ? 1.0 : 0.0,
						note: notFired
							? "Routine deferred (correct — no delegate available)"
							: "Routine fired despite no available delegate",
					};
				},
			},
			{
				id: "deferred_reason",
				label: "Deferred with Correct Reason",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const eventBus = new EventBus();
					const [routine] = await ctx.db
						.select()
						.from(routines)
						.where(eq(routines.id, delNoDelegateRoutineId))
						.limit(1);
					if (!routine) return { score: 0.0, note: "Routine not found" };
					const result = await checkAndFireRoutine(ctx.db, eventBus, routine);
					if (result.fired) {
						return { score: 0.0, note: "Routine fired when it should have been deferred" };
					}
					const correct =
						(result as { reason: string }).reason === "owner at WIP limit, no delegate available";
					return {
						score: correct ? 1.0 : 0.0,
						note: correct ? undefined : `Reason: "${(result as { reason: string }).reason}"`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// del-delegation-not-allowed
// ---------------------------------------------------------------------------

let delNotAllowedRoutineId = "";

const delDelegationNotAllowed: EvalScenario = {
	id: "del-delegation-not-allowed",
	description: "Delegation disabled: owner at WIP limit but delegationAllowed=false",
	feature: "delegation",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "facilitator", // @lore AD8c: renamed from practice_facilitator
			taskTitle: "Delegation disabled task",
		});
		const { taskId: blockingTaskId } = await seedTask(ctx.db, {
			betId: world.betId,
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			title: "Blocking task",
		});
		// Owner at WIP limit
		await seedActiveSession(ctx.db, { taskId: blockingTaskId, agentId: world.agentId });

		const { taskId: routineTaskId } = await seedTask(ctx.db, {
			betId: world.betId,
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			title: "Delegation-disabled routine task",
		});
		const { routineId } = await seedRoutine(ctx.db, {
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			triggerType: "heartbeat",
			triggerConfig: { intervalSeconds: 900, taskId: routineTaskId },
			skillId: "facilitation",
			delegationAllowed: false, // delegation disabled
			active: true,
		});
		delNotAllowedRoutineId = routineId;
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const [routine] = await ctx.db
			.select()
			.from(routines)
			.where(eq(routines.id, delNotAllowedRoutineId))
			.limit(1);
		if (!routine) return makeSyntheticResult(startMs, false);
		const result = await checkAndFireRoutine(ctx.db, eventBus, routine);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "routine_not_fired",
				label: "Routine Not Fired (Delegation Not Allowed)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [routine] = await ctx.db
						.select({ lastRunAt: routines.lastRunAt })
						.from(routines)
						.where(eq(routines.id, delNotAllowedRoutineId))
						.limit(1);
					const notFired = routine?.lastRunAt === null || routine?.lastRunAt === undefined;
					return {
						score: notFired ? 1.0 : 0.0,
						note: notFired
							? "Routine deferred (correct — delegation not allowed)"
							: "Routine fired despite delegationAllowed=false",
					};
				},
			},
			{
				id: "deferred_reason",
				label: "Deferred with Correct Reason (Delegation Not Allowed)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const eventBus = new EventBus();
					const [routine] = await ctx.db
						.select()
						.from(routines)
						.where(eq(routines.id, delNotAllowedRoutineId))
						.limit(1);
					if (!routine) return { score: 0.0, note: "Routine not found" };
					const result = await checkAndFireRoutine(ctx.db, eventBus, routine);
					if (result.fired) {
						return { score: 0.0, note: "Routine fired" };
					}
					const correct =
						(result as { reason: string }).reason === "owner at WIP limit, delegation not allowed";
					return {
						score: correct ? 1.0 : 0.0,
						note: correct ? undefined : `Reason: "${(result as { reason: string }).reason}"`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const delegationScenarios: EvalScenario[] = [
	delSuccessfulDelegation,
	delNoDelegateAvailable,
	delDelegationNotAllowed,
];
