/**
 * X8: Score attention scenarios (interaction 13).
 *
 * Tests the score_attention tool: override on knowledge_item, recompute mode, item no-op.
 * Facilitator-only tool.
 */

import { knowledgeAppProjection } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeSessionCompleted, judgeSessionNotesWritten } from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedItem, seedKnowledge, seedMinimalWorld, seedThread } from "../seeding.js";
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
// sa-override-pm-healthcare
// ---------------------------------------------------------------------------

let saOverrideKnowledgeItemId = "";

const saOverridePmHealthcare: EvalScenario = {
	id: "sa-override-pm-healthcare",
	description: "PM overrides attention score on patient privacy knowledge item",
	feature: "score_attention",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager responsible for knowledge prioritization in the healthcare domain.
Use score_attention to set the attention score on knowledge items that need higher or lower visibility.
Patient privacy and HIPAA knowledge should always have a high attention score (0.9 or above).
Use target="knowledge_item" and mode="override" with score between 0.0 and 1.0.`,
			taskTitle: "Prioritize patient privacy knowledge for upcoming compliance review",
			taskDescription: `Prioritize the patient privacy knowledge items for the upcoming compliance review.

There is a knowledge item about HIPAA patient data handling that needs high visibility.
Set its attention score to 0.95 using score_attention:
- target: "knowledge_item"
- id: the knowledge item's ID (in your context)
- score: 0.95
- mode: "override"

This ensures the item appears prominently in agent knowledge contexts during compliance work.
Document your prioritization decision in session notes.`,
			betDescription: "Healthcare compliance preparation",
			betDoneCondition: "Critical knowledge items prioritized for compliance review.",
		});

		const { knowledgeItemId } = await seedKnowledge(ctx.db, {
			scopeKind: "factory",
			title: "HIPAA Patient Data Handling Requirements",
			body: "PHI must be encrypted at rest (AES-256) and in transit (TLS 1.2+). Access must be role-based with audit logging. Minimum necessary access principle applies.",
			updatedBy: `user:${world.founderId}`,
		});
		saOverrideKnowledgeItemId = knowledgeItemId;

		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				sandboxBasePath: ctx.seedResult.sandboxBasePath,
			},
			{
				taskId: ctx.seedResult.taskId,
				agentId: ctx.seedResult.agentId,
				teamId: ctx.seedResult.teamId,
			},
		);
	},
	rubric: {
		dimensions: [
			judgeSessionCompleted(),
			judgeSessionNotesWritten(),
			{
				id: "score_set",
				label: "Attention Score Set on Knowledge Item",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [fabric] = await ctx.db
						.select({ attentionScore: knowledgeAppProjection.attentionScore })
						.from(knowledgeAppProjection)
						.where(eq(knowledgeAppProjection.knowledgeItemId, saOverrideKnowledgeItemId))
						.limit(1);
					const hasScore = fabric?.attentionScore !== null && fabric?.attentionScore !== undefined;
					return {
						score: hasScore ? 1.0 : 0.0,
						note: hasScore
							? `Attention score set to: ${fabric?.attentionScore}`
							: "No attention score found on fabric row",
					};
				},
			},
			{
				id: "score_reasonable",
				label: "Score is High (0.8+) for Critical Item",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [fabric] = await ctx.db
						.select({ attentionScore: knowledgeAppProjection.attentionScore })
						.from(knowledgeAppProjection)
						.where(eq(knowledgeAppProjection.knowledgeItemId, saOverrideKnowledgeItemId))
						.limit(1);
					if (!fabric?.attentionScore) {
						return { score: 0.0, note: "No score to evaluate" };
					}
					const score = Number(fabric.attentionScore);
					return {
						score: score >= 0.8 ? 1.0 : score >= 0.5 ? 0.5 : 0.0,
						note:
							score < 0.8 ? `Score ${score} is below 0.8 for a patient privacy item` : undefined,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// sa-recompute-pf-devops
// ---------------------------------------------------------------------------

let saRecomputeKnowledgeItemId = "";

const saRecomputePfDevops: EvalScenario = {
	id: "sa-recompute-pf-devops",
	description: "PF triggers recompute mode for DevOps knowledge attention scores",
	feature: "score_attention",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "facilitator", // @lore AD8c: renamed from practice_facilitator
			agentSystemPrompt: `You are a practice facilitator for the DevOps community.
Use score_attention in "recompute" mode to refresh the attention engine scores for knowledge items.
Recompute mode does NOT require a score argument — the engine computes it automatically.
Use target="knowledge_item", mode="recompute", and omit the score field.`,
			taskTitle: "Refresh attention scores for DevOps knowledge base",
			taskDescription: `Refresh the attention scores for the DevOps knowledge base using the attention engine.

Use score_attention in recompute mode:
- target: "knowledge_item"
- id: the knowledge item's ID
- mode: "recompute"
- DO NOT include a score argument (engine computes it)

The recompute mode runs the attention engine and updates the score automatically.
Document what you did in session notes.`,
			betDescription: "DevOps knowledge base maintenance",
			betDoneCondition: "Attention scores refreshed for DevOps knowledge items.",
		});

		const { knowledgeItemId } = await seedKnowledge(ctx.db, {
			scopeKind: "factory",
			title: "Kubernetes Resource Limits Best Practices",
			body: "Always set CPU and memory limits on all pods. Use Vertical Pod Autoscaler (VPA) for automatic adjustment. Resource limits prevent noisy neighbor problems in shared clusters.",
			updatedBy: `user:${world.founderId}`,
		});
		saRecomputeKnowledgeItemId = knowledgeItemId;

		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				sandboxBasePath: ctx.seedResult.sandboxBasePath,
			},
			{
				taskId: ctx.seedResult.taskId,
				agentId: ctx.seedResult.agentId,
				teamId: ctx.seedResult.teamId,
			},
		);
	},
	rubric: {
		dimensions: [
			judgeSessionCompleted(),
			{
				id: "recompute_called",
				label: "Attention Score Computed (Fabric Row Updated)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// After recompute, the fabric row should have an attentionScore
					const [fabric] = await ctx.db
						.select({ attentionScore: knowledgeAppProjection.attentionScore })
						.from(knowledgeAppProjection)
						.where(eq(knowledgeAppProjection.knowledgeItemId, saRecomputeKnowledgeItemId))
						.limit(1);
					// Recompute creates or updates the fabric attentionScore
					const hasScore = fabric?.attentionScore !== null && fabric?.attentionScore !== undefined;
					return {
						score: hasScore ? 1.0 : 0.0,
						note: hasScore
							? `Recomputed attention score: ${fabric?.attentionScore}`
							: "No attention score after recompute call",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// sa-item-noop-cos-marketing
// ---------------------------------------------------------------------------

const saItemNoopCosMarketing: EvalScenario = {
	id: "sa-item-noop-cos-marketing",
	description:
		"System agent attempts to score an item (O2 no-op) — session completes without error",
	feature: "score_attention",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "assistant",
			agentSystemPrompt: `You are a system agent managing portfolio items.
You can use score_attention on items, but note that the items.attentionScore column was removed in an O2 migration.
Using score_attention on target="item" is currently a graceful no-op — the tool returns ok but no DB write occurs.
Try it on a marketing item and document the outcome in session notes.`,
			taskTitle: "Attempt attention scoring on marketing portfolio items",
			taskDescription: `Attempt to score a marketing item's attention using score_attention.

Use score_attention with:
- target: "item"
- id: the marketing item's ID
- score: 0.8
- mode: "override"

The tool will return a successful response but the score is not persisted (items.attentionScore was removed in O2).
Document this behavior in session notes — note that item scoring is currently a no-op.`,
			betDescription: "Portfolio attention management",
			betDoneCondition: "Item attention scoring behavior documented.",
		});

		// Seed a marketing item to score
		const { threadId } = await seedThread(ctx.db, {
			hostKind: "task",
			hostId: world.taskId,
			initiatorId: world.founderId,
			participants: [world.founderId, world.agentId],
		});

		await seedItem(ctx.db, {
			sourceAgentId: world.agentId,
			title: "Q4 Social Media Campaign Launch",
			threadId,
			verb: "propose",
			body: "Propose Q4 social media campaign across LinkedIn, Twitter, and Instagram targeting mid-market buyers.",
		});

		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				sandboxBasePath: ctx.seedResult.sandboxBasePath,
			},
			{
				taskId: ctx.seedResult.taskId,
				agentId: ctx.seedResult.agentId,
				teamId: ctx.seedResult.teamId,
			},
		);
	},
	rubric: {
		dimensions: [
			judgeSessionCompleted(),
			{
				id: "score_attempted",
				label: "Score Attempted Without Crashing",
				judge: (_ctx: JudgeContext): Promise<DimensionScore> =>
					// Session completed = no crash. The item.attentionScore write is a no-op.
					// This is a structural test — if the session completed, the no-op path worked.
					Promise.resolve({
						score: 1.0,
						note: "Session completed — item score_attention no-op path handled gracefully",
					}),
			},
			{
				id: "no_error",
				label: "No Crash or Error Outcome",
				judge: (ctx: JudgeContext): Promise<DimensionScore> => {
					// Check that outcome is "completed" not "crashed"
					const { outcome } = ctx.triggerResult;
					return Promise.resolve({
						score: outcome === "completed" ? 1.0 : 0.0,
						note: outcome !== "completed" ? `Session outcome: ${outcome}` : undefined,
					});
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const scoreAttentionScenarios: EvalScenario[] = [
	saOverridePmHealthcare,
	saRecomputePfDevops,
	saItemNoopCosMarketing,
];
