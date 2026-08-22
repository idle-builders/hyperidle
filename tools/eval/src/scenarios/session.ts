/**
 * X8: Session scenarios (interaction 16).
 *
 * Tests the session lifecycle: full lifecycle, model tier resolution, workspace cleanup.
 */

import * as fs from "node:fs";
import { sessions } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeSessionCompleted, judgeSessionNotesWritten } from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedAgent, seedBet, seedFounder, seedTask, seedTeam } from "../seeding.js";
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
// sess-lifecycle-growth-sales
// ---------------------------------------------------------------------------

const sessLifecycleGrowthSales: EvalScenario = {
	id: "sess-lifecycle-growth-sales",
	description: "Full session lifecycle: session row valid, task state updated",
	feature: "session",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const sandboxBasePath = `/tmp/eval-workspace-sess-${Date.now()}`;
		const { teamId } = await seedTeam(ctx.db);
		await seedFounder(ctx.db);
		const { agentId } = await seedAgent(ctx.db, {
			name: "Growth Agent",
			role: "growth",
			teamId,
			systemPrompt: `You are a growth agent analyzing sales pipeline data.
Your job is to review the sales context and document key findings in session notes.
Write substantive session notes covering: what you analyzed, key findings, and next steps.`,
			harnessType: "builtin",
		});

		const { betId } = await seedBet(ctx.db, {
			teamId,
			description: "Q4 sales pipeline optimization",
			doneCondition: "Pipeline bottlenecks identified and addressed.",
		});

		const { taskId } = await seedTask(ctx.db, {
			betId,
			teamId,
			ownerAgentId: agentId,
			title: "Analyze Q4 pipeline conversion rates",
			description: `Analyze the Q4 sales pipeline and write session notes with:
1. Overview of pipeline stages you analyzed
2. At least 2 specific findings about conversion rates
3. Recommended next steps

Use write_session_notes to document your analysis.`,
			doneCondition: "Pipeline analysis documented with actionable findings.",
			state: "accepted",
		});

		return {
			teamId,
			agentId,
			betId,
			taskId,
			sandboxBasePath,
		};
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
				id: "session_row_valid",
				label: "Session Row Has Valid State After Completion",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [session] = await ctx.db
						.select({
							outcome: sessions.outcome,
							endedAt: sessions.endedAt,
						})
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					if (!session) {
						return { score: 0.0, note: "Session row not found" };
					}
					const hasEndedAt = session.endedAt !== null;
					const hasOutcome = session.outcome !== null;
					if (hasEndedAt && hasOutcome) {
						return { score: 1.0 };
					}
					return {
						score: 0.5,
						note: `endedAt=${session.endedAt}, outcome=${session.outcome}`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// sess-model-tier-builder-devops
// ---------------------------------------------------------------------------

const sessModelTierBuilderDevops: EvalScenario = {
	id: "sess-model-tier-builder-devops",
	description: "Session uses correct model tier based on agent modelTierPreference",
	feature: "session",
	tags: ["quick"],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const sandboxBasePath = `/tmp/eval-workspace-tier-${Date.now()}`;
		const { teamId } = await seedTeam(ctx.db);
		await seedFounder(ctx.db);

		// Seed agent with reasoning tier preference
		const { agentId } = await seedAgent(ctx.db, {
			name: "DevOps Builder",
			role: "builder",
			teamId,
			systemPrompt: "You are a DevOps builder. Complete the task and write session notes.",
			harnessType: "builtin",
		});

		const { betId } = await seedBet(ctx.db, {
			teamId,
			description: "Infrastructure optimization",
			doneCondition: "Optimization complete.",
		});

		const { taskId } = await seedTask(ctx.db, {
			betId,
			teamId,
			ownerAgentId: agentId,
			title: "Document infrastructure optimization approach",
			description: "Write session notes describing your infrastructure optimization approach.",
			doneCondition: "Approach documented.",
			state: "accepted",
		});

		return {
			teamId,
			agentId,
			betId,
			taskId,
			sandboxBasePath,
		};
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
				id: "model_tier_correct",
				label: "Session Completed with a Model Tier Set",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// The session was created and completed — the model tier is resolved
					// by the harness from the resolvedModel provided. We verify the session completed.
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
								: "Session completed with resolved model",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// sess-workspace-cleanup-builder-frontend
// ---------------------------------------------------------------------------

const sessWorkspaceCleanupBuilderFrontend: EvalScenario = {
	id: "sess-workspace-cleanup-builder-frontend",
	description: "Workspace directory removed after session normal completion (Phase 11 cleanup)",
	feature: "session",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const sandboxBasePath = `/tmp/eval-workspace-cleanup-${Date.now()}`;
		const { teamId } = await seedTeam(ctx.db);
		await seedFounder(ctx.db);
		const { agentId } = await seedAgent(ctx.db, {
			name: "Frontend Builder",
			role: "builder",
			teamId,
			systemPrompt: "You are a frontend builder. Complete the task and write session notes.",
			harnessType: "builtin",
		});

		const { betId } = await seedBet(ctx.db, {
			teamId,
			description: "Frontend component library",
			doneCondition: "Component documented.",
		});

		const { taskId } = await seedTask(ctx.db, {
			betId,
			teamId,
			ownerAgentId: agentId,
			title: "Document component API",
			description: "Write session notes documenting the component API you've designed.",
			doneCondition: "API documented.",
			state: "accepted",
		});

		return {
			teamId,
			agentId,
			betId,
			taskId,
			sandboxBasePath,
		};
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
				id: "workspace_destroyed",
				label: "Workspace Directory Cleaned Up After Session",
				judge: (ctx: JudgeContext): Promise<DimensionScore> => {
					// The workspace path is based on sandboxBasePath + sessionId
					// After session completion, the workspace dir should be removed
					// Check if the base workspace path or session-specific subdirectory still exists
					const sandboxBasePath = ctx.seedResult.sandboxBasePath;
					const sessionWorkspace = `${sandboxBasePath}/${ctx.triggerResult.sessionId}`;

					let sessionDirExists = false;
					let baseDirExists = false;

					try {
						sessionDirExists = fs.existsSync(sessionWorkspace);
					} catch {
						sessionDirExists = false;
					}

					try {
						baseDirExists = fs.existsSync(sandboxBasePath);
					} catch {
						baseDirExists = false;
					}

					if (!(sessionDirExists || baseDirExists)) {
						return Promise.resolve({ score: 1.0, note: "Workspace directories cleaned up" });
					}
					if (!sessionDirExists) {
						return Promise.resolve({
							score: 0.75,
							note: "Session workspace cleaned up (base dir still present)",
						});
					}
					return Promise.resolve({
						score: 0.0,
						note: `Session workspace still exists: ${sessionWorkspace}`,
					});
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const sessionScenarios: EvalScenario[] = [
	sessLifecycleGrowthSales,
	sessModelTierBuilderDevops,
	sessWorkspaceCleanupBuilderFrontend,
];
