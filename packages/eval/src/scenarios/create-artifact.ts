/**
 * X8: Create artifact scenarios (interaction 4).
 *
 * Tests the create_artifact tool: code_diff preview, decision content, verification preview.
 */

import { artifacts } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import {
	judgeCostTracked,
	judgeCreateArtifactCalled,
	judgeLlmQuality,
	judgeSessionCompleted,
} from "../judges.js";
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
// ca-code-diff-builder-devops
// ---------------------------------------------------------------------------

const caCodeDiffBuilderDevops: EvalScenario = {
	id: "ca-code-diff-builder-devops",
	description: "Builder creates a code_diff artifact with structured preview for DevOps task",
	feature: "create_artifact",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSoulPrompt: `You are a builder agent implementing DevOps infrastructure changes.
When you complete implementation work, you MUST record the output as an artifact using create_artifact.
For code changes, use kind="code_diff" and provide a structured preview showing the file and changes made.`,
			taskTitle: "Refactor Kubernetes deployment manifest",
			taskDescription: `Refactor the Kubernetes deployment manifest to add resource limits and health checks.

After analyzing the required changes, use create_artifact with:
- kind: "code_diff"
- preview: { kind: "code_diff", file: "k8s/deployment.yaml", hunks: ["- replicas: 1\\n+ replicas: 3\\n+ resources:\\n+   limits:\\n+     cpu: 500m"] }

Document your changes in session notes.`,
			betDescription: "Kubernetes deployment hardening",
			betDoneCondition: "Deployment manifest updated with resource limits and health checks.",
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
			judgeCreateArtifactCalled(),
			judgeCostTracked(),
			{
				id: "kind_correctness",
				label: "Artifact Kind Correct (code_diff)",
				judge: async (ctx: JudgeContext) => {
					const [artifact] = await ctx.db
						.select({ kind: artifacts.kind })
						.from(artifacts)
						.where(eq(artifacts.producingTaskId, ctx.seedResult.taskId))
						.limit(1);
					const correct = artifact?.kind === "code_diff";
					return {
						score: correct ? 1.0 : artifact ? 0.5 : 0.0,
						note: correct
							? undefined
							: artifact
								? `Wrong kind: ${artifact.kind}`
								: "No artifact created",
					};
				},
			},
			{
				id: "preview_valid",
				label: "Preview JSON Structure Valid",
				judge: async (ctx: JudgeContext) => {
					const [artifact] = await ctx.db
						.select({ previewJson: artifacts.previewJson })
						.from(artifacts)
						.where(eq(artifacts.producingTaskId, ctx.seedResult.taskId))
						.limit(1);
					if (!artifact?.previewJson) {
						return { score: 0.0, note: "No preview JSON found" };
					}
					try {
						const preview = JSON.parse(artifact.previewJson) as Record<string, unknown>;
						const hasFile = typeof preview.file === "string";
						const hasHunks = Array.isArray(preview.hunks);
						if (hasFile && hasHunks) {
							return { score: 1.0 };
						}
						return {
							score: 0.5,
							note: `Preview missing fields: file=${hasFile}, hunks=${hasHunks}`,
						};
					} catch {
						return { score: 0.0, note: "Preview JSON parse error" };
					}
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// ca-decision-pm-healthcare
// ---------------------------------------------------------------------------

const caDecisionPmHealthcare: EvalScenario = {
	id: "ca-decision-pm-healthcare",
	description: "PM creates a decision artifact with compliance rationale for healthcare",
	feature: "create_artifact",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSoulPrompt: `You are a product manager in the healthcare domain.
When making significant product decisions, record them as decision artifacts using create_artifact.
Healthcare decisions require thorough rationale citing regulatory constraints (HIPAA, HL7 FHIR).
Use kind="decision" with a structured preview that includes your claim and rationale.`,
			taskTitle: "Document data retention policy decision for patient records",
			taskDescription: `Make and document a formal decision about patient data retention policy.

The decision context:
- HIPAA requires minimum 6-year retention for adults
- State law may require longer retention (up to 10 years in some states)
- Storage costs are a secondary concern

Use create_artifact with:
- kind: "decision"
- preview: a structured decision with your claim (recommended policy) and rationale

Your decision should cite specific regulatory requirements.`,
			betDescription: "HIPAA compliance data governance",
			betDoneCondition: "Data retention policy decision documented with regulatory rationale.",
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
			judgeCreateArtifactCalled(),
			{
				id: "kind_correctness",
				label: "Artifact Kind Correct (decision)",
				judge: async (ctx: JudgeContext) => {
					const [artifact] = await ctx.db
						.select({ kind: artifacts.kind })
						.from(artifacts)
						.where(eq(artifacts.producingTaskId, ctx.seedResult.taskId))
						.limit(1);
					const correct = artifact?.kind === "decision";
					return {
						score: correct ? 1.0 : artifact ? 0.5 : 0.0,
						note: correct ? undefined : artifact ? `Wrong kind: ${artifact.kind}` : "No artifact",
					};
				},
			},
			judgeLlmQuality({
				id: "decision_quality",
				label: "Decision Rationale Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [artifact] = await ctx.db
						.select({ previewJson: artifacts.previewJson })
						.from(artifacts)
						.where(eq(artifacts.producingTaskId, ctx.seedResult.taskId))
						.limit(1);
					return artifact?.previewJson ?? "";
				},
				criteria: `Score 1.0 if the decision preview contains a specific claim (the chosen policy) AND rationale that cites a regulatory requirement (HIPAA, state law, or specific year requirements). Score 0.5 if a claim is present but rationale is generic (no specific regulatory cite). Score 0.0 if no claim or no rationale.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ca-verification-builder-frontend
// ---------------------------------------------------------------------------

const caVerificationBuilderFrontend: EvalScenario = {
	id: "ca-verification-builder-frontend",
	description: "Builder creates a verification artifact with test counts for frontend work",
	feature: "create_artifact",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSoulPrompt: `You are a builder agent implementing frontend components.
After verifying your work with tests, record the verification results as an artifact using create_artifact.
Use kind="verification" with a preview showing the test suite name, total tests, passed count, and failed count.`,
			taskTitle: "Verify accessible modal component test suite",
			taskDescription: `You have implemented an accessible modal component. Record the verification results as an artifact.

Use create_artifact with:
- kind: "verification"
- preview: { kind: "verification", suite: "Modal accessibility suite", total: 12, passed: 12, failed: 0 }

The numbers should reflect a passing test run (all 12 tests pass).
Also write session notes summarizing the verification outcome.`,
			betDescription: "Frontend accessibility component library",
			betDoneCondition: "Modal component verified with test results documented.",
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
			judgeCreateArtifactCalled(),
			{
				id: "kind_correctness",
				label: "Artifact Kind Correct (verification)",
				judge: async (ctx: JudgeContext) => {
					const [artifact] = await ctx.db
						.select({ kind: artifacts.kind })
						.from(artifacts)
						.where(eq(artifacts.producingTaskId, ctx.seedResult.taskId))
						.limit(1);
					const correct = artifact?.kind === "verification";
					return {
						score: correct ? 1.0 : artifact ? 0.5 : 0.0,
						note: correct ? undefined : artifact ? `Wrong kind: ${artifact.kind}` : "No artifact",
					};
				},
			},
			{
				id: "preview_valid",
				label: "Verification Preview Has Numeric Fields",
				judge: async (ctx: JudgeContext) => {
					const [artifact] = await ctx.db
						.select({ previewJson: artifacts.previewJson })
						.from(artifacts)
						.where(eq(artifacts.producingTaskId, ctx.seedResult.taskId))
						.limit(1);
					if (!artifact?.previewJson) {
						return { score: 0.0, note: "No preview JSON" };
					}
					try {
						const preview = JSON.parse(artifact.previewJson) as Record<string, unknown>;
						const hasTotal = typeof preview.total === "number";
						const hasPassed = typeof preview.passed === "number";
						const hasFailed = typeof preview.failed === "number";
						if (hasTotal && hasPassed && hasFailed) {
							return { score: 1.0 };
						}
						return {
							score: 0.5,
							note: `Missing numeric fields: total=${hasTotal}, passed=${hasPassed}, failed=${hasFailed}`,
						};
					} catch {
						return { score: 0.0, note: "Preview parse error" };
					}
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const createArtifactScenarios: EvalScenario[] = [
	caCodeDiffBuilderDevops,
	caDecisionPmHealthcare,
	caVerificationBuilderFrontend,
];
