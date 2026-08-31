/**
 * X8: Create task scenarios (interaction 6).
 *
 * Tests the create_task tool: PM bet decomposition, builder subtask creation, domain diversity.
 */

import { tasks } from "@hyperidle/db";
import { and, eq, ne } from "drizzle-orm";
import { judgeLlmQuality, judgeSessionCompleted, judgeTasksCreatedCount } from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedMinimalWorld } from "../seeding.js";
import type {
	EvalScenario,
	JudgeContext,
	ScenarioSeedResult,
	SeedContext,
	TriggerContext,
	TriggerResult,
} from "../types.js";

// ---------------------------------------------------------------------------
// ct-decomposition-pm-marketing
// ---------------------------------------------------------------------------

const ctDecompositionPmMarketing: EvalScenario = {
	id: "ct-decomposition-pm-marketing",
	description: "PM decomposes marketing bet into scoped tasks with done conditions",
	feature: "create_task",
	tags: ["quick"],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager for a marketing team.
Your job is to decompose large bets into concrete, scoped tasks.
Each task must have a clear title, description, and explicit done condition.
Never create tasks that are vague or without a done condition.`,
			taskTitle: "Decompose Q4 brand campaign bet into executable tasks",
			taskDescription: `Break down the Q4 brand campaign bet into 3-5 concrete tasks.

The bet: Launch a refreshed brand identity across all marketing channels (website, email, social).

For each task you create, use create_task with:
- title: a specific, action-oriented title
- description: what needs to be done and any constraints
- doneCondition: a concrete, measurable completion criteria

Create at least 3 tasks. Good decompositions include: asset creation, copy review, channel deployment, analytics setup.`,
			betDescription: "Q4 brand campaign launch",
			betDoneCondition: "Brand identity launched across all channels with tracking in place.",
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
			judgeTasksCreatedCount(3),
			{
				id: "done_conditions_present",
				label: "Tasks Have Done Conditions",
				judge: async (ctx: JudgeContext) => {
					const allTasks = await ctx.db
						.select({ doneCondition: tasks.doneCondition })
						.from(tasks)
						.where(
							and(eq(tasks.teamId, ctx.seedResult.teamId), ne(tasks.id, ctx.seedResult.taskId)),
						);
					if (allTasks.length === 0) {
						return { score: 0.0, note: "No tasks created" };
					}
					const withDoneCondition = allTasks.filter(
						(t: { doneCondition: string | null }) => t.doneCondition && t.doneCondition.length > 10,
					).length;
					const ratio = withDoneCondition / allTasks.length;
					return {
						score: ratio >= 0.8 ? 1.0 : ratio >= 0.5 ? 0.5 : 0.0,
						note:
							ratio < 1.0
								? `${withDoneCondition}/${allTasks.length} tasks have done conditions`
								: undefined,
					};
				},
			},
			judgeLlmQuality({
				id: "decomposition_quality",
				label: "Task Decomposition Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const createdTasks = await ctx.db
						.select({
							title: tasks.title,
							description: tasks.description,
							doneCondition: tasks.doneCondition,
						})
						.from(tasks)
						.where(
							and(eq(tasks.teamId, ctx.seedResult.teamId), ne(tasks.id, ctx.seedResult.taskId)),
						);
					return JSON.stringify(createdTasks, null, 2);
				},
				criteria: `Score 1.0 if the created tasks cover distinct aspects of a brand campaign launch (e.g., different channels, phases, or work types) and each has a specific, measurable done condition. Score 0.5 if tasks are present but overlap significantly or have vague done conditions. Score 0.0 if tasks are too generic or fewer than 3 exist.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ct-subtask-builder-devops
// ---------------------------------------------------------------------------

const ctSubtaskBuilderDevops: EvalScenario = {
	id: "ct-subtask-builder-devops",
	description: "Builder creates subtasks when discovering sub-problems during DevOps work",
	feature: "create_task",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent working on infrastructure tasks.
When you discover sub-problems during your work that require separate tracking, create subtasks.
Use create_task to record these sub-problems with clear titles and done conditions.`,
			taskTitle: "Migrate CI pipeline from CircleCI to GitHub Actions",
			taskDescription: `Migrate the CI/CD pipeline from CircleCI to GitHub Actions.

As you analyze the migration, you will discover these sub-problems:
1. The existing orbs need to be converted to GitHub Actions equivalents
2. Secret management differs between the two platforms
3. The cache configuration needs to be adapted

Create a subtask for each sub-problem you discover using create_task.
Each subtask should have a specific title and a clear done condition.
You must create at least 2 subtasks.`,
			betDescription: "CI/CD migration to GitHub Actions",
			betDoneCondition: "Pipeline fully migrated and all jobs passing.",
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
			judgeTasksCreatedCount(2),
			{
				id: "done_conditions_present",
				label: "Subtasks Have Done Conditions",
				judge: async (ctx: JudgeContext) => {
					const subtasks = await ctx.db
						.select({ doneCondition: tasks.doneCondition })
						.from(tasks)
						.where(
							and(eq(tasks.teamId, ctx.seedResult.teamId), ne(tasks.id, ctx.seedResult.taskId)),
						);
					if (subtasks.length === 0) {
						return { score: 0.0, note: "No subtasks created" };
					}
					const withCondition = subtasks.filter(
						(t: { doneCondition: string | null }) => t.doneCondition && t.doneCondition.length > 5,
					).length;
					return {
						score: withCondition >= subtasks.length * 0.75 ? 1.0 : 0.5,
						note: `${withCondition}/${subtasks.length} subtasks have done conditions`,
					};
				},
			},
			{
				id: "task_relevant",
				label: "Subtasks Relevant to CI/CD Migration",
				judge: async (ctx: JudgeContext) => {
					const subtasks = await ctx.db
						.select({ title: tasks.title, description: tasks.description })
						.from(tasks)
						.where(
							and(eq(tasks.teamId, ctx.seedResult.teamId), ne(tasks.id, ctx.seedResult.taskId)),
						);
					if (subtasks.length === 0) {
						return { score: 0.0, note: "No subtasks" };
					}
					const ciKeywords = [
						"github",
						"actions",
						"orb",
						"secret",
						"cache",
						"pipeline",
						"circleci",
						"migrate",
						"workflow",
						"job",
					];
					const relevant = subtasks.filter((t: { title: string; description: string | null }) => {
						const text = `${t.title} ${t.description ?? ""}`.toLowerCase();
						return ciKeywords.some((kw) => text.includes(kw));
					}).length;
					return {
						score: relevant >= subtasks.length * 0.75 ? 1.0 : 0.5,
						note: `${relevant}/${subtasks.length} subtasks mention CI/CD migration topics`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// ct-decomposition-pm-healthcare
// ---------------------------------------------------------------------------

const ctDecompositionPmHealthcare: EvalScenario = {
	id: "ct-decomposition-pm-healthcare",
	description: "PM decomposes healthcare compliance bet into tasks with regulatory considerations",
	feature: "create_task",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager in the healthcare domain.
Your job is to decompose compliance and regulatory bets into concrete, auditable tasks.
Healthcare tasks must include regulatory requirements in their done conditions.
Be specific about which regulation (HIPAA, HL7 FHIR, HITECH) applies to each task.`,
			taskTitle: "Decompose HIPAA compliance audit bet into tasks",
			taskDescription: `Break down the annual HIPAA compliance audit into 3-5 concrete tasks.

The bet: Complete the annual HIPAA compliance audit and remediate any findings.

Key compliance areas to cover:
- Access control and audit logging
- Data encryption at rest and in transit
- Business Associate Agreement (BAA) review
- Incident response plan validation

For each task, create_task with:
- title: specific and action-oriented
- description: what needs to be done with the relevant regulation cited
- doneCondition: must include a measurable compliance criterion

Create at least 3 tasks with regulatory references in their done conditions.`,
			betDescription: "Annual HIPAA compliance audit",
			betDoneCondition: "All audit findings remediated and compliance documentation updated.",
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
			judgeTasksCreatedCount(3),
			{
				id: "done_conditions_present",
				label: "Tasks Have Done Conditions",
				judge: async (ctx: JudgeContext) => {
					const allTasks = await ctx.db
						.select({ doneCondition: tasks.doneCondition })
						.from(tasks)
						.where(
							and(eq(tasks.teamId, ctx.seedResult.teamId), ne(tasks.id, ctx.seedResult.taskId)),
						);
					if (allTasks.length === 0) {
						return { score: 0.0, note: "No tasks created" };
					}
					const withDoneCondition = allTasks.filter(
						(t: { doneCondition: string | null }) => t.doneCondition && t.doneCondition.length > 10,
					).length;
					const ratio = withDoneCondition / allTasks.length;
					return {
						score: ratio >= 0.8 ? 1.0 : ratio >= 0.5 ? 0.5 : 0.0,
						note: `${withDoneCondition}/${allTasks.length} tasks have done conditions`,
					};
				},
			},
			judgeLlmQuality({
				id: "decomposition_quality",
				label: "Healthcare Compliance Task Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const createdTasks = await ctx.db
						.select({
							title: tasks.title,
							description: tasks.description,
							doneCondition: tasks.doneCondition,
						})
						.from(tasks)
						.where(
							and(eq(tasks.teamId, ctx.seedResult.teamId), ne(tasks.id, ctx.seedResult.taskId)),
						);
					return JSON.stringify(createdTasks, null, 2);
				},
				criteria: `Score 1.0 if the created tasks cover distinct HIPAA compliance areas (e.g., access control, encryption, BAAs, incident response) AND at least one task's done condition references a specific regulation or audit criterion. Score 0.5 if tasks cover compliance topics but done conditions are generic ("task completed" style). Score 0.0 if tasks are not healthcare/compliance-specific.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const createTaskScenarios: EvalScenario[] = [
	ctDecompositionPmMarketing,
	ctSubtaskBuilderDevops,
	ctDecompositionPmHealthcare,
];
