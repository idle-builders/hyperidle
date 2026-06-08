/**
 * X8: Route item scenarios (interaction 12).
 *
 * Tests the route_item tool: risk tier override, kind reclassification, verb override.
 * Facilitator-only tool.
 */

import { items } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeSessionCompleted } from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedItem, seedMinimalWorld, seedThread } from "../seeding.js";
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
// roi-risk-override-pm-finance
// ---------------------------------------------------------------------------

let roiRiskOverrideItemId = "";

const roiRiskOverridePmFinance: EvalScenario = {
	id: "roi-risk-override-pm-finance",
	description: "PM reassesses financial compliance item risk tier from low to high",
	feature: "route_item",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSoulPrompt: `You are a product manager reviewing items in the finance domain.
When you see an item with an incorrect risk tier, use route_item to correct it.
Financial compliance items with regulatory implications should always be classified as high risk.
Use route_item with riskTier="high" to override the risk assessment when needed.`,
			taskTitle: "Review and reclassify finance team items",
			taskDescription: `Review the pending items in your queue and reclassify them if needed.

There is an item about quarterly tax filing compliance that was incorrectly marked as low risk.
Tax compliance items have regulatory consequences — they should be high risk.

Use route_item to:
1. Set itemId to the compliance item's ID (check your context)
2. Set riskTier="high" to correct the risk assessment

This will route the item to the conversations view for immediate attention.`,
			betDescription: "Finance compliance item triage",
			betDoneCondition: "Items correctly classified by risk tier.",
		});

		// Seed the compliance item with incorrect low risk tier
		const { threadId } = await seedThread(ctx.db, {
			hostKind: "task",
			hostId: world.taskId,
			initiatorId: world.founderId,
			participants: [world.founderId, world.agentId],
		});

		const { itemId } = await seedItem(ctx.db, {
			sourceAgentId: world.agentId,
			title: "Quarterly tax filing compliance check",
			threadId,
			kind: "work",
			verb: "review",
			riskTier: "low",
			body: "Annual tax compliance review requires audit of Q3 filings before SEC deadline.",
		});
		roiRiskOverrideItemId = itemId;

		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				resolvedModel: ctx.resolvedModel,
				resolvedFastModel: ctx.resolvedFastModel,
				workspaceBasePath: ctx.seedResult.workspaceBasePath,
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
				id: "item_routed",
				label: "Item Was Routed",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ riskTier: items.riskTier })
						.from(items)
						.where(eq(items.id, roiRiskOverrideItemId))
						.limit(1);
					const routed = item?.riskTier === "high";
					return {
						score: routed ? 1.0 : item ? 0.0 : 0.0,
						note: routed ? undefined : `Item riskTier still: ${item?.riskTier ?? "not found"}`,
					};
				},
			},
			{
				id: "risk_tier_changed",
				label: "Risk Tier Changed to High",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ riskTier: items.riskTier })
						.from(items)
						.where(eq(items.id, roiRiskOverrideItemId))
						.limit(1);
					const correct = item?.riskTier === "high";
					return {
						score: correct ? 1.0 : 0.0,
						note: correct ? undefined : `Expected high, got: ${item?.riskTier ?? "not found"}`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// roi-kind-reclassify-pf-consulting
// ---------------------------------------------------------------------------

let roiKindReclassifyItemId = "";

const roiKindReclassifyPfConsulting: EvalScenario = {
	id: "roi-kind-reclassify-pf-consulting",
	description: "Practice facilitator classifies unclassified item as knowledge",
	feature: "route_item",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "practice_facilitator",
			agentSoulPrompt: `You are a practice facilitator reviewing community items.
When you find items with valuable reusable knowledge, reclassify them using route_item.
Set kind="knowledge" to route items to the knowledge view for community benefit.
This helps preserve institutional knowledge for future practitioners.`,
			taskTitle: "Curate and classify pending community items",
			taskDescription: `Review pending items and identify ones that contain reusable knowledge.

There is an item containing a consulting pattern for stakeholder alignment that was not classified.
This pattern is valuable community knowledge that should be preserved.

Use route_item to:
1. Set the itemId for this consulting pattern item
2. Set kind="knowledge" to classify it as reusable knowledge

This routes it to the knowledge view for community access.`,
			betDescription: "Community knowledge curation",
			betDoneCondition: "Valuable knowledge items correctly classified.",
		});

		// Seed the unclassified item
		const { threadId } = await seedThread(ctx.db, {
			hostKind: "task",
			hostId: world.taskId,
			initiatorId: world.founderId,
			participants: [world.founderId, world.agentId],
		});

		const { itemId } = await seedItem(ctx.db, {
			sourceAgentId: world.agentId,
			title: "Stakeholder alignment pattern: start with pain, not solution",
			threadId,
			body: "Always open client workshops by surfacing pain points before discussing solutions. This creates psychological safety and ensures the solution addresses real problems.",
		});
		roiKindReclassifyItemId = itemId;

		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				resolvedModel: ctx.resolvedModel,
				resolvedFastModel: ctx.resolvedFastModel,
				workspaceBasePath: ctx.seedResult.workspaceBasePath,
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
				id: "item_routed",
				label: "Item Was Routed",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ kind: items.kind })
						.from(items)
						.where(eq(items.id, roiKindReclassifyItemId))
						.limit(1);
					return {
						score: item !== undefined ? 1.0 : 0.0,
						note: item ? undefined : "Item not found",
					};
				},
			},
			{
				id: "kind_changed",
				label: "Item Kind Changed to Knowledge",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ kind: items.kind })
						.from(items)
						.where(eq(items.id, roiKindReclassifyItemId))
						.limit(1);
					const correct = item?.kind === "knowledge";
					return {
						score: correct ? 1.0 : 0.0,
						note: correct
							? undefined
							: `Expected kind=knowledge, got: ${item?.kind ?? "not found"}`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// roi-verb-override-cos-marketing
// ---------------------------------------------------------------------------

let roiVerbOverrideItemId = "";

const roiVerbOverrideCosMarketing: EvalScenario = {
	id: "roi-verb-override-cos-marketing",
	description: "System agent reclassifies marketing item with verb:bet to route to work view",
	feature: "route_item",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "chief_of_staff",
			agentSoulPrompt: `You are a system agent managing portfolio items.
When you identify items that represent significant investments requiring bet-level commitment, use route_item.
Set verb="bet" to route high-value items to the work view for proper bet management.
This escalates the item from a casual conversation to a tracked organizational bet.`,
			taskTitle: "Classify marketing initiative items for portfolio tracking",
			taskDescription: `Review marketing items and identify ones that need bet-level commitment.

There is a marketing item about launching a major rebranding initiative.
This is too large for a normal task — it needs to be tracked as a bet.

Use route_item to:
1. Set the itemId for this rebranding item
2. Set verb="bet" to escalate it to bet-level tracking

This routes it to the work view for portfolio management.`,
			betDescription: "Portfolio item classification",
			betDoneCondition: "Major initiatives correctly classified as bets.",
		});

		// Seed the marketing item that needs verb escalation
		const { threadId } = await seedThread(ctx.db, {
			hostKind: "task",
			hostId: world.taskId,
			initiatorId: world.founderId,
			participants: [world.founderId, world.agentId],
		});

		const { itemId } = await seedItem(ctx.db, {
			sourceAgentId: world.agentId,
			title: "Full brand identity relaunch across all touchpoints",
			threadId,
			kind: "work",
			verb: "task",
			body: "Major initiative: redesign logo, update brand guidelines, refresh all marketing materials, website redesign. Estimated 6-month effort.",
		});
		roiVerbOverrideItemId = itemId;

		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				resolvedModel: ctx.resolvedModel,
				resolvedFastModel: ctx.resolvedFastModel,
				workspaceBasePath: ctx.seedResult.workspaceBasePath,
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
				id: "item_routed",
				label: "Item Was Routed",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ verb: items.verb })
						.from(items)
						.where(eq(items.id, roiVerbOverrideItemId))
						.limit(1);
					return {
						score: item !== undefined ? 1.0 : 0.0,
						note: item ? undefined : "Item not found",
					};
				},
			},
			{
				id: "verb_changed",
				label: "Item Verb Changed to Bet",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ verb: items.verb })
						.from(items)
						.where(eq(items.id, roiVerbOverrideItemId))
						.limit(1);
					const correct = item?.verb === "bet";
					return {
						score: correct ? 1.0 : 0.0,
						note: correct ? undefined : `Expected verb=bet, got: ${item?.verb ?? "not found"}`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const routeItemScenarios: EvalScenario[] = [
	roiRiskOverridePmFinance,
	roiKindReclassifyPfConsulting,
	roiVerbOverrideCosMarketing,
];
