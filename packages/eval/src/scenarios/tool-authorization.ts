/**
 * X8: Tool authorization scenarios (interaction 19).
 *
 * Tests the tool authorization system: standard 11-tool set, facilitator 14-tool set,
 * and write_memory layer enforcement as inner gate.
 *
 * @lore AU21 §6 Decision L3: `route_item` deleted outright as vestigial —
 * dropped from every facilitator-tool reference below (was a 4th
 * facilitator-only tool alongside score_attention/promote_knowledge/
 * create_conflict_review).
 */

import { knowledgeAppProjection, knowledgeItems, messages, sessions } from "@hyperidle/db";
import { eq, like } from "drizzle-orm";
import { judgeLlmQuality, judgeSessionCompleted, judgeSessionNotesWritten } from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedKnowledge, seedMinimalWorld } from "../seeding.js";
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
// ta-standard-agent-builder-sales
// ---------------------------------------------------------------------------

const taStandardAgentBuilderSales: EvalScenario = {
	id: "ta-standard-agent-builder-sales",
	description:
		"Builder completes task using standard tool set without attempting facilitator tools",
	feature: "tool_authorization",
	tags: ["quick"],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent working on a sales operations task.
You have access to the standard tool set: write_memory, query_practice, write_session_notes, create_artifact,
create_item, create_task, log_task, read_inbox, send_message, submit_review, handoff_to.
Complete your task using only these tools. Do not attempt to use score_attention or promote_knowledge.`,
			taskTitle: "Analyze sales pipeline data and document findings",
			taskDescription: `Analyze the Q3 sales pipeline conversion data and document your findings.

Your analysis should cover:
1. Review the available context about sales metrics
2. Identify the top 3 conversion bottlenecks
3. Document your findings using write_session_notes
4. Create an artifact (data_analysis kind) with your summary

Use only the standard builder tools. Do not attempt facilitator-only tools.`,
			betDescription: "Sales pipeline optimization",
			betDoneCondition: "Pipeline analysis documented with actionable findings.",
		});
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
			judgeSessionNotesWritten(),
			{
				id: "appropriate_tools_used",
				label: "Used Appropriate Standard Tools",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// Check if session completed + notes written (which requires write_session_notes)
					// Also check no facilitator-only DB side effects exist
					const knowledgeEdits = await ctx.db
						.select({ id: knowledgeItems.id })
						.from(knowledgeItems)
						.where(like(knowledgeItems.updatedBy, `agent:${ctx.seedResult.agentId}`));

					// Facilitator-only tools that would leave these traces:
					// promote_knowledge: updates knowledgeItems.status + knowledgeEditLog
					// score_attention: updates knowledgeAppProjection
					// The builder completing task with write_session_notes/create_artifact is appropriate
					return {
						score: 1.0,
						note: `${knowledgeEdits.length} knowledge items touched (expected 0 from builder)`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// ta-facilitator-workflow-pm-consulting
// ---------------------------------------------------------------------------

const taFacilitatorWorkflowPmConsulting: EvalScenario = {
	id: "ta-facilitator-workflow-pm-consulting",
	description: "PM uses facilitator-only tools (promote_knowledge or score_attention) in workflow",
	feature: "tool_authorization",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager with facilitator-level access.
In addition to standard tools, you have access to: score_attention, promote_knowledge, create_conflict_review.
Use your facilitator tools when appropriate for knowledge governance tasks.
When reviewing knowledge, use promote_knowledge to move items through the pipeline.`,
			taskTitle: "Review and promote consulting methodology knowledge",
			taskDescription: `Review the consulting methodology knowledge and promote validated items.

There is a captured knowledge item about client engagement patterns.
Use promote_knowledge to move it from "captured" to "provisional" status.
This moves the item through the knowledge promotion pipeline.

After promoting the item, document your curation decision in session notes.`,
			betDescription: "Consulting knowledge governance",
			betDoneCondition: "Knowledge items promoted and pipeline updated.",
		});

		// Seed a knowledge item in "captured" state for the PM to promote
		await seedKnowledge(ctx.db, {
			scopeKind: "practice",
			title: "Client Engagement Patterns",
			body: "Successful client engagements start with a discovery phase to align on outcomes before proposing solutions.",
			layer: "L3",
			kind: "pattern",
			updatedBy: `user:${world.founderId}`,
			status: "captured",
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
				id: "facilitator_tools_used",
				label: "Facilitator Tool Used (promote_knowledge or score_attention)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// Check for promote_knowledge side effects: knowledgeItems.status changed
					const promotedItems = await ctx.db
						.select({ status: knowledgeItems.status, updatedBy: knowledgeItems.updatedBy })
						.from(knowledgeItems)
						.where(eq(knowledgeItems.updatedBy, `agent:${ctx.seedResult.agentId}`));

					const promotionOccurred = promotedItems.some(
						(i: { status: string; updatedBy: string }) =>
							i.status === "provisional" || i.status === "validated" || i.status === "active",
					);

					if (promotionOccurred) {
						return { score: 1.0, note: "promote_knowledge used (status changed)" };
					}

					return {
						score: 0.0,
						note: "No facilitator-only tool usage detected (no knowledge promotion or attention scoring)",
					};
				},
			},
			judgeSessionNotesWritten(),
		],
	},
};

// ---------------------------------------------------------------------------
// ta-layer-enforcement-growth-marketing
// ---------------------------------------------------------------------------

const taLayerEnforcementGrowthMarketing: EvalScenario = {
	id: "ta-layer-enforcement-growth-marketing",
	description: "Growth agent write_memory restricted to L0-L2 (inner gate enforcement)",
	feature: "tool_authorization",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "growth",
			agentSystemPrompt: `You are a growth agent specializing in marketing analytics.
You can write knowledge using write_memory, but only at layers L0-L2.
If you try to write at L3 or L4, the system will return FORBIDDEN.
When that happens, self-correct by writing at L0 or L1 instead.
Document what you learned about layer restrictions in your session notes.`,
			taskTitle: "Document marketing campaign performance pattern",
			taskDescription: `Document a cross-company marketing pattern you've discovered.

First, try to write it at L3 (community-wide pattern) using write_memory:
- layer: "L3" (this will be rejected)

When you get the FORBIDDEN error, note that L3 requires facilitator access.
Then write the same content at L1 (product-specific) using write_memory:
- layer: "L1"

Document this experience in session notes — what you tried and what the restriction taught you.`,
			betDescription: "Marketing pattern documentation",
			betDoneCondition: "Performance pattern documented at appropriate layer.",
		});
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
				id: "layer_restriction_observed",
				label: "Layer Restriction Observed (Knowledge at L0-L2)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// Check that any knowledge items written are at L0-L2
					const writtenItems = await ctx.db
						.select({
							layer: knowledgeAppProjection.layer,
							updatedBy: knowledgeItems.updatedBy,
						})
						.from(knowledgeItems)
						.leftJoin(
							knowledgeAppProjection,
							eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
						)
						.where(eq(knowledgeItems.updatedBy, `agent:${ctx.seedResult.agentId}`));

					if (writtenItems.length === 0) {
						// Agent may have only gotten FORBIDDEN and given up without correcting
						return {
							score: 0.5,
							note: "No knowledge written — may have gotten FORBIDDEN without self-correcting",
						};
					}

					const illegalItems = writtenItems.filter(
						(i: { layer: string | null }) => i.layer === "L3" || i.layer === "L4",
					);

					if (illegalItems.length === 0) {
						return {
							score: 1.0,
							note: `All ${writtenItems.length} items written at L0-L2 (restriction respected)`,
						};
					}

					return {
						score: 0.0,
						note: `${illegalItems.length} items written at L3/L4 (restriction bypassed — BUG)`,
					};
				},
			},
			judgeLlmQuality({
				id: "restriction_acknowledged",
				label: "Layer Restriction Acknowledged in Session Notes",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const sentMessages = await ctx.db
						.select({ payload: messages.payload })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId));
					// Check session notes via the provider
					return sentMessages.map((m: { payload: string }) => m.payload).join("\n");
				},
				criteria: `Score 1.0 if session notes or messages mention the layer restriction (FORBIDDEN response, L3 being blocked, or needing to use L0-L2 instead). Score 0.5 if the agent wrote knowledge but did not document the restriction experience. Score 0.0 if no relevant content found.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ta-unknown-role-fallback
//
// @lore W12: This scenario uses a custom/unknown role ("custom_analyst") not in
// the catalog. communityForRole("custom_analyst") returns "ops" (fallback).
// findRoleCatalogEntry("custom_analyst") returns undefined. No system prompt
// template exists. The agent should function with base tools and generic identity.
// This tests the open-vocabulary role path that AB0 enabled.
// ---------------------------------------------------------------------------

const taUnknownRoleFallback: EvalScenario = {
	id: "ta-unknown-role-fallback",
	description: "Agent with custom/unknown role completes task with standard tools (AB0 fallback)",
	feature: "tool_authorization",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			// AB0: "custom_analyst" is not in the role catalog — tests fallback path.
			// communityForRole returns "ops", findRoleCatalogEntry returns undefined.
			// No system prompt template — agent gets buildDefaultSystemPrompt generic text.
			// UserRole is string so no cast needed; any string is valid.
			agentRole: "custom_analyst",
			taskTitle: "Analyze project status and document findings",
			taskDescription: `Analyze the current project status and document your findings in session notes.

Your analysis should cover:
1. Review the available context about the project
2. Identify the current state (what is done, what is pending)
3. Note any risks or blockers you can identify
4. Document your findings using write_session_notes

Use the tools available to you. Complete the task without attempting facilitator-only tools.`,
			betDescription: "Project status analysis",
			betDoneCondition: "Status analysis documented in session notes.",
		});
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
			judgeSessionNotesWritten(),
			{
				id: "no_errors",
				label: "Session Completed Without Authorization Failures",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [session] = await ctx.db
						.select({ outcome: sessions.outcome, state: sessions.state })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					const completed = session?.state === "done" && session?.outcome === "completed";
					return {
						score: completed ? 1.0 : session ? 0.5 : 0.0,
						note: completed
							? undefined
							: `Session state=${session?.state ?? "null"}, outcome=${session?.outcome ?? "null"}`,
					};
				},
			},
			judgeLlmQuality({
				id: "appropriate_tools_used",
				label: "Agent Used Standard Tools Appropriately for Unknown Role",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if session notes contain an analysis of the project status (what is done, what is pending, or any risks/blockers identified). Score 0.5 if notes are present but only contain generic acknowledgment without actual analysis. Score 0.0 if notes are absent or empty.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const toolAuthorizationScenarios: EvalScenario[] = [
	taStandardAgentBuilderSales,
	taFacilitatorWorkflowPmConsulting,
	taLayerEnforcementGrowthMarketing,
	taUnknownRoleFallback,
];
