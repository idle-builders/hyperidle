/**
 * BC5 T7b: the routine scheduler's eval coverage, converted to a schedule
 * subscription.
 *
 * @lore BC5 T7b: the four routine variants this file used to cover
 * (heartbeat, calendar, humanReview, silent) collapse to one — `heartbeat`/
 * `continuous` triggers and the `humanReview`/`silent` flags have no
 * subscription analogue (a subscription fires on exactly one of `event`/
 * `schedule`, and every wake is unconditional — there is no delegate or
 * review-gate concept left to flag). What survives is the calendar case,
 * renamed: a due schedule subscription fires, records a `subscription_run`
 * intent for its owner, and advances its own `nextRunAt` from the cron
 * expression.
 *
 * @lore AU21 Increment 14a: the `rs-cost-cap-blocked` scenario (and the cost
 * cap it exercised) is deleted along with the rest of the cost feature.
 */

import { randomUUID } from "node:crypto";
import { agentWorkIntents, subscriptions } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { buildEvalAgentOrchestrationPort } from "../agent-orchestration-fixture.js";
import { seedMinimalWorld, seedSubscription } from "../seeding.js";
import { fireSubscription } from "../subscription-trigger.js";
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

let scheduleSubscriptionId = "";
let scheduleSubscriptionOwnerId = "";

const rsScheduleFire: EvalScenario = {
	id: "rs-schedule-fire",
	description:
		"Schedule subscription fires: a subscription_run intent is recorded and nextRunAt advances from the cron expression",
	feature: "routine_sessions",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "facilitator", // @lore AD8c: renamed from practice_facilitator
			taskTitle: "Weekly practice meeting task",
		});

		// Cron for every minute — always past due, fires immediately.
		const { subscriptionId } = await seedSubscription(ctx.db, {
			userId: world.agentId,
			schedule: "* * * * *",
			nextRunAt: new Date(Date.now() - 60_000).toISOString(),
		});
		scheduleSubscriptionId = subscriptionId;
		scheduleSubscriptionOwnerId = world.agentId;
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const agentOrchestration = await buildEvalAgentOrchestrationPort(ctx.db, eventBus);
		const result = await fireSubscription(
			ctx.db,
			eventBus,
			agentOrchestration,
			scheduleSubscriptionId,
		);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "intent_recorded",
				label: "subscription_run Intent Recorded",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// `sourceId` carries the fired-at instant, so match by owner
					// rather than the full string.
					const owned = await ctx.db
						.select({ id: agentWorkIntents.id })
						.from(agentWorkIntents)
						.where(eq(agentWorkIntents.requestedBy, scheduleSubscriptionOwnerId));
					const recorded = owned.length > 0;
					return {
						score: recorded ? 1.0 : 0.0,
						note: recorded ? undefined : "No subscription_run intent recorded for the owner",
					};
				},
			},
			{
				id: "next_run_advanced",
				label: "Subscription nextRunAt Advanced",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [sub] = await ctx.db
						.select({ nextRunAt: subscriptions.nextRunAt })
						.from(subscriptions)
						.where(eq(subscriptions.id, scheduleSubscriptionId))
						.limit(1);
					if (!sub) return { score: 0.0, note: "Subscription row not found" };
					const advanced = sub.nextRunAt !== null && new Date(sub.nextRunAt).getTime() > Date.now();
					return {
						score: advanced ? 1.0 : 0.0,
						note: advanced ? `nextRunAt: ${sub.nextRunAt}` : "nextRunAt not advanced into the future",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const routineSessionsScenarios: EvalScenario[] = [rsScheduleFire];
