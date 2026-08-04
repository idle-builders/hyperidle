/**
 * X8: Create artifact scenarios (interaction 4).
 *
 * Tests the create_artifact tool: code (pure content) preview, decision content, verification preview.
 * @lore AM5 K4b: code_diff kind + {file,hunks} shape PURGED. Now uses kind="code" + {path,lang,text}.
 */

import { artifacts } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeCreateArtifactCalled, judgeLlmQuality, judgeSessionCompleted } from "../judges.js";
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

// AM5 K4b: renamed from ca-code-diff-builder-devops to ca-code-builder-devops
const caCodeDiffBuilderDevops: EvalScenario = {
	id: "ca-code-builder-devops",
	description: "Builder creates a code artifact with pure {path,lang,text} preview for DevOps task",
	feature: "create_artifact",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent implementing DevOps infrastructure changes.
When you complete implementation work, you MUST record the output as an artifact using create_artifact.
For code changes, use kind="code" and provide a structured preview showing the file path, language, and content.`,
			taskTitle: "Refactor Kubernetes deployment manifest",
			taskDescription: `Refactor the Kubernetes deployment manifest to add resource limits and health checks.

After analyzing the required changes, use create_artifact with:
- kind: "code"
- preview: { kind: "code", path: "k8s/deployment.yaml", lang: "yaml", text: "replicas: 3\\nresources:\\n  limits:\\n    cpu: 500m" }

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
			judgeCreateArtifactCalled(),
			{
				id: "kind_correctness",
				// AM5 K4b: kind changed from code_diff to code
				label: "Artifact Kind Correct (code)",
				judge: async (ctx: JudgeContext) => {
					const [artifact] = await ctx.db
						.select({ kind: artifacts.kind })
						.from(artifacts)
						.where(eq(artifacts.producingTaskId, ctx.seedResult.taskId))
						.limit(1);
					const correct = artifact?.kind === "code";
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
				// AM5 K4b: preview shape changed from {file,hunks} to {path,lang,text}
				label: "Preview JSON Structure Valid (pure code shape)",
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
						const hasPath = typeof preview.path === "string";
						const hasText = typeof preview.text === "string";
						if (hasPath && hasText) {
							return { score: 1.0 };
						}
						return {
							score: 0.5,
							note: `Preview missing fields: path=${hasPath}, text=${hasText}`,
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
			agentSystemPrompt: `You are a product manager in the healthcare domain.
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
			agentSystemPrompt: `You are a builder agent implementing frontend components.
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
// ca-design-artifact-designer-frontend
// ---------------------------------------------------------------------------

const caDesignArtifactDesignerFrontend: EvalScenario = {
	id: "ca-design-artifact-designer-frontend",
	description: "Designer creates a design artifact with component spec preview for frontend work",
	feature: "create_artifact",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "designer",
			agentSystemPrompt: `You are a product designer on the frontend team.
You own the user experience. When you complete a component specification, record it as a design artifact.
Use create_artifact with kind="design" and a preview describing the component name, interaction states, and key interactions.
You do NOT write application code. Shape the interaction model and hand off to the Builder.`,
			taskTitle: "Create component specification for the notification center redesign",
			taskDescription: `Create a component specification artifact for the notification center redesign.

The notification center needs:
- A bell icon in the header with unread count badge
- A dropdown panel showing recent notifications grouped by type
- Individual notification rows with dismiss and mark-as-read actions
- Empty state for "no notifications"

Use create_artifact with:
- kind: "design"
- preview: { kind: "design", component: "NotificationCenter", states: ["idle", "open", "empty", "loading"], interactions: ["dismiss", "mark-read", "view-all"] }

Document the design rationale in session notes.`,
			betDescription: "Frontend notification center redesign",
			betDoneCondition: "Component specification delivered to builder for implementation.",
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
			judgeCreateArtifactCalled(),
			{
				id: "kind_correctness",
				label: "Artifact Kind Correct (design)",
				judge: async (ctx: JudgeContext) => {
					const [artifact] = await ctx.db
						.select({ kind: artifacts.kind })
						.from(artifacts)
						.where(eq(artifacts.producingTaskId, ctx.seedResult.taskId))
						.limit(1);
					const correct = artifact?.kind === "design";
					return {
						score: correct ? 1.0 : artifact ? 0.5 : 0.0,
						note: correct ? undefined : artifact ? `Wrong kind: ${artifact.kind}` : "No artifact",
					};
				},
			},
			{
				id: "preview_valid",
				label: "Design Preview Has Component Spec Fields",
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
						const hasComponent = typeof preview.component === "string";
						const hasStates = Array.isArray(preview.states) && preview.states.length > 0;
						if (hasComponent && hasStates) {
							return { score: 1.0 };
						}
						return {
							score: 0.5,
							note: `Preview missing fields: component=${hasComponent}, states=${hasStates}`,
						};
					} catch {
						return { score: 0.0, note: "Preview JSON parse error" };
					}
				},
			},
			judgeLlmQuality({
				id: "body_quality",
				label: "Design Artifact Describes Real UI Component",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [artifact] = await ctx.db
						.select({ previewJson: artifacts.previewJson })
						.from(artifacts)
						.where(eq(artifacts.producingTaskId, ctx.seedResult.taskId))
						.limit(1);
					return artifact?.previewJson ?? "";
				},
				criteria: `Score 1.0 if the preview describes a real UI component with named states (like idle, open, empty) and/or named interactions (like dismiss, mark-read). Score 0.5 if a component is named but states/interactions are generic or missing. Score 0.0 if the preview has no UI component content.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ca-runbook-ops-devops
//
// @lore AB0 CRITICAL-3: "runbook" is NOT in WRITABLE_ARTIFACT_KINDS. Ops operational
// documentation is created using "comm_draft" (the closest writable kind for
// structured procedural text). The preview carries the procedure steps.
// ---------------------------------------------------------------------------

const caRunbookOpsDevops: EvalScenario = {
	id: "ca-runbook-ops-devops",
	description:
		"Ops creates a comm_draft artifact documenting database failover procedure (runbook-style)",
	feature: "create_artifact",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "ops",
			agentSystemPrompt: `You are an ops agent responsible for production reliability.
When you complete an operational procedure, document it as an artifact for future reference.
Use create_artifact with kind="comm_draft" to record runbook-style operational documentation.
The preview should include the procedure steps, prerequisites, and rollback procedure.
You do NOT write application feature code. Your gate is operational readiness.`,
			taskTitle: "Create runbook artifact for database failover procedure",
			taskDescription: `You have successfully tested the database failover procedure. Document it as an artifact.

The failover procedure tested:
Prerequisites: read replica in sync (lag < 5s), standby instance healthy, maintenance window confirmed

Steps:
1. Enable maintenance mode (disable ingress load balancer)
2. Wait for in-flight transactions to drain (30s)
3. Promote read replica to primary
4. Update connection string in all services
5. Verify health checks pass on new primary
6. Re-enable ingress

Rollback: revert connection string, demote promoted instance, restore from backup if needed

Use create_artifact with:
- kind: "comm_draft"
- preview: { kind: "comm_draft", subject: "Database Failover Runbook", body: <procedure steps as text> }

Document the test outcome in session notes.`,
			betDescription: "Database reliability and failover readiness",
			betDoneCondition: "Failover procedure tested and documented.",
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
			judgeCreateArtifactCalled(),
			{
				id: "kind_correctness",
				label: "Artifact Kind Correct (comm_draft for runbook)",
				judge: async (ctx: JudgeContext) => {
					const [artifact] = await ctx.db
						.select({ kind: artifacts.kind })
						.from(artifacts)
						.where(eq(artifacts.producingTaskId, ctx.seedResult.taskId))
						.limit(1);
					const correct = artifact?.kind === "comm_draft";
					return {
						score: correct ? 1.0 : artifact ? 0.5 : 0.0,
						note: correct ? undefined : artifact ? `Wrong kind: ${artifact.kind}` : "No artifact",
					};
				},
			},
			{
				id: "preview_valid",
				label: "Runbook Preview Has Subject and Body",
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
						const hasSubject = typeof preview.subject === "string";
						const hasBody = typeof preview.body === "string" && preview.body.length > 20;
						if (hasSubject && hasBody) {
							return { score: 1.0 };
						}
						return {
							score: 0.5,
							note: `Preview missing fields: subject=${hasSubject}, body=${hasBody}`,
						};
					} catch {
						return { score: 0.0, note: "Preview JSON parse error" };
					}
				},
			},
			judgeLlmQuality({
				id: "body_quality",
				label: "Runbook Contains Actionable Operational Steps",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [artifact] = await ctx.db
						.select({ previewJson: artifacts.previewJson })
						.from(artifacts)
						.where(eq(artifacts.producingTaskId, ctx.seedResult.taskId))
						.limit(1);
					return artifact?.previewJson ?? "";
				},
				criteria: `Score 1.0 if the artifact body contains numbered/ordered operational steps AND mentions either prerequisites, rollback procedure, or specific technical actions (promote, connection string, health check). Score 0.5 if steps are present but lack specifics. Score 0.0 if no actionable procedure content.`,
			}),
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
	caDesignArtifactDesignerFrontend,
	caRunbookOpsDevops,
];
