/**
 * X8: Delegation scenarios (interaction 24).
 *
 * AU15: routine agent-selection (owner-WIP evaluation + delegate resolution)
 * moved from fire-time `checkAndFireRoutine` (Core) to drain-time
 * `resolveAuthoritativeInput` (Agent Layer, `agent-work-intent-worker.ts`).
 * `checkAndFireRoutine` no longer evaluates WIP/delegation at all — it
 * always fires (records a run + intent) once the coalescing/cost-cap guards
 * clear, regardless of owner WIP. The actual delegate/owner selection is
 * proven by the real service-integration suite
 * (`agent-work-intent-worker.routine-selection.integration.test.ts`), not
 * this eval — `packages/server/src/routines.ts`'s curated cross-package seam
 * exports exactly `{checkAndFireRoutine, provisionTeamRoutines,
 * runBuiltinRoutine}` (au11-guard zero-allowlist), so `drainAgentWorkIntents`
 * is not reachable from here. These scenarios instead honestly assert what
 * IS observable at this fire-time-only layer: the routine fires and records
 * a durable `routine_run` intent every time (never a fire-time WIP skip),
 * and the intent's `requestedBy` is only ever the owner-hint (never a
 * fire-time-resolved delegate) — proving the fire-time selection channel is
 * genuinely closed.
 *
 * Old semantics (pre-AU15, no longer true): owner-at-WIP-no-delegate /
 * delegation-not-allowed used to SKIP the occurrence at fire-time. AU15
 * intentionally changes this to DEFER (architecture §9, "skip→defer
 * semantic change") — the routine still fires and records a run; a
 * genuinely-blocked owner/delegate pair defers via drain-time WIP retry
 * (session-provisioning.ts's ConcurrencyLimitError), not a fire-time skip.
 */

import { randomUUID } from "node:crypto";
import { agentWorkIntents, routineRuns, routines } from "@hyperidle/db";
import { checkAndFireRoutine } from "@hyperidle/agent-layer/routines";
import { EventBus } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
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

/** AU15: dummy runtimeDeps — checkAndFireRoutine only checks truthiness to
 * pass the "agent session request runtime unavailable" guard; it never
 * dereferences adapterPool/workspace at fire-time (session provisioning
 * happens later, at drain + hand-off). */
const RUNTIME_DEPS = { adapterPool: {}, workspace: {}, sandboxBasePath: "/tmp/eval-delegation" };

function makeSyntheticResult(startMs: number, fired: boolean): TriggerResult {
	return {
		sessionId: randomUUID(),
		outcome: fired ? "completed" : "crashed",
		totalCostCents: 0,
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
		"AU15: owner at WIP limit still fires at fire-time (records a run + intent); delegate resolution moved to drain-time (not observable from this eval — see the real integration suite).",
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
		const result = await checkAndFireRoutine(ctx.db, eventBus, routine, RUNTIME_DEPS);
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
				label: "Intent Recorded With Owner Hint (delegate resolution deferred to drain)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const requestedBy = await recordedIntentRequestedBy(ctx, delSuccessRoutineId);
					// The fire-time hint is always the owner now — the drain resolver
					// (agent-work-intent-worker.ts) is the only place that ever picks
					// the delegate. This proves the fire-time selection channel is closed.
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
		const result = await checkAndFireRoutine(ctx.db, eventBus, routine, RUNTIME_DEPS);
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
// del-delegation-not-allowed-defers
// ---------------------------------------------------------------------------

let delNotAllowedRoutineId = "";

const delDelegationNotAllowed: EvalScenario = {
	id: "del-delegation-not-allowed-defers",
	description:
		"AU15 skip→defer semantic change: owner at WIP limit with delegationAllowed=false no longer skips the occurrence at fire-time — it fires and records a run (fire-time no longer evaluates delegation at all).",
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
		const result = await checkAndFireRoutine(ctx.db, eventBus, routine, RUNTIME_DEPS);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "routine_fires_regardless_of_delegation_flag",
				label: "Routine Fires Regardless of delegationAllowed (fire-time no longer reads it)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [routine] = await ctx.db
						.select({ lastRunAt: routines.lastRunAt })
						.from(routines)
						.where(eq(routines.id, delNotAllowedRoutineId))
						.limit(1);
					const fired = routine?.lastRunAt !== null && routine?.lastRunAt !== undefined;
					return {
						score: fired ? 1.0 : 0.0,
						note: fired
							? undefined
							: "Routine did not fire (expected fire — delegationAllowed is drain-time only now)",
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
