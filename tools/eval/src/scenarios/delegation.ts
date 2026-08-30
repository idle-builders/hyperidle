/**
 * X8: Delegation scenarios (interaction 24).
 *
 * AU15: routine agent-selection (owner-WIP evaluation + delegate resolution)
 * moved from dispatch fire-time to drain-time
 * `resolveAuthoritativeInput` (Agent Layer, `agent-work-intent-worker.ts`).
 * `dispatchOps.fireRoutine` does not evaluate WIP/delegation — it
 * always fires (records a run + intent) once the coalescing guard clears
 * (AU21 Increment 14a: the cost-cap guard this comment used to also cite is
 * HARD-DELETED, no replacement), regardless of owner WIP.
 *
 * @lore AU30: routine DELEGATION no longer exists anywhere. `user_skills` — the
 * only input to the delegate lookup — is dropped, and with it the lookup and
 * the selection: `resolveRoutineRunRequest` now always targets
 * `routine.ownerAgentId`. The suite this header used to point at for the "real"
 * delegate/owner selection proof
 * (`agent-work-intent-worker.routine-selection.integration.test.ts`) is deleted
 * with its subject; there is no successor because there is no selection left to
 * prove. The scenarios below are UNCHANGED and still valid — they never
 * asserted that delegation occurs. They assert what remains observable at this
 * fire-time layer: the routine fires and records a durable `routine_run` intent
 * every time (never a fire-time WIP skip), and the intent's `requestedBy` is
 * only ever the owner — now by construction rather than by a closed channel.
 * The names below (`del-successful-delegation`, "Delegate Agent") are historical.
 *
 * Old semantics (pre-AU15, no longer true): owner-at-WIP-no-delegate /
 * delegation-not-allowed used to SKIP the occurrence at fire-time. AU15
 * intentionally changes this to DEFER (architecture §9, "skip→defer
 * semantic change") — the routine still fires and records a run; a
 * genuinely-blocked owner/delegate pair defers via drain-time WIP retry
 * (session-provisioning.ts's ConcurrencyLimitError), not a fire-time skip.
 */

import { randomUUID } from "node:crypto";
import { fireRoutine } from "@hyperidle/core-api";
import { agentWorkIntents, routineRuns, routines } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { and, eq } from "drizzle-orm";
import { buildEvalAgentOrchestrationPort } from "../agent-orchestration-fixture.js";
import {
	seedActiveSession,
	seedAgent,
	seedMinimalWorld,
	seedRoutine,
	seedTask,
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
		taskId: randomUUID(),
		durationMs: Date.now() - startMs,
	};
}

async function recordedIntentRequestedBy(
	ctx: JudgeContext,
	routineId: string,
): Promise<string | undefined> {
	const [run] = await ctx.db
		.select({ id: routineRuns.id })
		.from(routineRuns)
		.where(and(eq(routineRuns.routineId, routineId), eq(routineRuns.outcome, "running")))
		.limit(1);
	if (!run) return undefined;
	const [intent] = await ctx.db
		.select({ requestedBy: agentWorkIntents.requestedBy })
		.from(agentWorkIntents)
		.where(eq(agentWorkIntents.sourceId, run.id))
		.limit(1);
	return intent?.requestedBy ?? undefined;
}

// ---------------------------------------------------------------------------
// del-successful-delegation
// ---------------------------------------------------------------------------

let delSuccessRoutineId = "";
let delSuccessOwnerAgentId = "";

const delSuccessfulDelegation: EvalScenario = {
	id: "del-successful-delegation",
	description:
		"Owner at WIP limit still fires at fire-time (records a run + intent), and the recorded intent names the owner. There is no delegate resolution left anywhere: run resolution always targets the routine's owner.",
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
			parentTaskId: world.rootTaskId,
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			title: "Delegate task",
		});

		// Seed delegate agent on the same team
		await seedAgent(ctx.db, {
			name: "Delegate Agent",
			role: "assistant",
			teamId: world.teamId,
			systemPrompt: "You are a delegate system agent.",
		});

		// Put owner at WIP limit (max 1 concurrent session by default)
		await seedActiveSession(ctx.db, {
			taskId: delegateTaskId,
			agentId: world.agentId,
		});

		// Create the routine for delegation
		const { taskId: routineTaskId } = await seedTask(ctx.db, {
			parentTaskId: world.rootTaskId,
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			title: "Routine trigger task",
		});

		const { routineId } = await seedRoutine(ctx.db, {
			ownerAgentId: world.agentId,
			triggerType: "heartbeat",
			triggerConfig: { intervalSeconds: 900, taskId: routineTaskId },
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
		const agentOrchestration = await buildEvalAgentOrchestrationPort(ctx.db, eventBus);
		const result = await fireRoutine(ctx.db, eventBus, agentOrchestration, routine);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "routine_fired_despite_owner_wip",
				label: "Routine Fires Despite Owner WIP (AU15: fire-time no longer gates on WIP)",
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
				id: "intent_recorded_owner_hint",
				label: "Intent Recorded With Owner (no delegate selection exists)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const requestedBy = await recordedIntentRequestedBy(ctx, delSuccessRoutineId);
					// requestedBy is always the owner: fire-time records the owner, and
					// drain-time resolution (`resolveRoutineRunRequest`) also targets
					// `routine.ownerAgentId` unconditionally. No code path picks a delegate.
					const correct = requestedBy === delSuccessOwnerAgentId;
					return {
						score: correct ? 1.0 : 0.0,
						note: correct
							? undefined
							: `Expected fire-time requestedBy hint to be the owner (${delSuccessOwnerAgentId}), got ${requestedBy}`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// del-owner-wip-no-delegate-defers
// ---------------------------------------------------------------------------

let delNoDelegateRoutineId = "";

const delNoDelegateAvailable: EvalScenario = {
	id: "del-owner-wip-no-delegate-defers",
	description:
		"AU15 skip→defer semantic change: owner at WIP limit with no delegate available no longer skips the occurrence at fire-time — it fires and records a run; the actual defer (via provision-time ConcurrencyLimitError retry) happens beyond fire-time.",
	feature: "delegation",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "assistant",
			taskTitle: "No delegate available task",
		});

		// Seed delegate agent
		const { taskId: ownerBlockingTaskId } = await seedTask(ctx.db, {
			parentTaskId: world.rootTaskId,
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			title: "Owner blocking task",
		});
		const { agentId: candidateId } = await seedAgent(ctx.db, {
			name: "Candidate Agent",
			role: "assistant",
			teamId: world.teamId,
		});
		const { taskId: candidateTaskId } = await seedTask(ctx.db, {
			parentTaskId: world.rootTaskId,
			teamId: world.teamId,
			ownerAgentId: candidateId,
			title: "Candidate blocking task",
		});

		// Both at WIP limit
		await seedActiveSession(ctx.db, { taskId: ownerBlockingTaskId, agentId: world.agentId });
		await seedActiveSession(ctx.db, { taskId: candidateTaskId, agentId: candidateId });

		const { taskId: routineTaskId } = await seedTask(ctx.db, {
			parentTaskId: world.rootTaskId,
			teamId: world.teamId,
			ownerAgentId: world.agentId,
			title: "Deferred routine task",
		});
		const { routineId } = await seedRoutine(ctx.db, {
			ownerAgentId: world.agentId,
			triggerType: "heartbeat",
			triggerConfig: { intervalSeconds: 900, taskId: routineTaskId },
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
		const agentOrchestration = await buildEvalAgentOrchestrationPort(ctx.db, eventBus);
		const result = await fireRoutine(ctx.db, eventBus, agentOrchestration, routine);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "routine_fires_and_defers_not_skips",
				label: "Routine Fires And Defers (No Delegate Available) — AU15 skip→defer",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [routine] = await ctx.db
						.select({ lastRunAt: routines.lastRunAt })
						.from(routines)
						.where(eq(routines.id, delNoDelegateRoutineId))
						.limit(1);
					const fired = routine?.lastRunAt !== null && routine?.lastRunAt !== undefined;
					return {
						score: fired ? 1.0 : 0.0,
						note: fired ? undefined : "Routine did not fire (expected fire-and-defer, not skip)",
					};
				},
			},
			{
				id: "single_running_run_no_pileup",
				label: "Exactly One Running Run Recorded (coalescing prevents pileup)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const runs = await ctx.db
						.select({ outcome: routineRuns.outcome })
						.from(routineRuns)
						.where(eq(routineRuns.routineId, delNoDelegateRoutineId));
					const running = runs.filter((r) => r.outcome === "running");
					const correct = running.length === 1;
					return {
						score: correct ? 1.0 : 0.0,
						note: correct ? undefined : `Expected 1 running run, found ${running.length}`,
					};
				},
			},
		],
	},
};

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

export const delegationScenarios: EvalScenario[] = [
	delSuccessfulDelegation,
	delNoDelegateAvailable,
];
