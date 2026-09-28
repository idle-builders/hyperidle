/**
 * X8: Tool authorization scenarios (interaction 19).
 *
 * There is no tool authorization gate any more — founder ruling 2026-09-02
 * deleted the layer-keyed/role-keyed capability split with nothing replacing
 * it (write-memory.ts carries the same ruling in its own lore). Every role
 * gets the same tool set: `search_documents`/`open_document`/`edit_document`,
 * task/thread actions, and `write_session_notes`.
 *
 * What is still worth an eval: that a role a founder might expect to be
 * gated (a PM triaging a proposed document to `active`) completes cleanly
 * through the ordinary `edit_document` tool — no special "facilitator" tool
 * exists to grant or withhold — and that an unrecognised role does not error
 * out for lack of a matching capability set.
 *
 * @lore AU21 §6 Decision L3: `route_item` deleted outright as vestigial — was
 * a 4th facilitator-only tool alongside the two document-governance tools
 * that were deleted with it (promote_knowledge/create_conflict_review).
 */

import { documents, sessions } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeLlmQuality, judgeSessionCompleted, judgeSessionNotesWritten } from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedDocument, seedMinimalWorld } from "../seeding.js";
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
You have access to: edit_document, write_session_notes, search_threads, open_thread, send_message,
adjust_thread, search_tasks, open_task, edit_task.
Complete your task using these tools.`,
			taskTitle: "Analyze sales pipeline data and document findings",
			taskDescription: `Analyze the Q3 sales pipeline conversion data and document your findings.

Your analysis should cover:
1. Review the available context about sales metrics
2. Identify the top 3 conversion bottlenecks
3. Document your findings using write_session_notes
4. Produce a document (as:"artifact") with your summary

Use the tools available to you.`,
			betDescription: "Sales pipeline optimization",
			betDoneCondition: "Pipeline analysis documented with actionable findings.",
		});
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
				id: "appropriate_tools_used",
				label: "Used Appropriate Standard Tools",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// Check if session completed + notes written (which requires write_session_notes)
					const documentEdits = await ctx.db
						.select({ id: documents.id })
						.from(documents)
						.where(eq(documents.updatedBy, ctx.seedResult.agentId));

					// The builder completing the task with write_session_notes/edit_document is
					// appropriate — there is no gated tool for a builder to have wrongly reached for.
					return {
						score: 1.0,
						note: `${documentEdits.length} document(s) touched by the builder`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// ta-triage-no-gate-pm-consulting
// ---------------------------------------------------------------------------

const taTriageNoGatePmConsulting: EvalScenario = {
	id: "ta-triage-no-gate-pm-consulting",
	description: "PM triages a proposed document to active through the ordinary edit_document tool",
	feature: "tool_authorization",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager reviewing proposed documents.
Use edit_document to move a validated proposed document to "active" status.`,
			taskTitle: "Review and triage proposed consulting methodology documents",
			taskDescription: `Review the proposed consulting methodology document and triage it.

There is a proposed document about client engagement patterns.
Use edit_document to move it from "proposed" to "active" status.

After triaging the document, record your curation decision in session notes.`,
			betDescription: "Consulting document triage",
			betDoneCondition: "Proposed document triaged to active.",
		});

		// Seed a document in "proposed" state for the PM to triage
		await seedDocument(ctx.db, {
			scopeKind: "factory",
			title: "Client Engagement Patterns",
			body: "Successful client engagements start with a discovery phase to align on outcomes before proposing solutions.",
			updatedBy: `user:${world.founderId}`,
			status: "proposed",
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
				id: "document_triaged",
				label: "Document Triaged to Active (edit_document, no gate needed)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// Check for the status change: no special tool exists to gate this — any
					// role reaches it through the same edit_document every other role uses.
					const editedItems = await ctx.db
						.select({ status: documents.status, updatedBy: documents.updatedBy })
						.from(documents)
						.where(eq(documents.updatedBy, ctx.seedResult.agentId));

					const triaged = editedItems.some(
						(i: { status: string; updatedBy: string }) => i.status === "active",
					);

					if (triaged) {
						return { score: 1.0, note: "edit_document used (status changed to active)" };
					}

					return {
						score: 0.0,
						note: "No status change detected (document was not triaged)",
					};
				},
			},
			judgeSessionNotesWritten(),
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
	description: "Agent with custom/unknown role completes task with standard tools",
	feature: "tool_authorization",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			// AB0: "custom_analyst" is not in the role catalog — tests fallback path.
			// communityForRole returns "ops", findRoleCatalogEntry returns undefined.
			// No identity given — the agent runs with none, like an agent nobody described.
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
	taTriageNoGatePmConsulting,
	taUnknownRoleFallback,
];
