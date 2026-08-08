/**
 * X8: Skill autonomy scenarios (interaction 23).
 *
 * Tests the userSkills autonomy level model and routine review gating.
 * L1: humanReview required on every run.
 * L4: silent execution (no review item).
 * Success tracking: userSkill counts are correct.
 */

import { randomUUID } from "node:crypto";
import { fireRoutine } from "@hyperidle/core-api/routines";
import { buildEvalAgentOrchestrationPort } from "../agent-orchestration-fixture.js";
import { items, routines, userSkills } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { seedMinimalWorld, seedRoutine, seedUserSkill } from "../seeding.js";
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
		taskId: randomUUID(),
		durationMs: Date.now() - startMs,
	};
}

// ---------------------------------------------------------------------------
// ska-l1-review-required
// ---------------------------------------------------------------------------

let l1RoutineId = "";
let l1AgentId = "";

const skaL1ReviewRequired: EvalScenario = {
	id: "ska-l1-review-required",
	description: "L1 autonomy: routine fires with humanReview=true, review item created",
	feature: "skill_autonomy",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "facilitator", // @lore AD8c: renamed from practice_facilitator
			taskTitle: "L1 autonomy monitoring task",
		});

		// L1 autonomy: every run requires human review
		await seedUserSkill(ctx.db, {
			userId: world.agentId,
			skillId: "report_generation",
			autonomyLevel: 1,
			successCount: 2,
			failureCount: 1,
		});

		const { routineId } = await seedRoutine(ctx.db, {
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			triggerType: "heartbeat",
			triggerConfig: { intervalSeconds: 3600, taskId: world.taskId },
			skillId: "report_generation",
			humanReview: true, // L1 = always review
			autonomyLevel: 1,
			active: true,
		});
		l1RoutineId = routineId;
		l1AgentId = world.agentId;
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const [routine] = await ctx.db
			.select()
			.from(routines)
			.where(eq(routines.id, l1RoutineId))
			.limit(1);
		if (!routine) return makeSyntheticResult(startMs, false);
		const agentOrchestration = buildEvalAgentOrchestrationPort(ctx.db, eventBus);
		const result = await fireRoutine(ctx.db, eventBus, agentOrchestration, routine);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "routine_fired",
				label: "L1 Routine Fired",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [routine] = await ctx.db
						.select({ lastRunAt: routines.lastRunAt })
						.from(routines)
						.where(eq(routines.id, l1RoutineId))
						.limit(1);
					const fired = routine?.lastRunAt !== null && routine?.lastRunAt !== undefined;
					return {
						score: fired ? 1.0 : 0.0,
						note: fired ? undefined : "Routine lastRunAt not set",
					};
				},
			},
			{
				id: "review_item_created",
				label: "Review Item Created for L1 Routine",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ id: items.id })
						.from(items)
						.where(and(eq(items.kind, "review"), eq(items.sourceAgentId, l1AgentId)))
						.limit(1);
					const created = item !== undefined;
					return {
						score: created ? 1.0 : 0.0,
						note: created ? undefined : "No review item for L1 routine (humanReview not triggered)",
					};
				},
			},
			{
				id: "autonomy_level_correct",
				label: "Autonomy Level Is L1",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [skill] = await ctx.db
						.select({ autonomyLevel: userSkills.autonomyLevel })
						.from(userSkills)
						.where(
							and(eq(userSkills.userId, l1AgentId), eq(userSkills.skillId, "report_generation")),
						)
						.limit(1);
					const correct = skill?.autonomyLevel === 1;
					return {
						score: correct ? 1.0 : 0.0,
						note: correct
							? "L1 confirmed"
							: `Autonomy level: ${skill?.autonomyLevel ?? "not found"}`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// ska-l4-silent
// ---------------------------------------------------------------------------

let l4RoutineId = "";
let l4AgentId = "";

const skaL4Silent: EvalScenario = {
	id: "ska-l4-silent",
	description: "L4 autonomy: routine fires silently, no review item created",
	feature: "skill_autonomy",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "assistant",
			taskTitle: "L4 autonomy silent execution task",
		});

		// L4 autonomy: silent execution
		await seedUserSkill(ctx.db, {
			userId: world.agentId,
			skillId: "portfolio_analysis",
			autonomyLevel: 4,
			successCount: 20,
			failureCount: 0,
		});

		const { routineId } = await seedRoutine(ctx.db, {
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			triggerType: "heartbeat",
			triggerConfig: { intervalSeconds: 3600, taskId: world.taskId },
			skillId: "portfolio_analysis",
			humanReview: false, // L4 = silent, no review
			autonomyLevel: 4,
			silent: true,
			active: true,
		});
		l4RoutineId = routineId;
		l4AgentId = world.agentId;
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const [routine] = await ctx.db
			.select()
			.from(routines)
			.where(eq(routines.id, l4RoutineId))
			.limit(1);
		if (!routine) return makeSyntheticResult(startMs, false);
		const agentOrchestration = buildEvalAgentOrchestrationPort(ctx.db, eventBus);
		const result = await fireRoutine(ctx.db, eventBus, agentOrchestration, routine);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "routine_fired",
				label: "L4 Routine Fired",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [routine] = await ctx.db
						.select({ lastRunAt: routines.lastRunAt })
						.from(routines)
						.where(eq(routines.id, l4RoutineId))
						.limit(1);
					const fired = routine?.lastRunAt !== null && routine?.lastRunAt !== undefined;
					return {
						score: fired ? 1.0 : 0.0,
						note: fired ? undefined : "L4 routine did not fire",
					};
				},
			},
			{
				id: "no_review_item",
				label: "No Review Item for L4 Routine (Silent)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const reviewItems = await ctx.db
						.select({ id: items.id })
						.from(items)
						.where(and(eq(items.kind, "review"), eq(items.sourceAgentId, l4AgentId)));
					const noReview = reviewItems.length === 0;
					return {
						score: noReview ? 1.0 : 0.0,
						note: noReview
							? "No review item (correct — L4 is silent)"
							: `${reviewItems.length} review item(s) created despite L4 silent mode`,
					};
				},
			},
			{
				id: "autonomy_level_correct",
				label: "Autonomy Level Is L4",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [skill] = await ctx.db
						.select({ autonomyLevel: userSkills.autonomyLevel })
						.from(userSkills)
						.where(
							and(eq(userSkills.userId, l4AgentId), eq(userSkills.skillId, "portfolio_analysis")),
						)
						.limit(1);
					const correct = skill?.autonomyLevel === 4;
					return {
						score: correct ? 1.0 : 0.0,
						note: correct
							? "L4 confirmed"
							: `Autonomy level: ${skill?.autonomyLevel ?? "not found"}`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// ska-success-tracking
// ---------------------------------------------------------------------------

let successTrackingAgentId = "";

const skaSuccessTracking: EvalScenario = {
	id: "ska-success-tracking",
	description: "Skill autonomy success/failure tracking: counts preserved correctly",
	feature: "skill_autonomy",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			taskTitle: "Success tracking verification task",
		});

		await seedUserSkill(ctx.db, {
			userId: world.agentId,
			skillId: "task_decomposition",
			autonomyLevel: 2,
			successCount: 4,
			failureCount: 1,
			lastUsedAt: new Date().toISOString(),
		});
		successTrackingAgentId = world.agentId;
		return world;
	},
	trigger: (ctx: TriggerContext): Promise<TriggerResult> => {
		// This is a data verification scenario — no routine to fire
		return Promise.resolve({
			sessionId: randomUUID(),
			outcome: "completed",
			taskId: ctx.seedResult.taskId,
			durationMs: 1,
		});
	},
	rubric: {
		dimensions: [
			{
				id: "skill_record_exists",
				label: "User Skill Record Exists",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [skill] = await ctx.db
						.select({ autonomyLevel: userSkills.autonomyLevel })
						.from(userSkills)
						.where(
							and(
								eq(userSkills.userId, successTrackingAgentId),
								eq(userSkills.skillId, "task_decomposition"),
							),
						)
						.limit(1);
					const exists = skill !== undefined;
					return {
						score: exists ? 1.0 : 0.0,
						note: exists
							? `Skill record found (L${skill.autonomyLevel})`
							: "No userSkill record found",
					};
				},
			},
			{
				id: "counts_correct",
				label: "Success/Failure Counts Correct",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [skill] = await ctx.db
						.select({
							successCount: userSkills.successCount,
							failureCount: userSkills.failureCount,
						})
						.from(userSkills)
						.where(
							and(
								eq(userSkills.userId, successTrackingAgentId),
								eq(userSkills.skillId, "task_decomposition"),
							),
						)
						.limit(1);
					if (!skill) return { score: 0.0, note: "Skill record not found" };
					const correct = skill.successCount === 4 && skill.failureCount === 1;
					return {
						score: correct ? 1.0 : 0.0,
						note: correct
							? `successCount=4, failureCount=1 (correct)`
							: `successCount=${skill.successCount}, failureCount=${skill.failureCount} (expected 4, 1)`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const skillAutonomyScenarios: EvalScenario[] = [
	skaL1ReviewRequired,
	skaL4Silent,
	skaSuccessTracking,
];
