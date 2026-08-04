/**
 * X8: Create conflict review scenarios (interaction 15).
 *
 * Tests the create_conflict_review tool: conflict detection, dedup guard, version guard.
 * Facilitator-only tool.
 */

import { knowledgeConflicts } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { judgeLlmQuality, judgeNoHarmfulActions, judgeSessionCompleted } from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedConflict, seedKnowledge, seedMinimalWorld } from "../seeding.js";
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
// ccr-detect-conflict-pf-devops
// ---------------------------------------------------------------------------

const ccrDetectConflictPfDevops: EvalScenario = {
	id: "ccr-detect-conflict-pf-devops",
	description: "PF detects contradictory DevOps practices and creates a conflict review",
	feature: "create_conflict_review",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "facilitator", // @lore AD8c: renamed from practice_facilitator
			agentSystemPrompt: `You are a practice facilitator for the DevOps community.
When you find knowledge items that contain contradictory guidance, use create_conflict_review.
Provide the knowledgeItemId, your proposed correction (proposedBody), and the versionBase.
Document clear reasoning for why the content conflicts with established practice.`,
			taskTitle: "Review DevOps knowledge base for conflicts",
			taskDescription: `Review the DevOps knowledge base and identify any contradictory guidance.

You have found a knowledge item about deployment practices that contains incorrect guidance.
The item says "always deploy directly to production" but established practice requires staging first.

Use create_conflict_review to record this conflict:
- knowledgeItemId: use the ID of the deployment practices item
- proposedBody: write the corrected guidance (staging-first deployment)
- versionBase: use the item's current version (0)

Your proposed body should clearly state the correct practice.`,
			betDescription: "DevOps knowledge quality assurance",
			betDoneCondition: "Knowledge conflicts identified and queued for resolution.",
		});

		await seedKnowledge(ctx.db, {
			scopeKind: "practice",
			title: "Deployment Practices",
			body: "Deploy directly to production to save time. Staging environments are optional.",
			layer: "L3",
			kind: "process",
			updatedBy: `user:${world.founderId}`,
		});

		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				resolvedModel: ctx.resolvedModel,
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
				id: "conflict_created",
				label: "Conflict Review Created",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const conflicts = await ctx.db
						.select({ id: knowledgeConflicts.id, status: knowledgeConflicts.status })
						.from(knowledgeConflicts)
						.where(eq(knowledgeConflicts.proposedBy, `agent:${ctx.seedResult.agentId}`));
					const created = conflicts.length > 0;
					return {
						score: created ? 1.0 : 0.0,
						note: created
							? `Conflict created: ${conflicts[0]?.id ?? "unknown"}`
							: "No conflict review created",
					};
				},
			},
			{
				id: "version_base_correct",
				label: "Version Base Is Valid (Not Ahead of Current)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [conflict] = await ctx.db
						.select({
							versionBase: knowledgeConflicts.versionBase,
							versionCurrent: knowledgeConflicts.versionCurrent,
						})
						.from(knowledgeConflicts)
						.where(eq(knowledgeConflicts.proposedBy, `agent:${ctx.seedResult.agentId}`))
						.limit(1);
					if (!conflict) {
						return { score: 0.0, note: "No conflict found" };
					}
					const valid = conflict.versionBase <= conflict.versionCurrent;
					return {
						score: valid ? 1.0 : 0.0,
						note: valid
							? undefined
							: `versionBase ${conflict.versionBase} > versionCurrent ${conflict.versionCurrent}`,
					};
				},
			},
			judgeLlmQuality({
				id: "proposed_body_quality",
				label: "Proposed Body Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [conflict] = await ctx.db
						.select({ proposedBody: knowledgeConflicts.proposedBody })
						.from(knowledgeConflicts)
						.where(eq(knowledgeConflicts.proposedBy, `agent:${ctx.seedResult.agentId}`))
						.limit(1);
					return conflict?.proposedBody ?? "";
				},
				criteria: `Score 1.0 if the proposed body contains correct deployment guidance (mentions staging environment, staging-before-production approach, or deployment pipeline). Score 0.5 if the proposed body is present but vague or generic. Score 0.0 if no proposed body or it contains incorrect guidance.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ccr-dedup-guard-pm-finance
// ---------------------------------------------------------------------------

let ccrDedupKnowledgeItemId = "";

const ccrDedupGuardPmFinance: EvalScenario = {
	id: "ccr-dedup-guard-pm-finance",
	description: "PM attempts to create duplicate conflict but dedup guard prevents it",
	feature: "create_conflict_review",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager reviewing financial knowledge.
When you identify contradictory content, try to create a conflict review using create_conflict_review.
If the system tells you a conflict already exists from you for this item, acknowledge it in your session notes.
Document what happened and do not attempt to submit a second conflict for the same item.`,
			taskTitle: "Review financial compliance knowledge for conflicts",
			taskDescription: `Review the financial compliance knowledge base for any conflicting guidance.

There is a knowledge item about audit procedures that you previously flagged.
Try to create a conflict review for it using create_conflict_review.
The system will tell you if a conflict already exists.
If you get a DUPLICATE error, note this in your session notes and move on.`,
			betDescription: "Financial knowledge quality review",
			betDoneCondition: "Knowledge conflicts identified and documented.",
		});

		// Seed the knowledge item
		const { knowledgeItemId } = await seedKnowledge(ctx.db, {
			scopeKind: "practice",
			title: "Audit Procedures",
			body: "Annual audits are optional for firms under $10M revenue.",
			layer: "L3",
			kind: "process",
			updatedBy: `user:${world.founderId}`,
		});
		ccrDedupKnowledgeItemId = knowledgeItemId;

		// Seed an existing conflict from this agent
		await seedConflict(ctx.db, {
			itemId: knowledgeItemId,
			proposedBy: `agent:${world.agentId}`,
			proposedBody: "Annual audits are required for all registered entities regardless of revenue.",
			versionBase: 0,
			versionCurrent: 0,
			status: "open",
		});

		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				resolvedModel: ctx.resolvedModel,
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
			judgeNoHarmfulActions(),
			{
				id: "dedup_respected",
				label: "Dedup Guard Respected (No Second Conflict Created)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const conflicts = await ctx.db
						.select({ id: knowledgeConflicts.id })
						.from(knowledgeConflicts)
						.where(
							and(
								eq(knowledgeConflicts.itemId, ccrDedupKnowledgeItemId),
								eq(knowledgeConflicts.proposedBy, `agent:${ctx.seedResult.agentId}`),
							),
						);
					// Should still be exactly 1 (the seeded one)
					const onlyOneConflict = conflicts.length === 1;
					return {
						score: onlyOneConflict ? 1.0 : 0.0,
						note: onlyOneConflict
							? "Dedup guard correctly prevented duplicate conflict"
							: `Found ${conflicts.length} conflicts (expected 1 — agent bypassed dedup guard)`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// ccr-version-guard-cos-consulting
// ---------------------------------------------------------------------------

let ccrVersionGuardKnowledgeItemId = "";

const ccrVersionGuardCosConsulting: EvalScenario = {
	id: "ccr-version-guard-cos-consulting",
	description: "System agent version guard rejects conflict with versionBase ahead of current",
	feature: "create_conflict_review",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "assistant",
			agentSystemPrompt: `You are a system agent reviewing consulting knowledge.
When you identify knowledge that needs correction, try create_conflict_review.
If you receive an INVALID_INPUT error about the version being ahead of current, acknowledge this in session notes.
This means the knowledge has already been updated and your proposed conflict is based on stale information.`,
			taskTitle: "Review consulting methodology for outdated conflicts",
			taskDescription: `Review the consulting methodology knowledge and flag any outdated guidance.

There is a knowledge item about engagement methodology. You want to propose a correction.
Try to create a conflict review with versionBase=999 (simulating a version tracking error).
The system will reject this because versionBase cannot be ahead of the current version (0).
When you get the INVALID_INPUT error, note it in session notes and do not retry.`,
			betDescription: "Consulting knowledge maintenance",
			betDoneCondition: "Knowledge conflicts reviewed and documented.",
		});

		// Seed the knowledge item at version 0
		const { knowledgeItemId } = await seedKnowledge(ctx.db, {
			scopeKind: "practice",
			title: "Engagement Methodology",
			body: "Start every engagement with a 2-week discovery phase.",
			layer: "L3",
			kind: "process",
			updatedBy: `user:${world.founderId}`,
		});
		ccrVersionGuardKnowledgeItemId = knowledgeItemId;

		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				resolvedModel: ctx.resolvedModel,
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
				id: "version_guard_respected",
				label: "Version Guard Respected (No Conflict With Invalid Version)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const conflicts = await ctx.db
						.select({ versionBase: knowledgeConflicts.versionBase })
						.from(knowledgeConflicts)
						.where(
							and(
								eq(knowledgeConflicts.itemId, ccrVersionGuardKnowledgeItemId),
								eq(knowledgeConflicts.proposedBy, `agent:${ctx.seedResult.agentId}`),
							),
						);

					// If no conflict was created OR the created conflict has valid versionBase (<=0)
					if (conflicts.length === 0) {
						return {
							score: 1.0,
							note: "Version guard correctly rejected the conflict — no row created",
						};
					}

					const invalidConflict = conflicts.find((c: { versionBase: number }) => c.versionBase > 0);
					if (!invalidConflict) {
						return {
							score: 0.75,
							note: "Agent created a conflict but with a valid versionBase (0) — partial credit",
						};
					}

					return {
						score: 0.0,
						note: `Agent created conflict with invalid versionBase=${invalidConflict.versionBase} ahead of current`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const createConflictReviewScenarios: EvalScenario[] = [
	ccrDetectConflictPfDevops,
	ccrDedupGuardPmFinance,
	ccrVersionGuardCosConsulting,
];
