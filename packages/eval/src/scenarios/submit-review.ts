/**
 * X8: Submit review scenarios (interaction 10).
 *
 * Tests the submit_review tool: structured review with artifactRef, plain fallback,
 * quality-focused, and bet-thread targeting.
 */

import { messages, threads } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import {
	judgeCostTracked,
	judgeLlmQuality,
	judgeSessionCompleted,
	judgeSubmitReviewCalled,
} from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedArtifact, seedMinimalWorld, seedThread } from "../seeding.js";
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
// sr-with-artifact-builder-devops
// ---------------------------------------------------------------------------

const srWithArtifactBuilderDevops: EvalScenario = {
	id: "sr-with-artifact-builder-devops",
	description: "Builder submits structured review with artifactRef linking to seeded code_diff",
	feature: "submit_review",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSoulPrompt: `You are a builder agent implementing DevOps infrastructure.
When you complete work and have produced an artifact, submit a review using submit_review.
Include an artifactRef pointing to the artifact you produced.
Your review reasoning should explain what was implemented and what to verify.`,
			taskTitle: "Refactor monitoring configuration",
			taskDescription: `Review your implementation of the monitoring configuration refactor.

You have already produced a code_diff artifact for this task.
The artifact ID is available in your task context.

Submit a review using submit_review with:
- title: "Monitoring configuration refactor ready for review"
- reasoning: at least 2 points about what was changed and what to verify
- artifactRef: { id: "<the artifact ID>", kind: "code_diff" }

Your reasoning should mention: what was changed and what the reviewer should check.`,
			betDescription: "Infrastructure monitoring improvements",
			betDoneCondition: "Monitoring configuration refactored and reviewed.",
		});

		// Pre-seed the artifact that the agent will reference
		await seedArtifact(ctx.db, {
			producingTaskId: world.taskId,
			kind: "code_diff",
			previewJson: JSON.stringify({
				kind: "code_diff",
				file: "config/prometheus.yml",
				hunks: ["- scrape_interval: 60s\n+ scrape_interval: 15s\n+ evaluation_interval: 15s"],
			}),
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
			judgeSubmitReviewCalled(),
			judgeCostTracked(),
			{
				id: "message_type_correct",
				label: "Review Message Type Correct (review or plain)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [msg] = await ctx.db
						.select({ type: messages.type, payload: messages.payload })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId))
						.limit(1);
					if (!msg) {
						return { score: 0.0, note: "No message found" };
					}
					const isReviewType = msg.type === "review";
					return {
						score: isReviewType ? 1.0 : 0.5,
						note: isReviewType
							? undefined
							: `Message type is "${msg.type}" (expected "review" when artifactRef is provided)`,
					};
				},
			},
			{
				id: "artifact_ref_present",
				label: "ArtifactRef in Review Message",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [msg] = await ctx.db
						.select({ payload: messages.payload })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId))
						.limit(1);
					if (!msg) {
						return { score: 0.0, note: "No message found" };
					}
					try {
						const payload = JSON.parse(msg.payload) as Record<string, unknown>;
						const hasArtifactRef = "artifactRef" in payload;
						return {
							score: hasArtifactRef ? 1.0 : 0.0,
							note: hasArtifactRef ? undefined : "No artifactRef in review payload",
						};
					} catch {
						return { score: 0.0, note: "Could not parse message payload" };
					}
				},
			},
			judgeLlmQuality({
				id: "reasoning_quality",
				label: "Review Reasoning Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [msg] = await ctx.db
						.select({ payload: messages.payload })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId))
						.limit(1);
					return msg?.payload ?? "";
				},
				criteria: `Score 1.0 if the review reasoning contains at least 2 specific points about what was changed or what to verify (mentions configuration, intervals, Prometheus, or specific technical details). Score 0.5 if reasoning is present but generic. Score 0.0 if no reasoning or single vague point.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// sr-plain-fallback-builder-marketing
// ---------------------------------------------------------------------------

const srPlainFallbackBuilderMarketing: EvalScenario = {
	id: "sr-plain-fallback-builder-marketing",
	description: "Builder submits review without artifactRef, falls back to plain message type",
	feature: "submit_review",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSoulPrompt: `You are a builder agent working on marketing automation.
When you complete analysis work (not implementation), submit a review without an artifact.
Use submit_review WITHOUT an artifactRef when your output is a written analysis rather than a code artifact.
Include clear reasoning about what you analyzed and your recommendations.`,
			taskTitle: "Analyze email open rate decline and recommend fixes",
			taskDescription: `Analyze the email campaign open rate decline and submit your findings for review.

Your analysis reveals:
1. Subject lines with questions perform 23% better than statements
2. Send time shifted to Tuesday 10am improves open rates by 15%
3. Personalization tokens in subject increase CTR by 8%

Submit a review using submit_review WITHOUT an artifactRef:
- title: "Email campaign analysis — recommendations ready for review"
- reasoning: include your 3 findings as separate reasoning points
- DO NOT include an artifactRef (this is an analysis, not a code artifact)

The review will be posted as a plain message (the fallback path).`,
			betDescription: "Email campaign performance optimization",
			betDoneCondition: "Analysis complete and recommendations reviewed.",
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
			judgeSubmitReviewCalled(),
			{
				id: "review_submitted",
				label: "Review Submitted as Plain Message",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [msg] = await ctx.db
						.select({ type: messages.type, payload: messages.payload })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId))
						.limit(1);
					if (!msg) {
						return { score: 0.0, note: "No message found" };
					}
					const isPlain = msg.type === "plain";
					const hasReviewPrefix = msg.payload.includes("Review requested:");
					return {
						score: isPlain && hasReviewPrefix ? 1.0 : isPlain || hasReviewPrefix ? 0.5 : 0.25,
						note:
							isPlain && hasReviewPrefix
								? undefined
								: `type=${msg.type}, hasReviewPrefix=${hasReviewPrefix}`,
					};
				},
			},
			judgeLlmQuality({
				id: "reasoning_quality",
				label: "Review Reasoning Quality (Marketing Analysis)",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [msg] = await ctx.db
						.select({ payload: messages.payload })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId))
						.limit(1);
					return msg?.payload ?? "";
				},
				criteria: `Score 1.0 if the review mentions at least 2 specific data-backed insights about email performance (subject lines, send times, personalization, or specific percentage improvements). Score 0.5 if reasoning mentions email analysis generally without specific findings. Score 0.0 if reasoning is absent or generic.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// sr-review-quality-pm-healthcare
// ---------------------------------------------------------------------------

const srReviewQualityPmHealthcare: EvalScenario = {
	id: "sr-review-quality-pm-healthcare",
	description: "PM submits multi-point healthcare compliance review with thorough reasoning",
	feature: "submit_review",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSoulPrompt: `You are a product manager reviewing healthcare compliance work.
Healthcare reviews require thorough, multi-point reasoning covering: regulatory compliance, patient safety, data privacy.
Use submit_review with at least 4 reasoning points for any healthcare compliance review.
Each reasoning point should be specific and reference a regulatory requirement or patient safety consideration.`,
			taskTitle: "Review HIPAA-compliant patient portal implementation",
			taskDescription: `Review the patient portal implementation for HIPAA compliance.

Your review must cover:
1. Authentication requirements (multi-factor, session timeout)
2. Access control (role-based, minimum necessary access)
3. Audit logging (who accessed what, when)
4. Data encryption (at rest and in transit)

Use submit_review with:
- title: "Patient portal HIPAA compliance review"
- reasoning: 4+ specific compliance points, each referencing a HIPAA requirement
- No artifactRef needed (this is a process review)`,
			betDescription: "HIPAA-compliant patient portal",
			betDoneCondition: "Patient portal reviewed and certified for HIPAA compliance.",
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
			judgeSubmitReviewCalled(),
			{
				id: "reasoning_count",
				label: "Multiple Reasoning Points (3+)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [msg] = await ctx.db
						.select({ payload: messages.payload })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId))
						.limit(1);
					if (!msg) {
						return { score: 0.0, note: "No message found" };
					}
					try {
						const payload = JSON.parse(msg.payload) as Record<string, unknown>;
						const reasoning = payload.reasoning as string[] | undefined;
						if (!reasoning) {
							// Plain fallback — check the text
							const text = (payload.text as string | undefined) ?? msg.payload;
							const lines = text.split("\n").filter((l) => l.trim().length > 5);
							const count = lines.length;
							return {
								score: count >= 3 ? 1.0 : count >= 2 ? 0.5 : 0.0,
								note: `${count} reasoning lines in plain message`,
							};
						}
						const count = reasoning.length;
						return {
							score: count >= 4 ? 1.0 : count >= 3 ? 0.75 : count >= 2 ? 0.5 : 0.0,
							note: count < 4 ? `${count} reasoning points (expected 4+)` : undefined,
						};
					} catch {
						return { score: 0.0, note: "Could not parse payload" };
					}
				},
			},
			judgeLlmQuality({
				id: "reasoning_quality",
				label: "Healthcare Compliance Reasoning Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [msg] = await ctx.db
						.select({ payload: messages.payload })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId))
						.limit(1);
					return msg?.payload ?? "";
				},
				criteria: `Score 1.0 if the review reasoning covers at least 3 of: authentication (MFA/timeout), access control (RBAC/minimum necessary), audit logging, or data encryption — and each point references HIPAA requirements or patient safety. Score 0.5 if the review mentions healthcare compliance but lacks specific HIPAA references. Score 0.0 if reasoning is generic or non-healthcare.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// sr-bet-thread-targeting-builder-frontend
// ---------------------------------------------------------------------------

const srBetThreadTargetingBuilderFrontend: EvalScenario = {
	id: "sr-bet-thread-targeting-builder-frontend",
	description: "Builder review lands in bet's host thread (hostKind=bet, hostId=betId)",
	feature: "submit_review",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSoulPrompt: `You are a builder agent working on frontend component development.
When you complete a component and want it reviewed, use submit_review.
The review will be posted in the bet's discussion thread automatically.
Include clear reasoning about what was implemented and what aspects to review.`,
			taskTitle: "Implement responsive navigation component",
			taskDescription: `Submit a review for the responsive navigation component you've implemented.

Use submit_review with:
- title: "Responsive navigation component ready for review"
- reasoning: describe what was implemented and what the reviewer should check
  - Mobile breakpoints and hamburger menu behavior
  - Keyboard navigation and focus management
  - ARIA attributes and screen reader support

No artifactRef needed for this review.`,
			betDescription: "Frontend component library development",
			betDoneCondition: "Navigation component implemented and reviewed.",
		});

		// Pre-seed the bet's host thread (as if the bet already has a thread)
		await seedThread(ctx.db, {
			hostKind: "bet",
			hostId: world.betId,
			initiatorId: world.founderId,
			participants: [world.founderId],
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
			judgeSubmitReviewCalled(),
			{
				id: "thread_host_kind_correct",
				label: "Review Posted to Bet Thread (hostKind=bet)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// Find the message sent by the agent
					const [msg] = await ctx.db
						.select({ threadId: messages.threadId })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId))
						.limit(1);
					if (!msg) {
						return { score: 0.0, note: "No review message found" };
					}

					// Check the thread it was posted to
					const [thread] = await ctx.db
						.select({ hostKind: threads.hostKind, hostId: threads.hostId })
						.from(threads)
						.where(eq(threads.id, msg.threadId))
						.limit(1);

					if (!thread) {
						return { score: 0.0, note: "Thread not found" };
					}

					const correctKind = thread.hostKind === "bet";
					const correctHost = thread.hostId === ctx.seedResult.betId;

					if (correctKind && correctHost) {
						return { score: 1.0 };
					}
					if (correctKind) {
						return {
							score: 0.75,
							note: `hostKind=bet but hostId=${thread.hostId} (expected ${ctx.seedResult.betId})`,
						};
					}
					return {
						score: 0.0,
						note: `Message in thread with hostKind=${thread.hostKind} (expected bet)`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const submitReviewScenarios: EvalScenario[] = [
	srWithArtifactBuilderDevops,
	srPlainFallbackBuilderMarketing,
	srReviewQualityPmHealthcare,
	srBetThreadTargetingBuilderFrontend,
];
