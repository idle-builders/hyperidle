/**
 * X8: Routine sessions scenarios (interaction 22).
 *
 * Tests the checkAndFireRoutine() path: heartbeat, calendar, humanReview, cost cap block.
 * All scenarios call checkAndFireRoutine() directly (no runEvalSession).
 *
 * @lore X8 CRITICAL-1: triggerConfig MUST include taskId pointing to a real tasks row.
 * @lore AU18 §4.1: cost cap check reads `server_config.cost.capMinor` (cap) and
 * `getFactoryCostActual` (= SUM(users.costActual), live total) — the old
 * `factorySettings.cost_cap`/`cost_actual` KV keys are retired.
 */

import { randomUUID } from "node:crypto";
import { checkAndFireRoutine } from "@hyperidle/agent-layer/routines";
import { updateServerConfig } from "@hyperidle/core-app";
import { items, routines, sessions } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { and, eq, isNotNull } from "drizzle-orm";
import { seedMinimalWorld, seedRoutine } from "../seeding.js";
import type {
	DimensionScore,
	EvalScenario,
	JudgeContext,
	ScenarioSeedResult,
	SeedContext,
	TriggerContext,
	TriggerResult,
} from "../types.js";

// ---------------------------------------------------------------------------
// Shared trigger helper
// ---------------------------------------------------------------------------

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
// rs-heartbeat-fire
// ---------------------------------------------------------------------------

let heartbeatRoutineId = "";
let heartbeatRoutineOwnerId = "";

const rsHeartbeatFire: EvalScenario = {
	id: "rs-heartbeat-fire",
	description: "Heartbeat routine fires: session created, timestamps updated, next_run_at computed",
	feature: "routine_sessions",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "assistant",
			taskTitle: "Heartbeat monitoring task",
		});

		const { routineId } = await seedRoutine(ctx.db, {
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			triggerType: "heartbeat",
			// CRITICAL-1: must include taskId
			triggerConfig: { intervalSeconds: 900, taskId: world.taskId },
			skillId: "monitoring",
			active: true,
		});
		heartbeatRoutineId = routineId;
		heartbeatRoutineOwnerId = world.agentId;
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const [routine] = await ctx.db
			.select()
			.from(routines)
			.where(eq(routines.id, heartbeatRoutineId))
			.limit(1);

		if (!routine) return makeSyntheticResult(startMs, false);
		const result = await checkAndFireRoutine(ctx.db, eventBus, routine);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "session_created",
				label: "Routine Session Created",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [session] = await ctx.db
						.select({ id: sessions.id, agentId: sessions.agentId })
						.from(sessions)
						.where(eq(sessions.agentId, heartbeatRoutineOwnerId))
						.limit(1);
					const created = session !== undefined;
					return {
						score: created ? 1.0 : 0.0,
						note: created ? undefined : "No session created for routine owner",
					};
				},
			},
			{
				id: "routine_timestamps_updated",
				label: "Routine lastRunAt Updated",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [routine] = await ctx.db
						.select({ lastRunAt: routines.lastRunAt, nextRunAt: routines.nextRunAt })
						.from(routines)
						.where(eq(routines.id, heartbeatRoutineId))
						.limit(1);
					if (!routine) return { score: 0.0, note: "Routine row not found" };
					const updated = routine.lastRunAt !== null;
					return {
						score: updated ? 1.0 : 0.0,
						note: updated
							? `lastRunAt: ${routine.lastRunAt}`
							: "routine.lastRunAt is null (not fired)",
					};
				},
			},
			{
				id: "next_run_computed",
				label: "Next Run At Computed",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [routine] = await ctx.db
						.select({ lastRunAt: routines.lastRunAt, nextRunAt: routines.nextRunAt })
						.from(routines)
						.where(eq(routines.id, heartbeatRoutineId))
						.limit(1);
					if (!(routine?.lastRunAt && routine.nextRunAt)) {
						return { score: 0.0, note: "nextRunAt not set" };
					}
					// nextRunAt should be lastRunAt + 900s
					const lastMs = new Date(routine.lastRunAt).getTime();
					const nextMs = new Date(routine.nextRunAt).getTime();
					const diffSeconds = (nextMs - lastMs) / 1000;
					const correct = Math.abs(diffSeconds - 900) < 5; // allow 5s tolerance
					return {
						score: correct ? 1.0 : 0.0,
						note: correct
							? `nextRunAt = lastRunAt + ${diffSeconds}s`
							: `nextRunAt offset ${diffSeconds}s (expected 900s)`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// rs-calendar-fire
// ---------------------------------------------------------------------------

let calendarRoutineId = "";
let calendarRoutineOwnerId = "";

const rsCalendarFire: EvalScenario = {
	id: "rs-calendar-fire",
	description: "Calendar routine fires: session created and nextRunAt computed from cron",
	feature: "routine_sessions",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "facilitator", // @lore AD8c: renamed from practice_facilitator
			taskTitle: "Weekly practice meeting task",
		});

		const { routineId } = await seedRoutine(ctx.db, {
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			triggerType: "calendar",
			// Cron for every minute — always past due to fire immediately
			triggerConfig: { cron: "* * * * *", taskId: world.taskId },
			skillId: "practice_meeting",
			active: true,
		});
		calendarRoutineId = routineId;
		calendarRoutineOwnerId = world.agentId;
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const [routine] = await ctx.db
			.select()
			.from(routines)
			.where(eq(routines.id, calendarRoutineId))
			.limit(1);

		if (!routine) return makeSyntheticResult(startMs, false);
		const result = await checkAndFireRoutine(ctx.db, eventBus, routine);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "session_created",
				label: "Calendar Session Created",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [session] = await ctx.db
						.select({ id: sessions.id })
						.from(sessions)
						.where(eq(sessions.agentId, calendarRoutineOwnerId))
						.limit(1);
					const created = session !== undefined;
					return {
						score: created ? 1.0 : 0.0,
						note: created ? undefined : "No session for calendar routine owner",
					};
				},
			},
			{
				id: "routine_timestamps_updated",
				label: "Calendar Routine Timestamps Updated",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [routine] = await ctx.db
						.select({ lastRunAt: routines.lastRunAt, nextRunAt: routines.nextRunAt })
						.from(routines)
						.where(eq(routines.id, calendarRoutineId))
						.limit(1);
					if (!routine) return { score: 0.0, note: "Routine not found" };
					const updated = routine.lastRunAt !== null;
					return {
						score: updated ? 1.0 : 0.0,
						note: updated ? `lastRunAt: ${routine.lastRunAt}` : "Not updated",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// rs-human-review-flag
// ---------------------------------------------------------------------------

let humanReviewRoutineId = "";
let humanReviewRoutineOwnerId = "";

const rsHumanReviewFlag: EvalScenario = {
	id: "rs-human-review-flag",
	description: "humanReview=true: both session and review item created",
	feature: "routine_sessions",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			taskTitle: "Human review monitoring task",
		});

		const { routineId } = await seedRoutine(ctx.db, {
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			triggerType: "heartbeat",
			triggerConfig: { intervalSeconds: 3600, taskId: world.taskId },
			skillId: "review_monitoring",
			humanReview: true,
			active: true,
		});
		humanReviewRoutineId = routineId;
		humanReviewRoutineOwnerId = world.agentId;
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const [routine] = await ctx.db
			.select()
			.from(routines)
			.where(eq(routines.id, humanReviewRoutineId))
			.limit(1);

		if (!routine) return makeSyntheticResult(startMs, false);
		const result = await checkAndFireRoutine(ctx.db, eventBus, routine);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "session_created",
				label: "Session Created for humanReview Routine",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [session] = await ctx.db
						.select({ id: sessions.id })
						.from(sessions)
						.where(eq(sessions.agentId, humanReviewRoutineOwnerId))
						.limit(1);
					const created = session !== undefined;
					return {
						score: created ? 1.0 : 0.0,
						note: created ? undefined : "No session for humanReview routine",
					};
				},
			},
			{
				id: "review_item_created",
				label: "Review Item Created for humanReview Routine",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ id: items.id, sourceAgentId: items.sourceAgentId })
						.from(items)
						.where(
							and(eq(items.kind, "review"), eq(items.sourceAgentId, humanReviewRoutineOwnerId)),
						)
						.limit(1);
					const created = item !== undefined;
					return {
						score: created ? 1.0 : 0.0,
						note: created ? undefined : "No review item from humanReview routine owner",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// rs-cost-cap-blocked
// ---------------------------------------------------------------------------

let costCapBlockedRoutineId = "";

const rsCostCapBlocked: EvalScenario = {
	id: "rs-cost-cap-blocked",
	description: "Cost cap reached: routine not fired, no session created",
	feature: "routine_sessions",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "assistant",
			taskTitle: "Cost-blocked routine task",
			agentCostActualMinor: 1001, // over the 1000 cap → blocked
		});

		// @lore AU18 §4.1: cap now lives at server_config.cost.capMinor (not the
		// retired factorySettings.cost_cap key); the live total is the seeded
		// agent's users.costActual above.
		await updateServerConfig(ctx.db, { cost: { capMinor: 1000 } });

		const { routineId } = await seedRoutine(ctx.db, {
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			triggerType: "heartbeat",
			triggerConfig: { intervalSeconds: 900, taskId: world.taskId },
			skillId: "monitoring",
			active: true,
		});
		costCapBlockedRoutineId = routineId;
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const [routine] = await ctx.db
			.select()
			.from(routines)
			.where(eq(routines.id, costCapBlockedRoutineId))
			.limit(1);

		if (!routine) return makeSyntheticResult(startMs, false);
		const result = await checkAndFireRoutine(ctx.db, eventBus, routine);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "session_not_created",
				label: "No Session Created When Cost Cap Reached",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const allSessions = await ctx.db
						.select({ id: sessions.id })
						.from(sessions)
						.where(isNotNull(sessions.id));
					const noSession = allSessions.length === 0;
					return {
						score: noSession ? 1.0 : 0.0,
						note: noSession
							? "No session created (correct — cost cap blocks new sessions)"
							: `${allSessions.length} session(s) found — cost cap should have blocked`,
					};
				},
			},
			{
				id: "routine_not_fired",
				label: "Routine Not Fired When Cost Cap Reached",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [routine] = await ctx.db
						.select({ lastRunAt: routines.lastRunAt })
						.from(routines)
						.where(eq(routines.id, costCapBlockedRoutineId))
						.limit(1);
					const notFired = routine?.lastRunAt === null || routine?.lastRunAt === undefined;
					return {
						score: notFired ? 1.0 : 0.0,
						note: notFired
							? "Routine correctly not fired (cost cap blocked)"
							: `Routine fired at ${routine?.lastRunAt} despite cost cap`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const routineSessionsScenarios: EvalScenario[] = [
	rsHeartbeatFire,
	rsCalendarFire,
	rsHumanReviewFlag,
	rsCostCapBlocked,
];
