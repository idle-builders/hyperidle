/**
 * X8: Write memory scenarios (interaction 1).
 *
 * Tests the write_memory tool: kind selection, layer enforcement, facilitator L4, brand voice.
 */

import { knowledgeAppProjection, knowledgeItems, sessions } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import {
	judgeCostTracked,
	judgeKnowledgeKindCorrect,
	judgeLlmQuality,
	judgeSessionCompleted,
	judgeWriteMemoryCalled,
} from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedMinimalWorld } from "../seeding.js";
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
// wm-kind-selection-builder-devops
// ---------------------------------------------------------------------------

const wmKindSelectionBuilderDevops: EvalScenario = {
	id: "wm-kind-selection-builder-devops",
	description: "Builder selects correct knowledge kind for DevOps failure analysis",
	feature: "write_memory",
	tags: ["quick"],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent in a DevOps team.
When capturing knowledge, choose the most specific kind that matches the content:
- "failure": post-mortems, incidents, what went wrong
- "decision": architectural or technical decisions
- "pattern": reusable approaches or best practices
- "reflection": retrospective observations

Always use write_memory to capture important technical knowledge.`,
			taskTitle: "Document the Kubernetes pod crash incident from yesterday",
			taskDescription: `A Kubernetes pod crashed due to an OOM (out of memory) error.

Document this incident using write_memory with the appropriate kind.
The incident involved:
- Pod: api-server-v2
- Error: OOMKilled (exceeded 512Mi limit)
- Root cause: memory leak in session cache
- Fix: increased limit to 1Gi, added cache expiry

Use write_memory to capture this as knowledge.
Choose the most appropriate kind for an incident post-mortem.`,
			betDescription: "DevOps incident documentation",
			betDoneCondition: "Incident documented as knowledge item.",
		});
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				resolvedModel: ctx.resolvedModel,
				resolvedFastModel: ctx.resolvedFastModel,
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
			judgeWriteMemoryCalled(),
			judgeCostTracked(),
			{
				id: "kind_correctness",
				label: "Kind Correct (failure or decision)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
					const [item] = await ctx.db
						.select({ id: knowledgeItems.id })
						.from(knowledgeItems)
						.where(eq(knowledgeItems.updatedBy, agentUpdatedBy))
						.limit(1);
					if (!item) return { score: 0.0, note: "No knowledge item created" };

					const [fabric] = await ctx.db
						.select({ kind: knowledgeAppProjection.kind })
						.from(knowledgeAppProjection)
						.where(eq(knowledgeAppProjection.knowledgeItemId, item.id))
						.limit(1);

					const kind = fabric?.kind;
					// "failure" is ideal; "decision" is acceptable (documenting the fix decision)
					const correct = kind === "failure" || kind === "decision";
					return {
						score: correct ? 1.0 : 0.5,
						note: correct
							? `Kind: ${kind}`
							: `Kind: ${kind ?? "null"} (expected failure or decision)`,
					};
				},
			},
			{
				id: "layer_correctness",
				label: "Layer in L0-L2 (builder restriction)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
					const [item] = await ctx.db
						.select({ id: knowledgeItems.id })
						.from(knowledgeItems)
						.where(eq(knowledgeItems.updatedBy, agentUpdatedBy))
						.limit(1);
					if (!item) return { score: 0.0, note: "No knowledge item created" };

					const [fabric] = await ctx.db
						.select({ layer: knowledgeAppProjection.layer })
						.from(knowledgeAppProjection)
						.where(eq(knowledgeAppProjection.knowledgeItemId, item.id))
						.limit(1);

					const layer = fabric?.layer ?? "";
					const allowed = ["L0", "L1", "L2", "factory", "product"].includes(layer);
					return {
						score: allowed ? 1.0 : 0.0,
						note: allowed ? `Layer: ${layer}` : `Layer: ${layer} (builder restricted to L0-L2)`,
					};
				},
			},
			judgeLlmQuality({
				id: "body_quality",
				label: "Knowledge Item Body Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
					const [item] = await ctx.db
						.select({ body: knowledgeItems.body, title: knowledgeItems.title })
						.from(knowledgeItems)
						.where(eq(knowledgeItems.updatedBy, agentUpdatedBy))
						.limit(1);
					return item ? `Title: ${item.title}\n\nBody: ${item.body}` : "";
				},
				criteria: `Score 1.0 if the knowledge item body includes all 3 of: (1) what happened (the incident), (2) the root cause, (3) the fix or resolution. Score 0.5 if 2 of 3 are present. Score 0.0 if 1 or fewer.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// wm-layer-enforcement-growth-marketing
// ---------------------------------------------------------------------------

const wmLayerEnforcementGrowthMarketing: EvalScenario = {
	id: "wm-layer-enforcement-growth-marketing",
	description: "Growth agent restricted to L0-L2 when attempting L3 write",
	feature: "write_memory",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "growth",
			agentSystemPrompt: `You are a growth agent at a marketing agency.
You discovered a pattern that applies across all company products.
Try to capture it as L3 practice knowledge using write_memory.
If write_memory returns an error about layer restrictions, acknowledge the restriction and save it at an accessible layer instead.`,
			taskTitle: "Capture cross-product growth pattern discovered during campaign analysis",
			taskDescription: `You discovered a pattern: campaigns that start with user research outperform those that don't by 40%.

Try to capture this as L3 (practice-level) knowledge using write_memory.
If you receive an error about layer restrictions, fall back to saving it at L2 (product level) instead.
Document what happened in your session notes.`,
			betDescription: "Marketing campaign learnings",
			betDoneCondition: "Growth pattern documented despite layer restrictions.",
		});
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				resolvedModel: ctx.resolvedModel,
				resolvedFastModel: ctx.resolvedFastModel,
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
				id: "layer_restricted",
				label: "Layer Restriction Respected",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
					const [item] = await ctx.db
						.select({ id: knowledgeItems.id })
						.from(knowledgeItems)
						.where(eq(knowledgeItems.updatedBy, agentUpdatedBy))
						.limit(1);

					if (!item) {
						// Agent may not have successfully written — check if they at least tried (session notes)
						return {
							score: 0.3,
							note: "No knowledge item created (agent may have failed to fallback)",
						};
					}

					const [fabric] = await ctx.db
						.select({ layer: knowledgeAppProjection.layer })
						.from(knowledgeAppProjection)
						.where(eq(knowledgeAppProjection.knowledgeItemId, item.id))
						.limit(1);

					const layer = fabric?.layer ?? "";
					const allowed = ["L0", "L1", "L2", "factory", "product"].includes(layer);
					return {
						score: allowed ? 1.0 : 0.0,
						note: allowed
							? `Written at allowed layer: ${layer}`
							: `Written at restricted layer: ${layer}`,
					};
				},
			},
			{
				id: "fallback_behavior",
				label: "Agent Acknowledges Restriction and Falls Back",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);

					if (!session?.notes) return { score: 0.0, note: "No session notes" };
					const lower = session.notes.toLowerCase();
					const acknowledgesRestriction =
						lower.includes("restricted") ||
						lower.includes("forbidden") ||
						lower.includes("layer") ||
						lower.includes("error") ||
						lower.includes("fallback") ||
						lower.includes("l2");
					return {
						score: acknowledgesRestriction ? 1.0 : 0.5,
						note: acknowledgesRestriction
							? "Session notes acknowledge layer restriction"
							: "Session notes do not mention restriction",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// wm-facilitator-l4-cos-consulting
// ---------------------------------------------------------------------------

const wmFacilitatorL4CosConsulting: EvalScenario = {
	id: "wm-facilitator-l4-cos-consulting",
	description: "System agent writes L4 factory-wide principles for consulting",
	feature: "write_memory",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "assistant",
			agentSystemPrompt: `You are a system agent at a consulting firm.
Your role is to capture factory-wide principles that apply across all products and teams.
When writing knowledge, use layer L4 for cross-product principles and company-wide guidelines.
Use write_memory with layer="factory" to capture factory-wide knowledge.`,
			taskTitle: "Document the client engagement principles that apply company-wide",
			taskDescription: `Document the following cross-company consulting principles using write_memory.

These principles apply to ALL client engagements, across all product teams:
- Principle 1: Always establish a clear hypothesis before the engagement
- Principle 2: Weekly check-ins with client prevent scope creep
- Principle 3: Every engagement produces a documented learnings artifact

Use write_memory to capture these as L4 factory-wide principles.
Choose kind "context" or "pattern" — these are foundational company principles.`,
			betDescription: "Company-wide consulting principles documentation",
			betDoneCondition: "Factory-wide consulting principles documented at L4.",
		});
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				resolvedModel: ctx.resolvedModel,
				resolvedFastModel: ctx.resolvedFastModel,
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
			judgeWriteMemoryCalled(),
			{
				id: "layer_correctness",
				label: "Layer is factory/L4",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
					const [item] = await ctx.db
						.select({ id: knowledgeItems.id })
						.from(knowledgeItems)
						.where(eq(knowledgeItems.updatedBy, agentUpdatedBy))
						.limit(1);
					if (!item) return { score: 0.0, note: "No knowledge item created" };

					const [fabric] = await ctx.db
						.select({ layer: knowledgeAppProjection.layer })
						.from(knowledgeAppProjection)
						.where(eq(knowledgeAppProjection.knowledgeItemId, item.id))
						.limit(1);

					const layer = fabric?.layer ?? "";
					const isHighLayer = ["L3", "L4", "factory"].includes(layer);
					return {
						score: isHighLayer ? 1.0 : 0.0,
						note: isHighLayer ? `Layer: ${layer}` : `Layer: ${layer} (expected L3/L4/factory)`,
					};
				},
			},
			{
				id: "kind_correctness",
				label: "Kind is context or pattern",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
					const [item] = await ctx.db
						.select({ id: knowledgeItems.id })
						.from(knowledgeItems)
						.where(eq(knowledgeItems.updatedBy, agentUpdatedBy))
						.limit(1);
					if (!item) return { score: 0.0, note: "No knowledge item created" };

					const [fabric] = await ctx.db
						.select({ kind: knowledgeAppProjection.kind })
						.from(knowledgeAppProjection)
						.where(eq(knowledgeAppProjection.knowledgeItemId, item.id))
						.limit(1);

					const kind = fabric?.kind;
					const appropriate = ["context", "pattern", "reflection"].includes(kind ?? "");
					return {
						score: appropriate ? 1.0 : 0.5,
						note: appropriate
							? `Kind: ${kind}`
							: `Kind: ${kind ?? "null"} (expected context/pattern)`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// wm-reflection-brandvoice-marketing
// ---------------------------------------------------------------------------

const wmReflectionBrandvoiceMarketing: EvalScenario = {
	id: "wm-reflection-brandvoice-marketing",
	description: "Brand voice agent captures brand consistency reflection",
	feature: "write_memory",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "brand_voice",
			agentSystemPrompt: `You are the brand voice agent. Your identity IS the brand.
You observe how the brand is expressed and capture brand consistency learnings.
When capturing knowledge, use kind="reflection" for brand observations.
Your knowledge items should reflect on: how well we stayed on brand, what worked, what drifted.`,
			taskTitle: "Reflect on this quarter's campaign brand consistency",
			taskDescription: `Review how the recent marketing campaigns expressed the brand and capture your reflection.

Use write_memory to document your brand consistency reflection:
- Use kind="reflection" (brand agents capture brand observations as reflections)
- Document at least: what was on-brand, what drifted, and one recommendation

This reflection will help the team maintain brand consistency going forward.`,
			betDescription: "Brand consistency reflection and documentation",
			betDoneCondition: "Brand reflection documented as knowledge item.",
		});
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				resolvedModel: ctx.resolvedModel,
				resolvedFastModel: ctx.resolvedFastModel,
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
			judgeWriteMemoryCalled(),
			judgeKnowledgeKindCorrect("reflection"),
			judgeLlmQuality({
				id: "brand_consistency",
				label: "Brand Consistency Reflection Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
					const [item] = await ctx.db
						.select({ body: knowledgeItems.body, title: knowledgeItems.title })
						.from(knowledgeItems)
						.where(eq(knowledgeItems.updatedBy, agentUpdatedBy))
						.limit(1);
					return item ? `Title: ${item.title}\nBody: ${item.body}` : "";
				},
				criteria: `Score 1.0 if the knowledge item addresses all 3 of: (1) what was on-brand, (2) what drifted from brand, (3) a recommendation for improvement. Score 0.5 if 2 of 3 present. Score 0.0 if fewer than 2 are present.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const writeMemoryScenarios: EvalScenario[] = [
	wmKindSelectionBuilderDevops,
	wmLayerEnforcementGrowthMarketing,
	wmFacilitatorL4CosConsulting,
	wmReflectionBrandvoiceMarketing,
];
