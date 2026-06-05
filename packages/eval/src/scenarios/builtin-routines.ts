/**
 * X8: Builtin routines scenarios (interaction 21).
 *
 * These scenarios test the 5 builtin routines by calling runBuiltinRoutine() directly.
 * They do NOT use runEvalSession — routines bypass the session lifecycle.
 * Trigger functions return synthetic TriggerResult with sessionId=uuid, cost=0.
 *
 * @lore X8 W2: Cost sentinel uses "cost_cap" and "cost_actual" keys (not "factory_cost_cap_minor").
 * @lore X8 W3: Builtin routine rows must be seeded before calling runBuiltinRoutine().
 */

import { randomUUID } from "node:crypto";
import { items, knowledgeStrategyFabric } from "@hyperidle/db";
import {
	clearBuiltinCostSentinelCache,
	runBuiltinRoutine,
	seedBuiltinRoutines,
} from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { and, eq, isNotNull, like } from "drizzle-orm";
import { judgeReviewItemCreated, judgeRoutineFired, judgeStaleItemsMarked } from "../judges.js";
import { seedBet, seedBuiltinAgents, seedFactorySettings, seedMinimalWorld } from "../seeding.js";
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
// Shared trigger helper for builtin routines (no real session)
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
// br-cost-sentinel-warning
// ---------------------------------------------------------------------------

let costSentinelWarningSeedResult: ScenarioSeedResult & {
	founderId: string;
	teamMembersId: string;
};

const brCostSentinelWarning: EvalScenario = {
	id: "br-cost-sentinel-warning",
	description: "Cost sentinel: factory cost at 85% of cap — warning event emitted",
	feature: "builtin_routines",
	tags: ["quick"],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		costSentinelWarningSeedResult = await seedMinimalWorld(ctx.db);
		// W2: use "cost_cap" and "cost_actual" keys (what builtin-routines.ts reads)
		await seedFactorySettings(ctx.db, {
			cost_cap: "10000",
			cost_actual: "8500", // 85% → warning
		});
		// Seed builtin agent stubs before routines (FK: routines.ownerAgentId → users.id)
		await seedBuiltinAgents(ctx.db);
		// Seed the routine row itself (W3)
		await seedBuiltinRoutines(ctx.db);
		// Reset in-memory sentinel cache so level transition fires
		clearBuiltinCostSentinelCache();
		return costSentinelWarningSeedResult;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:cost-sentinel");
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			judgeRoutineFired("builtin:cost-sentinel"),
			{
				id: "warning_emitted",
				label: "Cost Warning Event Emitted",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const eventBus = new EventBus();
					clearBuiltinCostSentinelCache();
					const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:cost-sentinel");
					if (!result.fired) {
						return { score: 0.0, note: "Routine did not fire" };
					}
					const emitted = result.emitted ?? [];
					const warned = emitted.includes("cost_cap_warning");
					return {
						score: warned ? 1.0 : 0.0,
						note: warned ? undefined : `Emitted: [${emitted.join(", ")}]`,
					};
				},
			},
			{
				id: "no_breach_emitted",
				label: "No Breach Event Emitted",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const eventBus = new EventBus();
					clearBuiltinCostSentinelCache();
					const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:cost-sentinel");
					if (!result.fired) return { score: 0.5, note: "Routine did not fire" };
					const emitted = result.emitted ?? [];
					const noBreach = !emitted.includes("cost_cap_breached");
					return {
						score: noBreach ? 1.0 : 0.0,
						note: noBreach ? undefined : "Breach event was emitted at 85% (should be warning only)",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// br-cost-sentinel-breach
// ---------------------------------------------------------------------------

const brCostSentinelBreach: EvalScenario = {
	id: "br-cost-sentinel-breach",
	description: "Cost sentinel: factory cost at 105% of cap — breach event emitted",
	feature: "builtin_routines",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db);
		await seedFactorySettings(ctx.db, {
			cost_cap: "10000",
			cost_actual: "10500", // 105% → breach
		});
		await seedBuiltinAgents(ctx.db);
		await seedBuiltinRoutines(ctx.db);
		clearBuiltinCostSentinelCache();
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:cost-sentinel");
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			judgeRoutineFired("builtin:cost-sentinel"),
			{
				id: "breach_emitted",
				label: "Cost Breach Event Emitted",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const eventBus = new EventBus();
					clearBuiltinCostSentinelCache();
					const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:cost-sentinel");
					if (!result.fired) return { score: 0.0, note: "Routine did not fire" };
					const emitted = result.emitted ?? [];
					const breached = emitted.includes("cost_cap_breached");
					return {
						score: breached ? 1.0 : 0.0,
						note: breached ? undefined : `Emitted: [${emitted.join(", ")}]`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// br-cost-sentinel-ok
// ---------------------------------------------------------------------------

const brCostSentinelOk: EvalScenario = {
	id: "br-cost-sentinel-ok",
	description: "Cost sentinel: factory cost at 50% of cap — no events emitted",
	feature: "builtin_routines",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db);
		await seedFactorySettings(ctx.db, {
			cost_cap: "10000",
			cost_actual: "5000", // 50% → ok
		});
		await seedBuiltinAgents(ctx.db);
		await seedBuiltinRoutines(ctx.db);
		clearBuiltinCostSentinelCache();
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:cost-sentinel");
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			judgeRoutineFired("builtin:cost-sentinel"),
			{
				id: "no_events_emitted",
				label: "No Events Emitted at OK Level",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const eventBus = new EventBus();
					clearBuiltinCostSentinelCache();
					const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:cost-sentinel");
					if (!result.fired) return { score: 0.0, note: "Routine did not fire" };
					const emitted = result.emitted ?? [];
					const noEvents = emitted.length === 0;
					return {
						score: noEvents ? 1.0 : 0.0,
						note: noEvents ? undefined : `Events emitted at 50% level: [${emitted.join(", ")}]`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// br-practice-meeting
// ---------------------------------------------------------------------------

const brPracticeMeeting: EvalScenario = {
	id: "br-practice-meeting",
	description: "Practice meeting routine: creates knowledge anchor with meta.role",
	feature: "builtin_routines",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db);
		await seedBuiltinAgents(ctx.db);
		await seedBuiltinRoutines(ctx.db);
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:practice-meeting");
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			judgeRoutineFired("builtin:practice-meeting"),
			{
				id: "meeting_anchor_created",
				label: "Practice Meeting Anchor Created",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// createPracticeMeeting creates a knowledgeStrategyFabric row with meta containing role=practice_meeting_anchor
					const [fabric] = await ctx.db
						.select({ meta: knowledgeStrategyFabric.meta, kind: knowledgeStrategyFabric.kind })
						.from(knowledgeStrategyFabric)
						.where(
							and(
								isNotNull(knowledgeStrategyFabric.meta),
								like(knowledgeStrategyFabric.meta, "%practice_meeting%"),
							),
						)
						.limit(1);

					const created = fabric !== undefined;
					return {
						score: created ? 1.0 : 0.0,
						note: created
							? `Meeting anchor meta: ${fabric.meta}`
							: "No knowledgeStrategyFabric row with practice_meeting meta found",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// br-post-bet-retro-fired
// ---------------------------------------------------------------------------

let postBetRetroFiredBetId = "";

const brPostBetRetroFired: EvalScenario = {
	id: "br-post-bet-retro-fired",
	description: "Post-bet retro: creates review item with bet hypothesis",
	feature: "builtin_routines",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db);
		// Update the bet with a completed status and hypothesis
		const { betId } = await seedBet(ctx.db, {
			betId: randomUUID(),
			teamId: world.teamId,
			description: "DevOps infrastructure migration",
			doneCondition: "All services migrated to new infrastructure",
			status: "completed",
			hypothesis: "Migrating to Kubernetes will reduce operational overhead by 30%",
		});
		postBetRetroFiredBetId = betId;
		await seedBuiltinAgents(ctx.db);
		await seedBuiltinRoutines(ctx.db);
		return { ...world, betId };
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:post-bet-retro", {
			betId: postBetRetroFiredBetId,
		});
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			judgeRoutineFired("builtin:post-bet-retro"),
			judgeReviewItemCreated(),
			{
				id: "hypothesis_present",
				label: "Hypothesis Present in Review Item",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ body: items.body })
						.from(items)
						.where(and(eq(items.kind, "review"), like(items.body ?? "", "%Kubernetes%")))
						.limit(1);

					const present = item !== undefined;
					return {
						score: present ? 1.0 : 0.0,
						note: present
							? "Review item body contains hypothesis"
							: "Review item body does not contain the hypothesis text",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// br-post-bet-retro-dedup
// ---------------------------------------------------------------------------

let postBetRetroDedupBetId = "";

const brPostBetRetroDedup: EvalScenario = {
	id: "br-post-bet-retro-dedup",
	description: "Post-bet retro dedup: returns already-retroed when retro item already exists",
	feature: "builtin_routines",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db);
		const { betId } = await seedBet(ctx.db, {
			betId: randomUUID(),
			teamId: world.teamId,
			description: "Marketing campaign launch",
			status: "completed",
			hypothesis: "Campaign will increase conversions by 15%",
		});
		postBetRetroDedupBetId = betId;
		await seedBuiltinAgents(ctx.db);
		await seedBuiltinRoutines(ctx.db);

		// Seed first retro to trigger dedup on second call
		const { runBuiltinRoutine: run } = await import("@hyperidle/fabric");
		const eventBus = new EventBus();
		await run(ctx.db, eventBus, "builtin:post-bet-retro", { betId });

		return { ...world, betId };
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		// Second call — should dedup
		const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:post-bet-retro", {
			betId: postBetRetroDedupBetId,
		});
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			{
				id: "routine_not_fired",
				label: "Routine Not Fired (dedup)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const eventBus = new EventBus();
					const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:post-bet-retro", {
						betId: postBetRetroDedupBetId,
					});
					const notFired = !result.fired;
					return {
						score: notFired ? 1.0 : 0.0,
						note: notFired
							? `Correctly not fired: ${result.fired ? "" : (result as { reason: string }).reason}`
							: "Retro fired again despite existing retro item (dedup failed)",
					};
				},
			},
			{
				id: "dedup_reason",
				label: "Dedup Reason Correct",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const eventBus = new EventBus();
					const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:post-bet-retro", {
						betId: postBetRetroDedupBetId,
					});
					if (result.fired) {
						return { score: 0.0, note: "Routine fired when it should have been deduped" };
					}
					const correct = (result as { reason: string }).reason === "already-retroed";
					return {
						score: correct ? 1.0 : 0.0,
						note: correct
							? undefined
							: `Reason: "${(result as { reason: string }).reason}" (expected "already-retroed")`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// br-portfolio-retro
// ---------------------------------------------------------------------------

const brPortfolioRetro: EvalScenario = {
	id: "br-portfolio-retro",
	description: "Portfolio retro: creates review item with knowledge summary",
	feature: "builtin_routines",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db);
		await seedBuiltinAgents(ctx.db);
		await seedBuiltinRoutines(ctx.db);

		// Seed some L3/L4 knowledge items updated recently
		const { knowledgeItems: ki, knowledgeStrategyFabric: ksf } = await import("@hyperidle/db");
		const now = new Date().toISOString();
		for (let i = 0; i < 3; i++) {
			const itemId = randomUUID();
			await ctx.db.insert(ki).values({
				id: itemId,
				scopeKind: "factory",
				title: `Pattern ${i + 1}: CI/CD best practice`,
				body: `Knowledge item ${i + 1} body`,
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: `user:${world.founderId}`,
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.insert(ksf).values({
				id: randomUUID(),
				knowledgeItemId: itemId,
				layer: i < 2 ? "L3" : "L4",
				kind: "pattern",
			});
		}
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:portfolio-retro");
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			judgeRoutineFired("builtin:portfolio-retro"),
			judgeReviewItemCreated(),
			{
				id: "knowledge_summary_present",
				label: "Knowledge Summary in Review Item",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ id: items.id, body: items.body })
						.from(items)
						.where(eq(items.kind, "review"))
						.limit(1);

					if (!item?.body) {
						return { score: 0.0, note: "No review item with body found" };
					}

					// Portfolio retro body should mention knowledge or patterns
					const hasKnowledgeSummary =
						item.body.toLowerCase().includes("knowledge") ||
						item.body.toLowerCase().includes("pattern") ||
						item.body.toLowerCase().includes("item");
					return {
						score: hasKnowledgeSummary ? 1.0 : 0.5,
						note: hasKnowledgeSummary
							? "Review item body contains knowledge summary"
							: "Review item exists but lacks knowledge summary keywords",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// br-knowledge-decay
// ---------------------------------------------------------------------------

const brKnowledgeDecay: EvalScenario = {
	id: "br-knowledge-decay",
	description: "Knowledge decay: marks stale knowledge items",
	feature: "builtin_routines",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db);
		await seedBuiltinAgents(ctx.db);
		await seedBuiltinRoutines(ctx.db);

		// Seed old knowledge items (180+ days ago = stale)
		const { knowledgeItems: ki, knowledgeStrategyFabric: ksf } = await import("@hyperidle/db");
		const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
		for (let i = 0; i < 2; i++) {
			const itemId = randomUUID();
			await ctx.db.insert(ki).values({
				id: itemId,
				scopeKind: "factory",
				title: `Old pattern ${i + 1}`,
				body: `This pattern is now outdated and should be marked stale.`,
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: `user:${world.founderId}`,
				createdAt: oldDate,
				updatedAt: oldDate,
			});
			await ctx.db.insert(ksf).values({
				id: randomUUID(),
				knowledgeItemId: itemId,
				layer: "L2",
				kind: "pattern",
			});
		}
		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		const result = await runBuiltinRoutine(ctx.db, eventBus, "builtin:knowledge-decay");
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [judgeRoutineFired("builtin:knowledge-decay"), judgeStaleItemsMarked()],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const builtinRoutinesScenarios: EvalScenario[] = [
	brCostSentinelWarning,
	brCostSentinelBreach,
	brCostSentinelOk,
	brPracticeMeeting,
	brPostBetRetroFired,
	brPostBetRetroDedup,
	brPortfolioRetro,
	brKnowledgeDecay,
];
