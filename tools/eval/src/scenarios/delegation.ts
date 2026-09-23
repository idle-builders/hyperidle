/**
 * X8: Delegation scenarios (interaction 24) — BC5 T7b retired the premise.
 *
 * @lore AU15/AU30: routine delegation never resolved a delegate at
 * fire-time already (`resolveRoutineRunRequest` always targeted
 * `routine.ownerAgentId`); these scenarios only ever proved that a WIP-full
 * owner still fires and that the intent names the owner, never that a
 * delegate is picked.
 *
 * @lore BC5 T7b: a subscription carries no WIP gate, no coalescing "running
 * run" row (`routine_runs` is dropped whole) and no delegate concept at
 * all — `resolveSubscriptionWakeRequest` always targets the subscription's
 * own `userId`, unconditionally, the same as the routine it replaces did in
 * practice. What is left worth proving is that unconditional targeting:
 * regardless of the owner's WIP, the recorded `subscription_run` intent
 * names the subscriber, never anyone else.
 */

import { randomUUID } from "node:crypto";
import { agentWorkIntents } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { buildEvalAgentOrchestrationPort } from "../agent-orchestration-fixture.js";
import { seedActiveSession, seedMinimalWorld, seedSubscription, seedTask } from "../seeding.js";
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

let delSuccessSubscriptionId = "";
let delSuccessOwnerAgentId = "";

const delSuccessfulDelegation: EvalScenario = {
	id: "del-successful-delegation",
	description:
		"Owner at WIP limit still fires (records a subscription_run intent), and the recorded intent names the owner. There is no delegate resolution anywhere: a subscription's wake always targets its own userId.",
	feature: "delegation",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "assistant",
			taskTitle: "Primary delegation task",
		});
		delSuccessOwnerAgentId = world.agentId;

		// Put the owner at WIP limit (max 1 concurrent session by default).
		const { taskId: blockingTaskId } = await seedTask(ctx.db, {
			parentTaskId: world.rootTaskId,
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			title: "Owner blocking task",
		});
		await seedActiveSession(ctx.db, { taskId: blockingTaskId, agentId: world.agentId });

		const { subscriptionId } = await seedSubscription(ctx.db, {
			userId: world.agentId,
			schedule: "* * * * *",
			nextRunAt: new Date(Date.now() - 60_000).toISOString(),
		});
		delSuccessSubscriptionId = subscriptionId;
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
			delSuccessSubscriptionId,
		);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "intent_recorded_owner_hint",
				label: "Intent Recorded With Owner (no delegate selection exists)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [intent] = await ctx.db
						.select({ requestedBy: agentWorkIntents.requestedBy })
						.from(agentWorkIntents)
						.where(eq(agentWorkIntents.requestedBy, delSuccessOwnerAgentId))
						.limit(1);
					const correct = intent !== undefined;
					return {
						score: correct ? 1.0 : 0.0,
						note: correct
							? undefined
							: `Expected a subscription_run intent requestedBy the owner (${delSuccessOwnerAgentId})`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// del-owner-wip-no-delegate-defers — RETIRED (BC5 T7b)
//
// This scenario proved a routine fires-and-defers (never skips) when both
// the owner and a candidate delegate are WIP-full. A subscription has no
// delegate candidate to begin with — `del-successful-delegation` above
// already covers "fires regardless of owner WIP" for the one target a
// subscription ever has.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// del-delegation-not-allowed-defers — RETIRED (BA1 D11)
//
// `routines.delegation_allowed` is dropped: it was written by
// `provisionTeamRoutines`, rendered nowhere, read by no scheduler branch, and
// its only documented mechanism (skill-based delegation) never existed —
// the skill column is what D1 removes. This scenario's own label was
// "Routine Fires Regardless of delegationAllowed (fire-time no longer reads
// it)" — an eval asserting the flag is inert corroborates deleting it rather
// than opposing it.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const delegationScenarios: EvalScenario[] = [delSuccessfulDelegation];
