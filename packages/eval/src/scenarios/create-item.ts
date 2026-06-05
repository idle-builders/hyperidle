/**
 * X8: Create item scenarios (interaction 5).
 *
 * Tests the create_item tool: escalation, knowledge proposal, review request, work item, chat.
 * HIGH complexity — 5 agent-initiated kinds across diverse domains.
 */

import { items } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import {
	judgeCostTracked,
	judgeCreateItemCalled,
	judgeLlmQuality,
	judgeSessionCompleted,
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
// ci-escalation-builder-finance
// ---------------------------------------------------------------------------

const ciEscalationBuilderFinance: EvalScenario = {
	id: "ci-escalation-builder-finance",
	description: "Builder escalates high-risk finance compliance blocker with proper riskTier",
	feature: "create_item",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSoulPrompt: `You are a builder agent working on financial systems.
When you encounter a compliance blocker that exceeds your authority to resolve, escalate it.
Use create_item with kind="escalation", riskTier="high", blocking=true, and your reasoning.
Finance compliance issues must always be flagged as high risk and blocking.`,
			taskTitle: "Implement payment processing fee calculation",
			taskDescription: `Implement the fee calculation for payment processing.

During implementation, you discover a critical compliance issue:
The current fee structure violates PCI DSS requirement 3.4 (cardholder data must not be stored unencrypted).
The existing code stores raw card data in the transaction log.

You cannot fix this yourself — it requires a security team review and architectural change.
Use create_item to escalate this compliance blocker:
- kind: "escalation"
- riskTier: "high"
- blocking: true
- reasoning: explain the PCI DSS violation and why it blocks your work
- title: a clear escalation title`,
			betDescription: "Payment processing system implementation",
			betDoneCondition: "Fee calculation implemented with PCI DSS compliance verified.",
		});
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
			judgeCreateItemCalled(),
			judgeCostTracked(),
			{
				id: "kind_correctness",
				label: "Item Kind Correct (escalation)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ kind: items.kind })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					const correct = item?.kind === "escalation";
					return {
						score: correct ? 1.0 : item ? 0.5 : 0.0,
						note: correct ? undefined : item ? `Wrong kind: ${item.kind}` : "No item created",
					};
				},
			},
			{
				id: "risk_tier_assessment",
				label: "Risk Tier Assessed as High",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ riskTier: items.riskTier, blocking: items.blocking })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					const highRisk = item?.riskTier === "high";
					const blocking = item?.blocking === true;
					if (highRisk && blocking) {
						return { score: 1.0 };
					}
					if (highRisk || blocking) {
						return { score: 0.5, note: `highRisk=${highRisk}, blocking=${blocking}` };
					}
					return {
						score: 0.0,
						note: `riskTier=${item?.riskTier ?? "none"}, blocking=${item?.blocking ?? false}`,
					};
				},
			},
			judgeLlmQuality({
				id: "reasoning_present",
				label: "Escalation Reasoning Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [item] = await ctx.db
						.select({ reasoning: items.reasoning, body: items.body })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					return `reasoning: ${item?.reasoning ?? ""}\nbody: ${item?.body ?? ""}`;
				},
				criteria: `Score 1.0 if the reasoning or body mentions: (1) the specific compliance issue (PCI DSS, cardholder data, or encryption), (2) why it blocks the current work. Score 0.5 if the reasoning mentions a compliance issue but lacks specifics about PCI DSS. Score 0.0 if reasoning is absent or generic.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ci-knowledge-proposal-builder-consulting
// ---------------------------------------------------------------------------

const ciKnowledgeProposalBuilderConsulting: EvalScenario = {
	id: "ci-knowledge-proposal-builder-consulting",
	description: "Builder proposes a reusable consulting pattern as a knowledge item",
	feature: "create_item",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSoulPrompt: `You are a builder agent working on consulting deliverables.
When you discover a reusable pattern or insight during your work, propose it for the knowledge base.
Use create_item with kind="knowledge" and verb="propose" to surface it for facilitator review.
Include a clear body that explains the pattern and why it's reusable.`,
			taskTitle: "Build client workshop facilitation template",
			taskDescription: `Build a workshop facilitation template for client engagements.

During this work, you discover a valuable pattern:
"Opening questions land better than opening statements" — when you ask clients what's working vs. what isn't
before presenting your analysis, they engage more and push back less on findings.

Propose this pattern for the knowledge base using create_item:
- kind: "knowledge"
- verb: "propose"
- title: a descriptive title for the pattern
- body: explain the pattern and when to use it

This routes the item to the knowledge view for facilitator review.`,
			betDescription: "Consulting methodology improvement",
			betDoneCondition: "Workshop template built and pattern documented.",
		});
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
			judgeCreateItemCalled(),
			{
				id: "kind_correctness",
				label: "Item Kind Correct (knowledge)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ kind: items.kind, verb: items.verb })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					const correct = item?.kind === "knowledge";
					return {
						score: correct ? 1.0 : item ? 0.5 : 0.0,
						note: correct ? undefined : item ? `Wrong kind: ${item.kind}` : "No item created",
					};
				},
			},
			judgeLlmQuality({
				id: "body_quality",
				label: "Knowledge Proposal Content Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [item] = await ctx.db
						.select({ body: items.body, title: items.title })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					return `title: ${item?.title ?? ""}\nbody: ${item?.body ?? ""}`;
				},
				criteria: `Score 1.0 if the item body describes a reusable consulting pattern (mentions questions vs statements, client engagement, or when to use the pattern). Score 0.5 if the body is present but describes a generic practice rather than a specific reusable pattern. Score 0.0 if body is empty or unrelated to consulting.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ci-review-request-builder-frontend
// ---------------------------------------------------------------------------

const ciReviewRequestBuilderFrontend: EvalScenario = {
	id: "ci-review-request-builder-frontend",
	description: "Builder requests human review on high-risk UI accessibility change",
	feature: "create_item",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSoulPrompt: `You are a builder agent implementing frontend accessibility improvements.
When you make changes that could affect users with disabilities, request a human review.
Use create_item with kind="review" and riskTier="high" for accessibility-critical changes.
Include specific changes made and why they need expert review in the body.`,
			taskTitle: "Refactor screen reader announcement patterns",
			taskDescription: `Refactor the screen reader announcement patterns for dynamic content updates.

You have made changes to how the application announces route changes to screen readers.
This is a high-risk change because:
- Affects all users relying on screen readers
- Incorrect ARIA live regions can cause announcement flooding
- Requires testing with actual assistive technology

Request a human review using create_item:
- kind: "review"
- riskTier: "high"
- title: a clear title for the review request
- body: describe the changes made and the specific risks to review`,
			betDescription: "Screen reader accessibility improvements",
			betDoneCondition: "Announcement patterns refactored and reviewed by accessibility expert.",
		});
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
			judgeCreateItemCalled(),
			{
				id: "kind_correctness",
				label: "Item Kind Correct (review)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ kind: items.kind })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					const correct = item?.kind === "review";
					return {
						score: correct ? 1.0 : item ? 0.5 : 0.0,
						note: correct ? undefined : item ? `Wrong kind: ${item.kind}` : "No item created",
					};
				},
			},
			{
				id: "risk_tier_assessment",
				label: "Risk Tier Assessed as High",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ riskTier: items.riskTier })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					const correct = item?.riskTier === "high";
					return {
						score: correct ? 1.0 : item ? 0.5 : 0.0,
						note: correct ? undefined : `riskTier=${item?.riskTier ?? "not found"}`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// ci-work-item-pm-devops
// ---------------------------------------------------------------------------

const ciWorkItemPmDevops: EvalScenario = {
	id: "ci-work-item-pm-devops",
	description: "PM creates a work item with verb:bet for critical infrastructure issue",
	feature: "create_item",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSoulPrompt: `You are a product manager overseeing infrastructure reliability.
When you discover a critical infrastructure issue that requires a new bet (significant commitment), create a work item.
Use create_item with kind="work", verb="bet", and blocking=true for critical infrastructure issues.
Include the technical issue and business impact in the body.`,
			taskTitle: "Coordinate response to production database capacity issue",
			taskDescription: `Respond to a critical infrastructure capacity issue discovered in production.

The situation:
- Production database is at 92% storage capacity
- Current growth rate: 8% per month
- Estimated time to full: 3-4 weeks
- Requires a new bet to properly address: database migration to larger instance + archival strategy

Create a work item to escalate this as a bet using create_item:
- kind: "work"
- verb: "bet"
- blocking: true (blocks current sprint)
- title: describe the infrastructure issue
- body: include the capacity numbers and urgency`,
			betDescription: "Infrastructure reliability management",
			betDoneCondition: "Database capacity crisis addressed with migration bet created.",
		});
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
			judgeCreateItemCalled(),
			{
				id: "kind_correctness",
				label: "Item Kind Correct (work)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ kind: items.kind, verb: items.verb })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					const correctKind = item?.kind === "work";
					const correctVerb = item?.verb === "bet";
					if (correctKind && correctVerb) {
						return { score: 1.0 };
					}
					if (correctKind || correctVerb) {
						return {
							score: 0.5,
							note: `kind=${item?.kind ?? "none"}, verb=${item?.verb ?? "none"}`,
						};
					}
					return {
						score: 0.0,
						note: item ? `Wrong kind/verb: ${item.kind}/${item.verb}` : "No item",
					};
				},
			},
			{
				id: "blocking_flag",
				label: "Item Marked as Blocking",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ blocking: items.blocking })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					return {
						score: item?.blocking ? 1.0 : 0.0,
						note: item?.blocking ? undefined : "Item not marked as blocking",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// ci-chat-growth-marketing
// ---------------------------------------------------------------------------

const ciChatGrowthMarketing: EvalScenario = {
	id: "ci-chat-growth-marketing",
	description: "Growth agent creates chat item for quick human check on campaign messaging",
	feature: "create_item",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "growth",
			agentSoulPrompt: `You are a growth agent working on marketing campaigns.
When you need a quick human check on campaign messaging before publishing, create a chat item.
Use create_item with kind="chat" and verb="review" for lightweight human-in-the-loop checks.
Chat items are for quick questions and feedback, not formal escalations.`,
			taskTitle: "Finalize email subject lines for campaign launch",
			taskDescription: `Finalize the subject lines for the Q4 campaign email sequence.

You've drafted 3 subject lines but want a quick human opinion before scheduling:
1. "Your competitors are already using this" (urgency angle)
2. "The Q4 playbook your team needs" (utility angle)
3. "2 weeks to transform your pipeline" (time pressure angle)

Create a chat item to get quick feedback using create_item:
- kind: "chat"
- verb: "review"
- title: ask for feedback on subject line choice
- body: include the 3 options and ask which performs best

This routes to conversations for a quick check.`,
			betDescription: "Q4 email campaign launch",
			betDoneCondition: "Campaign emails scheduled with approved subject lines.",
		});
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
			judgeCreateItemCalled(),
			{
				id: "kind_correctness",
				label: "Item Kind Correct (chat)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ kind: items.kind })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					const correct = item?.kind === "chat";
					return {
						score: correct ? 1.0 : item ? 0.5 : 0.0,
						note: correct ? undefined : item ? `Wrong kind: ${item.kind}` : "No item created",
					};
				},
			},
			judgeLlmQuality({
				id: "view_routed_correctly",
				label: "Chat Item Routed to Conversations View",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [item] = await ctx.db
						.select({ kind: items.kind, riskTier: items.riskTier, body: items.body })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					return JSON.stringify(item ?? {});
				},
				criteria: `Score 1.0 if a chat item was created with a body that asks for feedback or approval on marketing messaging. The chat kind routes to conversations view automatically. Score 0.5 if an item was created but with wrong kind or insufficient body. Score 0.0 if no item was created.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const createItemScenarios: EvalScenario[] = [
	ciEscalationBuilderFinance,
	ciKnowledgeProposalBuilderConsulting,
	ciReviewRequestBuilderFrontend,
	ciWorkItemPmDevops,
	ciChatGrowthMarketing,
];
