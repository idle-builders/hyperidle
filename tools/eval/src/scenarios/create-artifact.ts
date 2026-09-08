/**
 * `create_artifact` scenarios — a real agent producing real content.
 *
 * These were deleted with the artifacts table and are restored here in the new
 * shape. The tool survives, by founder call: "artifact" is still the word for
 * something an agent produced. What changed is what sits behind it — a
 * knowledge item parented to the task the agent was working on, with a markdown
 * body, instead of a row in a second table with a JSON preview blob.
 *
 * So the rubric changed with it. There is no `kind` to get right and no preview
 * shape to validate: kind is derived from the body's blocks at render time.
 * What is worth judging now is whether the agent produced anything at all,
 * whether it hung it off the right thing, and whether the CONTENT is any good —
 * which is what an eval is for and what a schema check never was.
 */

import { knowledgeItems } from "@hyperidle/db";
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

/** The body of whatever the agent produced for the scenario's task, or "". */
async function producedBody(ctx: JudgeContext): Promise<string> {
	const [item] = await ctx.db
		.select({ body: knowledgeItems.body })
		.from(knowledgeItems)
		.where(eq(knowledgeItems.parentId, ctx.seedResult.taskId))
		.limit(1);
	return item?.body ?? "";
}

function trigger(ctx: TriggerContext): Promise<TriggerResult> {
	return runEvalSession(
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
}

// ---------------------------------------------------------------------------
// ca-code-builder-devops — code content in a fenced block
// ---------------------------------------------------------------------------

const caCodeBuilderDevops: EvalScenario = {
	id: "ca-code-builder-devops",
	description: "Builder produces a code artifact as a fenced block in a markdown body",
	feature: "create_artifact",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent implementing DevOps infrastructure changes.
When you complete implementation work, record the output with create_artifact.
It takes a title and a markdown body — there is no kind and no preview. Put code in a fenced block.`,
			taskTitle: "Refactor Kubernetes deployment manifest",
			taskDescription: `Refactor the Kubernetes deployment manifest to add resource limits and health checks.

When you are done, call create_artifact with:
- title: a short name for what you produced
- body: markdown containing the manifest in a fenced yaml block

Document your changes in session notes.`,
			betDescription: "Kubernetes deployment hardening",
			betDoneCondition: "Deployment manifest updated with resource limits and health checks.",
		});
	},
	trigger,
	rubric: {
		dimensions: [
			judgeSessionCompleted(),
			judgeCreateArtifactCalled(),
			judgeLlmQuality({
				id: "code_content_quality",
				label: "Produced body carries real manifest content",
				extractContent: producedBody,
				criteria: `Score 1.0 if the body contains a fenced code block holding a Kubernetes manifest with BOTH resource limits and a health check (readiness or liveness probe). Score 0.5 if a manifest is present but missing one of them, or is not in a fenced block. Score 0.0 if there is no manifest content.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ca-interactive-designer-frontend — the interactive-document case
// ---------------------------------------------------------------------------

const caInteractiveDesignerFrontend: EvalScenario = {
	id: "ca-interactive-designer-frontend",
	description: "Designer produces an interactive artifact as a sole fenced html block",
	feature: "create_artifact",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "designer",
			agentSystemPrompt: `You are a designer agent.
When you produce something a person should LOOK at rather than read, record it with create_artifact.
Interactive HTML goes inside a single fenced \`\`\`html block and nothing else — that is what makes it
render as a live document rather than as source. Never put raw HTML directly in the markdown body.`,
			taskTitle: "Build the trial-conversion dashboard",
			taskDescription: `Produce a small self-contained HTML dashboard showing trial conversion.

Call create_artifact with a body that is ONE fenced html block containing the whole document —
no prose before or after it. Anything else and it renders as source instead of running.`,
			betDescription: "Trial conversion visibility",
			betDoneCondition: "Dashboard produced and viewable.",
		});
	},
	trigger,
	rubric: {
		dimensions: [
			judgeSessionCompleted(),
			judgeCreateArtifactCalled(),
			{
				id: "sole_html_block",
				label: "Body is a single fenced html block (renders in the sandbox frame)",
				judge: async (ctx: JudgeContext) => {
					const body = (await producedBody(ctx)).trim();
					if (body.length === 0) return { score: 0.0, note: "Nothing produced" };

					const fences = body.match(/```/g)?.length ?? 0;
					const opensHtml = body.startsWith("```html");
					const endsFence = body.endsWith("```");

					// Exactly one fenced block, tagged html, with nothing outside it —
					// the condition `KnowledgeBody` checks before using the frame.
					if (opensHtml && endsFence && fences === 2) return { score: 1.0 };
					if (body.includes("```html")) {
						return {
							score: 0.5,
							note: `Has an html fence but not as the sole block (fences=${fences}, opens=${opensHtml}, ends=${endsFence}) — renders as a code listing, not in the frame`,
						};
					}
					return { score: 0.0, note: "No fenced html block — raw HTML mis-derives into many blocks" };
				},
			},
			judgeLlmQuality({
				id: "dashboard_quality",
				label: "Dashboard content is real",
				extractContent: producedBody,
				criteria: `Score 1.0 if the HTML is a self-contained document with visible structure (headings or labels) AND presents conversion data — numbers, a chart, or a table. Score 0.5 if it renders something but is a bare stub with no data. Score 0.0 if there is no HTML document.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ca-decision-pm-healthcare — prose content, and the parent that matters
// ---------------------------------------------------------------------------

const caDecisionPmHealthcare: EvalScenario = {
	id: "ca-decision-pm-healthcare",
	description: "PM produces a decision artifact hung off the task, not filed as team knowledge",
	feature: "create_artifact",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager in the healthcare domain.
Record significant product decisions with create_artifact, which hangs the record off the task you
are working on. Healthcare decisions need rationale citing regulatory constraints (HIPAA, HL7 FHIR).`,
			taskTitle: "Document data retention policy decision for patient records",
			taskDescription: `Make and document a formal decision about patient data retention policy.

Call create_artifact with a title and a markdown body stating the decision and the rationale behind it.`,
			betDescription: "Healthcare compliance posture",
			betDoneCondition: "Retention policy decided and recorded.",
		});
	},
	trigger,
	rubric: {
		dimensions: [
			judgeSessionCompleted(),
			judgeCreateArtifactCalled(),
			judgeLlmQuality({
				id: "decision_rationale_quality",
				label: "Decision carries regulatory rationale",
				extractContent: producedBody,
				criteria: `Score 1.0 if the body states a concrete retention decision (a duration or rule) AND cites at least one specific regulatory constraint by name (HIPAA, HL7 FHIR, or an equivalent). Score 0.5 if a decision is stated without regulatory grounding. Score 0.0 if there is no decision.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const createArtifactScenarios: EvalScenario[] = [
	caCodeBuilderDevops,
	caInteractiveDesignerFrontend,
	caDecisionPmHealthcare,
];
