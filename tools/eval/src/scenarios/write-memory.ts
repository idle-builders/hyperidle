/**
 * X8: Write memory scenarios (interaction 1).
 *
 * Tests the write_memory tool: creating a knowledge item with a well-formed
 * body, attributed to the calling agent.
 *
 * @lore nested-knowledge-items: `layer`/`kind` are DELETED from
 * `write_memory` with the flat vocabularies they carried — a knowledge
 * item's place in the tree says what it is about now, not a layer/kind pair.
 * The layer-keyed authorisation gate (builder restricted to L0-L2, growth
 * agent blocked from L3, a facilitator-only L4 write) is DELETED WITH
 * NOTHING REPLACING IT — founder ruling 2026-09-02: no authorisation checks.
 * The scenarios that existed solely to exercise kind-selection and
 * layer-enforcement are gone with the capability; what survives tests that
 * write_memory still produces a real, well-formed knowledge item.
 */

import { documents } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeLlmQuality, judgeSessionCompleted, judgeWriteMemoryCalled } from "../judges.js";
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
// wm-incident-writeup-builder-devops
// ---------------------------------------------------------------------------

const wmIncidentWriteupBuilderDevops: EvalScenario = {
	id: "wm-incident-writeup-builder-devops",
	description: "Builder captures a DevOps incident post-mortem via write_memory",
	feature: "write_memory",
	tags: ["quick"],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent in a DevOps team.
Always use write_memory to capture important technical knowledge.`,
			taskTitle: "Document the Kubernetes pod crash incident from yesterday",
			taskDescription: `A Kubernetes pod crashed due to an OOM (out of memory) error.

Document this incident using write_memory. The incident involved:
- Pod: api-server-v2
- Error: OOMKilled (exceeded 512Mi limit)
- Root cause: memory leak in session cache
- Fix: increased limit to 1Gi, added cache expiry

Use write_memory to capture this as a knowledge item covering what happened,
the root cause, and the fix.`,
			betDescription: "DevOps incident documentation",
			betDoneCondition: "Incident documented as knowledge item.",
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
			judgeWriteMemoryCalled(),
			judgeLlmQuality({
				id: "body_quality",
				label: "Knowledge Item Body Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
					const [item] = await ctx.db
						.select({ body: documents.body, title: documents.title })
						.from(documents)
						.where(eq(documents.updatedBy, agentUpdatedBy))
						.limit(1);
					return item ? `Title: ${item.title}\n\nBody: ${item.body}` : "";
				},
				criteria: `Score 1.0 if the knowledge item body includes all 3 of: (1) what happened (the incident), (2) the root cause, (3) the fix or resolution. Score 0.5 if 2 of 3 are present. Score 0.0 if 1 or fewer.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// wm-reflection-brandvoice-marketing
// ---------------------------------------------------------------------------

const wmReflectionBrandvoiceMarketing: EvalScenario = {
	id: "wm-reflection-brandvoice-marketing",
	description: "Brand voice agent captures brand consistency reflection",
	feature: "write_memory",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "brand_voice",
			agentSystemPrompt: `You are the brand voice agent. Your identity IS the brand.
You observe how the brand is expressed and capture brand consistency learnings using write_memory.
Your knowledge items should reflect on: how well we stayed on brand, what worked, what drifted.`,
			taskTitle: "Reflect on this quarter's campaign brand consistency",
			taskDescription: `Review how the recent marketing campaigns expressed the brand and capture your reflection.

Use write_memory to document your brand consistency reflection, covering at
least: what was on-brand, what drifted, and one recommendation.

This reflection will help the team maintain brand consistency going forward.`,
			betDescription: "Brand consistency reflection and documentation",
			betDoneCondition: "Brand reflection documented as knowledge item.",
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
			judgeWriteMemoryCalled(),
			judgeLlmQuality({
				id: "brand_consistency",
				label: "Brand Consistency Reflection Quality",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
					const [item] = await ctx.db
						.select({ body: documents.body, title: documents.title })
						.from(documents)
						.where(eq(documents.updatedBy, agentUpdatedBy))
						.limit(1);
					return item ? `Title: ${item.title}\nBody: ${item.body}` : "";
				},
				criteria: `Score 1.0 if the knowledge item addresses all 3 of: (1) what was on-brand, (2) what drifted from brand, (3) a recommendation for improvement. Score 0.5 if 2 of 3 present. Score 0.0 if fewer than 2 are present.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const writeMemoryScenarios: EvalScenario[] = [
	wmIncidentWriteupBuilderDevops,
	wmReflectionBrandvoiceMarketing,
];
