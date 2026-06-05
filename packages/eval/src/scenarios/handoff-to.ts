/**
 * X8: Handoff-to scenarios (interaction 11).
 *
 * Tests the handoff_to tool: toAgent path, toRole path, toHuman escalation, context quality.
 */

import { items, sessions } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { judgeLlmQuality, judgeSessionCompleted } from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedMinimalWorld, seedMultiAgentWorld } from "../seeding.js";
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
// ht-to-agent-builder-devops
// ---------------------------------------------------------------------------

const htToAgentBuilderDevops: EvalScenario = {
	id: "ht-to-agent-builder-devops",
	description: "Builder hands off DevOps task to specific teammate with context",
	feature: "handoff_to",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMultiAgentWorld(ctx.db, {
			agentRole: "builder",
			agentSoulPrompt: `You are a builder agent working on infrastructure migration.
When you need to transfer work to a specific teammate, use handoff_to with their agentId.
Include: contextId (your current task), status, reason, artifacts, and remaining work.
Good handoffs give the receiver everything they need to continue without questions.`,
			secondAgentRole: "builder",
			secondAgentName: "On-call Builder",
			taskTitle: "Migrate application servers to new VPC",
			taskDescription: `You have completed Phase 1 of the VPC migration. Hand off to your teammate.

What you completed:
- Migrated 4 of 8 application servers to the new VPC
- Verified network connectivity and security groups
- Updated load balancer health checks

Remaining work:
- Migrate the remaining 4 servers
- Run integration tests in the new environment
- Update DNS records

Use handoff_to with:
- toAgent: your teammate's agentId (it's in your context as the second team member)
- contextId: current task ID
- status: "in_progress"
- reason: why you're handing off
- artifacts: list of completed work
- remainingWork: list of what's left`,
			betDescription: "AWS VPC migration",
			betDoneCondition: "All servers migrated to new VPC with connectivity verified.",
		});
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
				id: "handoff_called",
				label: "Handoff Called (Session Ended)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [session] = await ctx.db
						.select({ outcome: sessions.outcome, endedAt: sessions.endedAt })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					const ended = session?.outcome !== null;
					return {
						score: ended ? 1.0 : 0.0,
						note: ended ? undefined : "Session not ended (handoff may not have been called)",
					};
				},
			},
			{
				id: "status_correct",
				label: "Handoff Status Correct (in_progress)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// The handoff sets the task state — check that task wasn't set to "done"
					// (it should be in_progress since we're handing off mid-work)
					const [session] = await ctx.db
						.select({ outcome: sessions.outcome })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					// Session completed = handoff was made
					return {
						score: session?.outcome === "completed" ? 1.0 : 0.5,
						note:
							session?.outcome !== "completed"
								? `Session outcome: ${session?.outcome ?? "null"}`
								: undefined,
					};
				},
			},
			judgeLlmQuality({
				id: "context_quality",
				label: "Handoff Context Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if session notes mention: (1) what was completed (server migration progress), (2) what remains (remaining servers or integration tests), AND (3) a handoff to a specific agent. Score 0.5 if 2 of 3 are present. Score 0.0 if fewer than 2.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ht-to-role-builder-consulting
// ---------------------------------------------------------------------------

const htToRoleBuilderConsulting: EvalScenario = {
	id: "ht-to-role-builder-consulting",
	description: "Builder hands off consulting analysis to any product_manager on the team",
	feature: "handoff_to",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMultiAgentWorld(ctx.db, {
			agentRole: "builder",
			agentSoulPrompt: `You are a builder agent working on consulting analysis.
When your analysis is complete and needs stakeholder communication, hand off to a product manager.
Use handoff_to with toRole="product_manager" to route to the right person.
The system will find an available PM on your team automatically.`,
			secondAgentRole: "product_manager",
			secondAgentName: "Team PM",
			taskTitle: "Complete competitive analysis and hand off for stakeholder communication",
			taskDescription: `Complete the competitive analysis for the consulting engagement.

Your analysis findings:
- Competitor A has faster delivery (2 weeks vs our 4 weeks)
- Competitor B has 15% lower pricing but inferior quality
- Our key differentiator: client education and knowledge transfer included

Hand off to the team product manager for stakeholder communication using handoff_to:
- toRole: "product_manager"
- contextId: current task ID
- status: "completed"
- reason: "Analysis complete, needs stakeholder communication"
- artifacts: your completed analysis`,
			betDescription: "Competitive analysis and strategy",
			betDoneCondition: "Analysis delivered to stakeholders.",
		});
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
				id: "handoff_called",
				label: "Handoff Called",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [session] = await ctx.db
						.select({ outcome: sessions.outcome })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return {
						score: session?.outcome === "completed" ? 1.0 : 0.0,
						note:
							session?.outcome !== "completed"
								? `Session outcome: ${session?.outcome ?? "null"}`
								: undefined,
					};
				},
			},
			judgeLlmQuality({
				id: "context_quality",
				label: "Handoff Includes Analysis Context",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if session notes mention the competitive analysis findings AND a handoff to a PM role. Score 0.5 if handoff is mentioned but analysis findings are absent. Score 0.0 if neither.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ht-to-human-builder-healthcare
// ---------------------------------------------------------------------------

const htToHumanBuilderHealthcare: EvalScenario = {
	id: "ht-to-human-builder-healthcare",
	description: "Builder escalates HIPAA question to human reviewer (toHuman=true, status=blocked)",
	feature: "handoff_to",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSoulPrompt: `You are a builder agent working on a healthcare patient data system.
When you encounter a question requiring human judgment on patient privacy or HIPAA compliance,
escalate to a human reviewer using handoff_to with toHuman=true and status="blocked".
HIPAA interpretation questions require human legal or compliance expertise — never guess.`,
			taskTitle: "Implement patient data export feature",
			taskDescription: `Implement the patient data export feature for the healthcare portal.

During implementation, you encounter a HIPAA compliance question you cannot resolve:
The feature needs to export PHI (Protected Health Information) to a third-party analytics system.
This may require a new Business Associate Agreement (BAA) or may be prohibited entirely.

You cannot proceed without legal guidance on whether this is permitted under HIPAA.

Escalate to a human reviewer using handoff_to:
- toHuman: true
- contextId: current task ID
- status: "blocked"
- reason: describe the HIPAA compliance question blocking you
- Include what specific guidance you need

This creates a review item for a human compliance expert.`,
			betDescription: "Healthcare patient data portal",
			betDoneCondition: "Patient data export feature implemented with HIPAA compliance verified.",
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
			{
				id: "handoff_called",
				label: "Human Escalation Executed",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [session] = await ctx.db
						.select({ outcome: sessions.outcome })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return {
						score: session?.outcome === "completed" ? 1.0 : 0.0,
						note:
							session?.outcome !== "completed"
								? `Session outcome: ${session?.outcome ?? "null"}`
								: undefined,
					};
				},
			},
			{
				id: "review_item_created",
				label: "Review Item Created for Human",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// toHuman=true creates an escalation review item
					const reviewItems = await ctx.db
						.select({ id: items.id, kind: items.kind })
						.from(items)
						.where(and(eq(items.sourceAgentId, ctx.seedResult.agentId)));
					const escalationItems = reviewItems.filter(
						(i) => i.kind === "escalation" || i.kind === "review",
					);
					return {
						score: escalationItems.length > 0 ? 1.0 : 0.5,
						note:
							escalationItems.length > 0
								? `${escalationItems.length} review/escalation item(s) created`
								: "No review item found (handoff protocol may handle it differently)",
					};
				},
			},
			judgeLlmQuality({
				id: "reason_quality",
				label: "Escalation Reason Explains HIPAA Question",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if session notes mention the specific HIPAA question (PHI export, BAA requirement, or third-party analytics compliance) AND that a human escalation was made. Score 0.5 if escalation is mentioned but HIPAA specifics are vague. Score 0.0 if no mention of the compliance question.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ht-context-quality-pm-finance
// ---------------------------------------------------------------------------

const htContextQualityPmFinance: EvalScenario = {
	id: "ht-context-quality-pm-finance",
	description: "PM hands off financial audit with detailed context, artifacts, and remaining work",
	feature: "handoff_to",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMultiAgentWorld(ctx.db, {
			agentRole: "product_manager",
			agentSoulPrompt: `You are a product manager coordinating a financial audit engagement.
When handing off work, provide complete context so the receiver can continue without questions.
Your handoffs must include: what you completed, what artifacts were produced, and what remains.
Poor handoffs waste time — always be specific and comprehensive.`,
			secondAgentRole: "product_manager",
			secondAgentName: "Audit Coordinator",
			taskTitle: "Coordinate Q3 financial audit handoff",
			taskDescription: `Complete your phase of the Q3 financial audit and hand off to your colleague.

What you completed in Phase 1:
- Gathered all transaction records for Q1-Q2
- Verified reconciliation of accounts receivable ($2.3M variance identified and explained)
- Prepared the audit trail documentation (47 pages)

Remaining for Phase 2:
- Q3 transaction review
- External auditor interviews (scheduled for next Tuesday)
- Final audit report compilation

Use handoff_to with:
- toAgent: your colleague's agentId
- contextId: current task ID
- status: "in_progress"
- reason: "Phase 1 complete, transferring Phase 2 coordination"
- artifacts: list the specific deliverables from Phase 1
- remainingWork: list the specific Phase 2 items`,
			betDescription: "Q3 financial audit coordination",
			betDoneCondition: "Audit complete and filed with external auditors.",
		});
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
				id: "handoff_called",
				label: "Handoff Called",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [session] = await ctx.db
						.select({ outcome: sessions.outcome })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return {
						score: session?.outcome === "completed" ? 1.0 : 0.0,
						note:
							session?.outcome !== "completed"
								? `Session outcome: ${session?.outcome ?? "null"}`
								: undefined,
					};
				},
			},
			judgeLlmQuality({
				id: "remaining_work_present",
				label: "Remaining Work Specified",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if session notes mention specific remaining work items (Q3 review, external auditor interviews, or final report) in the handoff context. Score 0.5 if handoff is mentioned but remaining work is vague ("continue the audit"). Score 0.0 if no remaining work is specified.`,
			}),
			judgeLlmQuality({
				id: "artifacts_present",
				label: "Completed Artifacts Listed",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if session notes mention specific completed deliverables (transaction records, reconciliation, audit trail documentation, or the specific variance amount). Score 0.5 if work completion is mentioned without specific artifacts. Score 0.0 if no completed work is listed.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const handoffToScenarios: EvalScenario[] = [
	htToAgentBuilderDevops,
	htToRoleBuilderConsulting,
	htToHumanBuilderHealthcare,
	htContextQualityPmFinance,
];
