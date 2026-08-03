/**
 * X8: Query practice scenarios (interaction 2).
 *
 * Tests the query_practice tool: proactive search, facilitator curation, layer filtering.
 * read_only tool — judges rely on LLM-as-judge on session notes for observability.
 */

import { sessions } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeLlmQuality, judgeSessionCompleted } from "../judges.js";
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
// qp-proactive-search-builder-frontend
// ---------------------------------------------------------------------------

const qpProactiveSearchBuilderFrontend: EvalScenario = {
	id: "qp-proactive-search-builder-frontend",
	description:
		"Builder proactively searches practice knowledge before implementing accessible components",
	feature: "query_practice",
	tags: ["quick"],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent implementing accessible UI components.
Before implementing, always search for existing practice knowledge using query_practice.
Reference the knowledge you find in your session notes when explaining your implementation approach.`,
			taskTitle: "Implement accessible modal component following team patterns",
			taskDescription: `Implement an accessible modal component for the frontend library.

Before writing any code:
1. Use query_practice to search for accessibility patterns and conventions
2. Review what the team has already documented about accessibility

Then document your implementation approach in session notes, referencing the practice knowledge you found.
Mention specific patterns or guidelines from the knowledge base.`,
			betDescription: "Frontend accessibility component library",
			betDoneCondition: "Accessible modal component implemented following team conventions.",
		});

		// Seed accessibility knowledge
		await seedKnowledge(ctx.db, {
			scopeKind: "practice",
			title: "Accessibility Patterns for Modal Components",
			body: `# Modal Accessibility Patterns
- Focus management: trap focus within modal when open
- ARIA roles: use role="dialog" with aria-modal="true"
- Keyboard: Escape key closes modal
- Screen reader: aria-labelledby for title
- Return focus: restore focus on close`,
			layer: "L3",
			kind: "pattern",
			updatedBy: `user:${world.founderId}`,
		});

		await seedKnowledge(ctx.db, {
			scopeKind: "practice",
			title: "Frontend Component Conventions",
			body: `# Component Conventions
- Use TypeScript strict mode
- Export named types alongside components
- Include Storybook story for every component
- Unit test accessibility with vitest + testing-library`,
			layer: "L3",
			kind: "context",
			updatedBy: `user:${world.founderId}`,
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
			judgeLlmQuality({
				id: "knowledge_referenced",
				label: "Knowledge Referenced in Session Notes",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if the session notes explicitly reference accessibility knowledge (mentions focus management, ARIA roles, keyboard handling, or screen reader patterns). Score 0.5 if notes mention accessibility generally but not specific patterns from the knowledge base. Score 0.0 if notes lack any accessibility knowledge reference.`,
			}),
			judgeLlmQuality({
				id: "session_notes_quality",
				label: "Session Notes Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if notes describe a specific implementation approach with at least 2 concrete details. Score 0.5 if notes mention the task but lack specifics. Score 0.0 if notes are empty or purely generic.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// qp-facilitator-curation-pf-devops
// ---------------------------------------------------------------------------

const qpFacilitatorCurationPfDevops: EvalScenario = {
	id: "qp-facilitator-curation-pf-devops",
	description: "PF queries existing practice knowledge before creating new DevOps practices",
	feature: "query_practice",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "facilitator", // @lore AD8c: renamed from practice_facilitator
			agentSystemPrompt: `You are a practice facilitator for the DevOps community.
Before creating new practices, always query existing ones to avoid duplication.
Use query_practice systematically to survey what the community already knows.
Document your curation reasoning in session notes.`,
			taskTitle: "Survey existing CI/CD practices before creating new guidelines",
			taskDescription: `Survey the existing CI/CD practice knowledge before proposing any new guidelines.

Your systematic curation process:
1. Use query_practice to search for existing CI/CD and deployment practices
2. Identify what's already documented vs what's missing
3. Document your findings in session notes

Note in your session notes:
- What existing practices you found
- What gaps you identified
- What you would recommend creating (if anything)`,
			betDescription: "DevOps practice knowledge organization",
			betDoneCondition: "Existing practices surveyed and gaps identified.",
		});

		await seedKnowledge(ctx.db, {
			scopeKind: "practice",
			title: "CI/CD Pipeline Standards",
			body: `# CI/CD Standards
- All PRs require passing tests before merge
- Deployment to staging requires manual approval
- Production deployments automated after staging soak period`,
			layer: "L3",
			kind: "process",
			updatedBy: `user:${world.founderId}`,
		});

		await seedKnowledge(ctx.db, {
			scopeKind: "practice",
			title: "Infrastructure as Code Conventions",
			body: `# IaC Conventions
- All infrastructure defined in Terraform
- Module structure: /modules/<service>/<env>
- State stored in S3 with DynamoDB locking`,
			layer: "L3",
			kind: "pattern",
			updatedBy: `user:${world.founderId}`,
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
			judgeLlmQuality({
				id: "knowledge_referenced",
				label: "Existing Knowledge Referenced",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if notes mention specific existing practices (CI/CD standards, IaC conventions, or similar) found through query_practice. Score 0.5 if notes acknowledge searching but only describe the search process without citing specific findings. Score 0.0 if no reference to existing practices.`,
			}),
			judgeLlmQuality({
				id: "curation_quality",
				label: "Curation Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if notes include both what was found AND what is missing (gap analysis). Score 0.5 if notes describe found practices without identifying gaps. Score 0.0 if purely generic with no curation insight.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// qp-layer-filter-pm-finance
// ---------------------------------------------------------------------------

const qpLayerFilterPmFinance: EvalScenario = {
	id: "qp-layer-filter-pm-finance",
	description: "PM queries practice knowledge with layer filter for financial workflows",
	feature: "query_practice",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager in the finance domain.
When searching for knowledge, use the layer parameter to filter for practice-level knowledge (L3).
This helps you find community-wide patterns rather than product-specific documentation.`,
			taskTitle: "Find practice-level financial workflow guidelines",
			taskDescription: `Use query_practice to find practice-level knowledge about financial workflows.

Instructions:
1. Search for financial workflow knowledge
2. Focus on practice-level (L3) patterns — community-wide standards
3. Document what you found in session notes

Note: there are both L2 (product-specific) and L3 (community-wide) finance items.
You should find and reference the L3 practice knowledge.`,
			betDescription: "Financial compliance workflow documentation",
			betDoneCondition: "Practice-level financial knowledge identified.",
		});

		// Seed L2 product-specific item
		await seedKnowledge(ctx.db, {
			scopeKind: "product",
			scopeId: world.teamId,
			title: "Finance Team Q4 Deadlines",
			body: "Product-specific: Q4 close deadline is December 31. Submit reports by Dec 28.",
			layer: "L2",
			kind: "context",
			updatedBy: `user:${world.founderId}`,
		});

		// Seed L3 practice-level item
		await seedKnowledge(ctx.db, {
			scopeKind: "practice",
			title: "Financial Close Process Standards",
			body: `# Financial Close Standards
- Three-way matching: PO, receipt, invoice
- Reconciliation tolerance: < 0.1% of period total
- Documentation requirements: all adjustments require written approval`,
			layer: "L3",
			kind: "process",
			updatedBy: `user:${world.founderId}`,
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
			judgeLlmQuality({
				id: "knowledge_referenced",
				label: "Practice Knowledge Referenced",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if session notes reference practice-level financial knowledge (e.g., three-way matching, reconciliation standards, documentation requirements). Score 0.5 if notes reference financial workflow generally without citing specific practice knowledge. Score 0.0 if no finance knowledge reference.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const queryPracticeScenarios: EvalScenario[] = [
	qpProactiveSearchBuilderFrontend,
	qpFacilitatorCurationPfDevops,
	qpLayerFilterPmFinance,
];
