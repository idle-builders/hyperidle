/**
 * `edit_document({as:"artifact"})` — an eval, which means the TOOL is what is under test.
 *
 * These scenarios give the agent a goal and nothing else. They deliberately do
 * not say "call edit_document", do not name the parameters, and do not
 * describe the body format. Everything the agent knows about how to produce an
 * artifact, it learns from the tool's own `description` — which is exactly the
 * thing an eval is supposed to let us tune.
 *
 * That is the difference between this and the integration test beside it. The
 * test (`document-actions.integration.test.ts`) proves the tool
 * round-trips when called correctly. This asks whether an agent, handed a
 * normal piece of work, uses it correctly WITHOUT being told how. A prompt that
 * spells out the mechanics can only ever score the model's instruction
 * following; it can never surface a tool that is badly described.
 *
 * So a low score here is a finding about the tool, not the model. In
 * particular: the description tells an agent that an app is a document with
 * `format: "html"` holding one whole page. If `html_app` scores badly across
 * harnesses, that sentence is what needs to change.
 *
 * @lore artifacts-become-knowledge: there is no `kind` to judge and no preview
 * shape to validate — kind is derived from the body's blocks at render time.
 * What is judgeable is whether something was produced, whether it hangs off the
 * right thing, and whether the content is any good.
 */

import { documents } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeArtifactDocumentCreated, judgeLlmQuality, judgeSessionCompleted } from "../judges.js";
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

/** What the agent produced for the scenario's task, if anything. */
async function produced(ctx: JudgeContext): Promise<{ body: string; format: string } | undefined> {
	const [item] = await ctx.db
		.select({ body: documents.body, format: documents.format })
		.from(documents)
		.where(eq(documents.parentId, ctx.seedResult.taskId))
		.limit(1);
	return item;
}

async function producedBody(ctx: JudgeContext): Promise<string> {
	return (await produced(ctx))?.body ?? "";
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
	feature: "edit_document_artifact",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent implementing DevOps infrastructure changes.
When you finish a piece of work, leave the output where your team can find it.`,
			taskTitle: "Refactor Kubernetes deployment manifest",
			taskDescription: `Add resource limits and readiness/liveness probes to the Kubernetes deployment manifest.

The team needs the finished manifest itself, not a summary of it.`,
			betDescription: "Kubernetes deployment hardening",
			betDoneCondition: "Deployment manifest updated with resource limits and health checks.",
		});
	},
	trigger,
	rubric: {
		dimensions: [
			judgeSessionCompleted(),
			judgeArtifactDocumentCreated(),
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
	description: "Designer produces an interactive artifact as an html app",
	feature: "edit_document_artifact",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "designer",
			agentSystemPrompt: `You are a designer agent.
When you make something a person should look at rather than read, leave it where the team can see it.`,
			taskTitle: "Build the trial-conversion dashboard",
			taskDescription: `The team wants to see how trials are converting.

Build a small self-contained dashboard they can open and look at — it should render, not be
described. Use the sample figures already in the task thread.`,
			betDescription: "Trial conversion visibility",
			betDoneCondition: "Dashboard produced and viewable.",
		});
	},
	trigger,
	rubric: {
		dimensions: [
			judgeSessionCompleted(),
			judgeArtifactDocumentCreated(),
			{
				id: "html_app",
				label: "An html document holding one whole page (runs as an app)",
				judge: async (ctx: JudgeContext) => {
					const item = await produced(ctx);
					const body = item?.body.trim() ?? "";
					if (!item || body.length === 0) return { score: 0.0, note: "Nothing produced" };
					const page = /^(<!doctype html|<html)/i.test(body);
					if (item.format === "html" && page) return { score: 1.0 };
					if (item.format === "html")
						return { score: 0.5, note: "format html, but the text is not one whole page" };
					return {
						score: 0.0,
						note: "format markdown — the page shows as text, not as a running app",
					};
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
	description: "PM produces a decision artifact hung off the task, not filed as a team document",
	feature: "edit_document_artifact",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager in the healthcare domain.
Decisions you make need to be findable later by whoever has to live with them.`,
			taskTitle: "Document data retention policy decision for patient records",
			taskDescription: `Decide how long patient records are retained, and record the decision so the
team can act on it. This is a regulated domain — whoever reads it later needs to know what
constrained the choice.`,
			betDescription: "Healthcare compliance posture",
			betDoneCondition: "Retention policy decided and recorded.",
		});
	},
	trigger,
	rubric: {
		dimensions: [
			judgeSessionCompleted(),
			judgeArtifactDocumentCreated(),
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
