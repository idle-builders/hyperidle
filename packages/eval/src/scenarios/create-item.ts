/**
 * X8: Create item scenarios (interaction 5).
 *
 * Tests the create_item tool: escalation, knowledge proposal, review request, work item, chat.
 * HIGH complexity — 5 agent-initiated kinds across diverse domains.
 */

import { items } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeCreateItemCalled, judgeLlmQuality, judgeSessionCompleted } from "../judges.js";
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
			agentSystemPrompt: `You are a builder agent working on financial systems.
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
			judgeCreateItemCalled(),
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
			agentSystemPrompt: `You are a builder agent working on consulting deliverables.
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
			agentSystemPrompt: `You are a builder agent implementing frontend accessibility improvements.
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
			agentSystemPrompt: `You are a product manager overseeing infrastructure reliability.
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
			agentSystemPrompt: `You are a growth agent working on marketing campaigns.
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
// ci-review-request-designer-healthcare
// ---------------------------------------------------------------------------

const ciReviewRequestDesignerHealthcare: EvalScenario = {
	id: "ci-review-request-designer-healthcare",
	description: "Designer requests clinical UX review on medication dosage confirmation flow",
	feature: "create_item",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "designer",
			agentSystemPrompt: `You are a product designer on the healthcare team.
When you design interactions that affect patient safety, request a clinical expert review.
Use create_item with kind="review" and riskTier="high" for any UX flow involving medication, dosage, or clinical decisions.
Healthcare UX errors can harm patients — flag them immediately and include specific risk reasoning.
You do NOT make clinical decisions. Clinical experts must validate any patient-facing medication flow.`,
			taskTitle: "Request clinical review for medication dosage confirmation UX",
			taskDescription: `You have designed the medication dosage confirmation flow for the patient portal.
The flow lets patients confirm their medication dosage before a refill request.

Clinical risk factors you identified:
- Patients could misread the dosage unit (mg vs mcg — a 1000x difference)
- The confirmation dialog does not display the prescribing physician's name
- There is no "are you sure?" step for high-alert medications (warfarin, insulin)
- Color-coded severity indicators may not be visible for color-blind patients

Request a clinical UX review using create_item:
- kind: "review"
- riskTier: "high" (medication dosage errors can cause patient harm)
- title: a clear title describing the review needed
- body: describe the specific clinical risks you identified and what the expert should evaluate`,
			betDescription: "Patient portal medication management",
			betDoneCondition: "Dosage confirmation flow reviewed and approved by clinical expert.",
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
				label: "Risk Tier Assessed as High (clinical UX risk)",
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
			judgeLlmQuality({
				id: "reasoning_quality",
				label: "Review Reasoning Cites Patient Safety or Clinical Risk",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [item] = await ctx.db
						.select({ body: items.body, reasoning: items.reasoning })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					return `body: ${item?.body ?? ""}\nreasoning: ${item?.reasoning ?? ""}`;
				},
				criteria: `Score 1.0 if the body or reasoning cites at least one specific patient safety risk (medication dosage confusion, color blindness, missing physician name, or high-alert medication) AND requests clinical expert review. Score 0.5 if patient safety is mentioned but risks are generic (no specific medication-related concern). Score 0.0 if no patient safety reasoning.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ci-bug-escalation-qa-frontend
// ---------------------------------------------------------------------------

const ciBugEscalationQaFrontend: EvalScenario = {
	id: "ci-bug-escalation-qa-frontend",
	description: "QA engineer escalates keyboard navigation regression in release candidate",
	feature: "create_item",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "qa_engineer",
			agentSystemPrompt: `You are a QA engineer responsible for quality assurance on the frontend team.
When you find a regression in a release candidate, escalate it immediately using create_item.
Use kind="escalation" and riskTier="high" for regressions that block release.
Your escalation must include: what you found, how to reproduce it, affected component, and severity assessment.
You do NOT write production application code. Your sign-off is required before a feature ships.
Every bug has a reproducible test case — include reproduction steps in your escalation.`,
			taskTitle: "Escalate keyboard navigation regression in release candidate v2.4.1",
			taskDescription: `During regression testing of release candidate v2.4.1, you found a critical regression.

Bug found:
Component: DropdownMenu (frontend/components/dropdown)
Symptom: Keyboard navigation (Tab, Arrow keys, Enter, Escape) is completely broken
Regression: Was working in v2.4.0, broken in v2.4.1
Impact: All users who rely on keyboard navigation (accessibility requirement)
Affected browsers: Chrome 120, Firefox 121, Safari 17

Reproduction steps:
1. Open any page with a dropdown menu
2. Focus the dropdown trigger using Tab key
3. Press Enter to open — dropdown opens
4. Press Arrow Down — nothing happens (should move focus to first item)
5. Press Tab — focus jumps out of dropdown (should stay trapped in dropdown)

This blocks the release — keyboard navigation is an accessibility requirement.

Escalate using create_item:
- kind: "escalation"
- riskTier: "high" (regression blocks release, accessibility requirement)
- title: describe the regression clearly
- body: include the reproduction steps and affected component`,
			betDescription: "Frontend v2.4.1 release",
			betDoneCondition:
				"Release candidate passes all regression tests including keyboard navigation.",
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
			judgeCreateItemCalled(),
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
				label: "Risk Tier Assessed as High (release-blocking regression)",
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
			judgeLlmQuality({
				id: "reasoning_quality",
				label: "Escalation Includes Reproduction Steps and Severity",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [item] = await ctx.db
						.select({ body: items.body, reasoning: items.reasoning })
						.from(items)
						.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
						.limit(1);
					return `body: ${item?.body ?? ""}\nreasoning: ${item?.reasoning ?? ""}`;
				},
				criteria: `Score 1.0 if the body or reasoning includes: (1) the affected component (dropdown or keyboard navigation), (2) at least one reproduction step, AND (3) a severity statement (regression, blocks release, or accessibility requirement). Score 0.5 if the bug is described but lacks either reproduction steps or severity. Score 0.0 if no specific bug details.`,
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
	ciReviewRequestDesignerHealthcare,
	ciBugEscalationQaFrontend,
];
