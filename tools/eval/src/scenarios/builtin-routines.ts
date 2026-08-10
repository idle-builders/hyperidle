/**
 * X8: Builtin routines scenarios (interaction 21).
 *
 * These scenarios test the 4 remaining builtin routines by calling
 * fireStoredRoutine() directly. They do NOT use runEvalSession — routines
 * bypass the session lifecycle. Trigger functions return synthetic
 * TriggerResult with sessionId=uuid.
 *
 * @lore X8 W3: Builtin routine rows must be seeded before calling fireStoredRoutine().
 * @lore AU21 Increment 14a: the cost-sentinel builtin routine + its 3 eval
 * scenarios are deleted along with the rest of the cost feature — no
 * replacement.
 */

import { randomUUID } from "node:crypto";
import { fireRoutine } from "@hyperidle/core-api";
import type { HyperIdleDb } from "@hyperidle/db";
import { items, routines } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { provisionTeamRoutines } from "@hyperidle/routine";
import { and, eq, like } from "drizzle-orm";
import { buildEvalAgentOrchestrationPort } from "../agent-orchestration-fixture.js";
import { judgeReviewItemCreated, judgeRoutineFired, judgeStaleItemsMarked } from "../judges.js";

async function fireStoredRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routineId: string,
	args?: { readonly betId: string },
) {
	const [routine] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
	if (!routine) return { fired: false as const, reason: "routine not found" };
	const agentOrchestration = await buildEvalAgentOrchestrationPort(db, eventBus);
	return fireRoutine(db, eventBus, agentOrchestration, routine, { args });
}

import { seedBet, seedBuiltinAgents, seedMinimalWorld } from "../seeding.js";

// @lore AF17: per-team routine ids — eval scenarios use "prod-1" as the test team id.
// seedBuiltinRoutines (local helper) provisions with this teamId.
const EVAL_TEAM_ID = "prod-1";
const EVAL_BID = {
	postBetRetro: `builtin:post-bet-retro:${EVAL_TEAM_ID}`,
	portfolioRetro: `builtin:portfolio-retro:${EVAL_TEAM_ID}`,
	knowledgeDecay: `builtin:knowledge-decay:${EVAL_TEAM_ID}`,
	knowledgePromotion: `builtin:knowledge-promotion:${EVAL_TEAM_ID}`,
};

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

/**
 * @lore AF17: replaces seedBuiltinRoutines(db) from @hyperidle/server/app-runtime (deleted shim).
 * Inserts per-team routine rows using the factory agent stubs seeded by seedBuiltinAgents.
 * Team id defaults to "prod-1" which is what seedMinimalWorld uses via seedTeam.
 */
async function seedBuiltinRoutines(db: HyperIdleDb, teamId = "prod-1"): Promise<void> {
	await provisionTeamRoutines(db, {
		teamId,
		ownerByRole: {
			facilitator: "seed-agent-pf-facilitation",
			product_manager: "demo-agent-pm",
			assistant: "seed-agent-cos",
		},
		leadAgentId: "seed-agent-cos",
	});
}

// ---------------------------------------------------------------------------

function makeSyntheticResult(startMs: number, fired: boolean): TriggerResult {
	return {
		sessionId: randomUUID(),
		outcome: fired ? "completed" : "crashed",
		taskId: randomUUID(),
		durationMs: Date.now() - startMs,
	};
}

// @lore AU21 Increment 14a: the three cost-sentinel scenarios
// (br-cost-sentinel-warning/-breach/-ok) are deleted along with the rest of
// the cost feature — the cost_cap_warning/cost_cap_breached events, the
// factory cap, and the cost sentinel routine itself are all gone, no
// replacement.

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
		const result = await fireStoredRoutine(ctx.db, eventBus, EVAL_BID.postBetRetro, {
			betId: postBetRetroFiredBetId,
		});
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			judgeRoutineFired(EVAL_BID.postBetRetro),
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
		const eventBus = new EventBus();
		await fireStoredRoutine(ctx.db, eventBus, EVAL_BID.postBetRetro, { betId });

		return { ...world, betId };
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		const startMs = Date.now();
		const eventBus = new EventBus();
		// Second call — should dedup
		const result = await fireStoredRoutine(ctx.db, eventBus, EVAL_BID.postBetRetro, {
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
					const result = await fireStoredRoutine(ctx.db, eventBus, EVAL_BID.postBetRetro, {
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
					const result = await fireStoredRoutine(ctx.db, eventBus, EVAL_BID.postBetRetro, {
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
		const { knowledgeItems: ki, knowledgeAppProjection: ksf } = await import("@hyperidle/db");
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
		const result = await fireStoredRoutine(ctx.db, eventBus, EVAL_BID.portfolioRetro);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [
			judgeRoutineFired(EVAL_BID.portfolioRetro),
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
		const { knowledgeItems: ki, knowledgeAppProjection: ksf } = await import("@hyperidle/db");
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
		const result = await fireStoredRoutine(ctx.db, eventBus, EVAL_BID.knowledgeDecay);
		return makeSyntheticResult(startMs, result.fired);
	},
	rubric: {
		dimensions: [judgeRoutineFired(EVAL_BID.knowledgeDecay), judgeStaleItemsMarked()],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const builtinRoutinesScenarios: EvalScenario[] = [
	brPostBetRetroFired,
	brPostBetRetroDedup,
	brPortfolioRetro,
	brKnowledgeDecay,
];
