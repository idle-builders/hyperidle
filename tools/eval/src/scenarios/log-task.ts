/**
 * X8: Log task scenarios (interaction 7).
 *
 * Tests the log_task tool: basic logging, multi-entry append, and role diversity.
 */

import { tasks } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import {
	judgeLlmQuality,
	judgeMultipleLogEntries,
	judgeNotesLogged,
	judgeSessionCompleted,
} from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedKnowledge, seedMinimalWorld } from "../seeding.js";
import type {
	EvalScenario,
	JudgeContext,
	ScenarioSeedResult,
	SeedContext,
	TriggerContext,
	TriggerResult,
} from "../types.js";

// ---------------------------------------------------------------------------
// lt-progress-tracking-builder-legal
// ---------------------------------------------------------------------------

const ltProgressTrackingBuilderLegal: EvalScenario = {
	id: "lt-progress-tracking-builder-legal",
	description: "Builder logs progress during contract review (legal domain)",
	feature: "log_task",
	tags: ["quick"],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent working on legal contract analysis.
Your job is to review contracts and log your findings as you work.
Use the log_task tool to document your progress at multiple points during the review.
Log at least once mid-task and once when you complete major milestones.`,
			taskTitle: "Review and annotate the vendor contract for compliance",
			taskDescription: `Review the vendor contract and log your progress using log_task.

Required steps:
1. Review the contract terms (log your initial findings)
2. Check compliance clauses against standards
3. Document any issues found

Use log_task at least twice during the review to document your progress.
Your logs should be specific and actionable, not generic.`,
			betDescription: "Legal contract compliance review",
			betDoneCondition: "Contract reviewed and compliance issues documented.",
		});

		await seedKnowledge(ctx.db, {
			scopeKind: "team",
			scopeId: world.teamId,
			title: "Contract Review Standards",
			body: `# Contract Review Standards
- Check payment terms (net-30 minimum)
- Verify IP ownership clause (work-for-hire)
- Review termination notice requirements (60 days minimum)
- Audit privacy and data handling clauses
- Validate indemnification limits`,
			updatedBy: `user:${world.founderId}`,
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
			judgeNotesLogged(),
			judgeLlmQuality({
				id: "notes_quality",
				label: "Task Log Notes Quality",
				extractContent: async (ctx: JudgeContext) => {
					const [task] = await ctx.db
						.select({ notes: tasks.notes })
						.from(tasks)
						.where(eq(tasks.id, ctx.seedResult.taskId))
						.limit(1);
					return task?.notes ?? "";
				},
				criteria: `Score 1.0 if the log entries contain specific contract-related content (mentions of terms, compliance issues, or specific findings). Score 0.5 if the log entries are present but generic (e.g., "Reviewed contract"). Score 0.0 if no substantive content.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// lt-multi-entry-builder-devops
// ---------------------------------------------------------------------------

const ltMultiEntryBuilderDevops: EvalScenario = {
	id: "lt-multi-entry-builder-devops",
	description: "Builder logs multiple entries for multi-phase DevOps task",
	feature: "log_task",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent implementing DevOps infrastructure.
Use log_task to document your work at multiple stages.
You MUST call log_task at least twice: once after completing each phase.
Each log entry should describe what was completed in that phase.`,
			taskTitle: "Set up monitoring and alerting system",
			taskDescription: `Set up the monitoring and alerting system in phases. Log your progress after each phase.

Phase 1: Metrics collection
- Configure Prometheus metrics collection
- Set up exporters for key services
- Log your progress with log_task after this phase

Phase 2: Alerting rules
- Define critical alert thresholds
- Configure notification channels
- Log your progress with log_task after this phase

You must call log_task at least twice — once per phase.`,
			betDescription: "Monitoring and alerting infrastructure",
			betDoneCondition: "Monitoring system configured with alerting rules.",
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
		dimensions: [judgeSessionCompleted(), judgeNotesLogged(), judgeMultipleLogEntries()],
	},
};

// ---------------------------------------------------------------------------
// lt-discovery-pm-consulting
// ---------------------------------------------------------------------------

const ltDiscoveryPmConsulting: EvalScenario = {
	id: "lt-discovery-pm-consulting",
	description: "PM logs coordination discoveries during consulting engagement",
	feature: "log_task",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager coordinating a consulting engagement.
Your job is to coordinate stakeholders and document your findings.
Use log_task to document coordination insights, stakeholder decisions, and open questions.
Log your discoveries as you work through the coordination challenges.`,
			taskTitle: "Coordinate client engagement kickoff and document findings",
			taskDescription: `Coordinate the client engagement kickoff and log your coordination discoveries.

During the kickoff coordination:
1. Identify key stakeholders and their priorities
2. Document any alignment gaps you discover
3. Note open questions requiring follow-up

Use log_task to document your coordination findings.
Your log entries should reflect PM-level insights (stakeholder coordination, not technical details).`,
			betDescription: "Client engagement coordination",
			betDoneCondition: "Kickoff coordination documented with stakeholder insights.",
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
			judgeNotesLogged(),
			judgeLlmQuality({
				id: "notes_quality",
				label: "PM Log Notes Quality",
				extractContent: async (ctx: JudgeContext) => {
					const [task] = await ctx.db
						.select({ notes: tasks.notes })
						.from(tasks)
						.where(eq(tasks.id, ctx.seedResult.taskId))
						.limit(1);
					return task?.notes ?? "";
				},
				criteria: `Score 1.0 if the log entries reflect coordination-level insights (mentions stakeholders, priorities, decisions, or open questions). Score 0.5 if entries are present but purely operational (task completion tracking without coordination insights). Score 0.0 if entries are absent or generic boilerplate.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const logTaskScenarios: EvalScenario[] = [
	ltProgressTrackingBuilderLegal,
	ltMultiEntryBuilderDevops,
	ltDiscoveryPmConsulting,
];
