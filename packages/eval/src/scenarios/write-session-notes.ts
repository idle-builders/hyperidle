/**
 * X8: Write session notes scenarios (interaction 3).
 *
 * Tests the write_session_notes tool: content quality and append mode.
 * The POC scenario already covers basic usage; these test content quality + append.
 */

import { sessions } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeLlmQuality, judgeSessionCompleted, judgeSessionNotesWritten } from "../judges.js";
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
// wsn-quality-growth-sales
// ---------------------------------------------------------------------------

const wsnQualityGrowthSales: EvalScenario = {
	id: "wsn-quality-growth-sales",
	description: "Growth agent writes quality session notes for sales pipeline analysis",
	feature: "write_session_notes",
	tags: ["quick"],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "growth",
			agentSystemPrompt: `You are a growth agent specializing in sales pipeline optimization.
Your job is to analyze sales metrics and document insights for the team.
Always write thorough session notes that capture: what you analyzed, key findings, and recommended next steps.
When given a sales analysis task, document your methodology and conclusions clearly.`,
			taskTitle: "Analyze Q4 sales pipeline conversion rates",
			taskDescription: `Analyze the current sales pipeline and write session notes documenting your findings.

Review the available context about the sales pipeline and:
1. Assess conversion rates at each stage
2. Identify bottlenecks or opportunities
3. Write session notes using write_session_notes that include:
   - What you analyzed
   - Key findings (at least 2 specific insights)
   - Recommended next steps (at least 1 action item)

Your session notes must be substantive — not generic boilerplate.`,
			betDescription: "Q4 sales pipeline optimization",
			betDoneCondition: "Pipeline analysis documented with actionable insights.",
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
			judgeSessionNotesWritten(),
			judgeLlmQuality({
				id: "notes_quality",
				label: "Session Notes Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if the session notes contain all 3 of: (1) a description of what was analyzed, (2) at least one specific finding or insight, (3) at least one recommended action or next step. Score 0.5 if 2 of 3 are present. Score 0.0 if only 1 or fewer are present.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// wsn-append-builder-devops
// ---------------------------------------------------------------------------

const wsnAppendBuilderDevops: EvalScenario = {
	id: "wsn-append-builder-devops",
	description: "Builder writes session notes with append=true for multi-phase DevOps task",
	feature: "write_session_notes",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent implementing DevOps infrastructure.
Your job is to implement tasks in phases and document each phase.
When completing multi-phase work, use write_session_notes with append=true after each phase to progressively build your documentation.
Document phase 1 first, then append phase 2 notes to the existing notes.`,
			taskTitle: "Implement CI/CD pipeline in two phases",
			taskDescription: `Implement the CI/CD pipeline infrastructure in two phases and document each phase.

Phase 1: Setup (document this first)
- Configure build environment
- Set up automated testing

Phase 2: Deploy (append to existing notes)
- Configure deployment pipeline
- Set up monitoring

For each phase, call write_session_notes to document what you did.
For phase 2, use append=true to add to the notes from phase 1 (not overwrite them).
Your final session notes should contain documentation of BOTH phases.`,
			betDescription: "CI/CD pipeline implementation",
			betDoneCondition: "Pipeline implemented and documented in two phases.",
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
			judgeSessionNotesWritten(),
			{
				id: "notes_appended",
				label: "Session Notes Contain Both Phases",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);

					if (!session?.notes) {
						return { score: 0.0, note: "No session notes found" };
					}

					const lowerNotes = session.notes.toLowerCase();
					const hasPhase1 =
						lowerNotes.includes("phase 1") ||
						lowerNotes.includes("setup") ||
						lowerNotes.includes("build environment") ||
						lowerNotes.includes("testing");
					const hasPhase2 =
						lowerNotes.includes("phase 2") ||
						lowerNotes.includes("deploy") ||
						lowerNotes.includes("monitoring") ||
						lowerNotes.includes("pipeline");

					if (hasPhase1 && hasPhase2) {
						return { score: 1.0, note: "Notes contain content from both phases" };
					}
					if (hasPhase1 || hasPhase2) {
						return {
							score: 0.5,
							note: "Notes contain only one phase (append may not have been used)",
						};
					}
					return { score: 0.0, note: "Notes lack content from either phase" };
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const writeSessionNotesScenarios: EvalScenario[] = [
	wsnQualityGrowthSales,
	wsnAppendBuilderDevops,
];
