/**
 * X8: Composed prompt scenarios (interaction 18).
 *
 * Tests context assembly: system prompt identity delivery, task comprehension, template vars.
 */

import { sessions } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeLlmQuality, judgeSessionCompleted, judgeSessionNotesWritten } from "../judges.js";
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
// cp-identity-brandvoice-marketing
// ---------------------------------------------------------------------------

const cpIdentityBrandvoiceMarketing: EvalScenario = {
	id: "cp-identity-brandvoice-marketing",
	description: "Brand voice agent adheres to detailed system prompt tone guidelines in output",
	feature: "composed_prompt",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "brand_voice",
			agentSystemPrompt: `You are Aria, the brand voice guardian for Luminary Creative Agency.

BRAND PERSONALITY:
- Warm but professional: never stiff or corporate
- Optimistic and forward-looking: focus on possibility, not limitation
- Clear and direct: short sentences, active voice, no jargon
- Human-centered: always speak to real people's experiences

TONE RULES (always follow):
- Never use: "leverage", "synergize", "paradigm", "circle back", "bandwidth"
- Always use: concrete examples, specific numbers when possible
- Sign off creative work with "Made with intention." (exactly this phrase)

When documenting your work in session notes, demonstrate the brand voice in your writing.`,
			taskTitle: "Review and improve homepage copy",
			taskDescription: `Review the current homepage copy and write session notes about your recommended changes.

Current homepage headline: "Leverage our synergized creative solutions to paradigm-shift your brand."

This violates our brand voice rules. Write session notes that:
1. Identify the specific violations
2. Propose replacement copy in our brand voice
3. Explain the reasoning in the brand voice style

Your session notes should themselves demonstrate the brand voice — warm, clear, no jargon.
End your session notes with "Made with intention." (our standard sign-off).`,
			betDescription: "Brand voice consistency audit",
			betDoneCondition: "Homepage copy revised to match brand guidelines.",
		});
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
			judgeSessionNotesWritten(),
			judgeLlmQuality({
				id: "identity_adherence",
				label: "Brand Voice Adherence",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if the session notes: (1) avoid banned words (leverage, synergize, paradigm, circle back, bandwidth), (2) propose clear concrete replacement copy, AND (3) end with "Made with intention." Score 0.5 if 2 of 3 are present. Score 0.0 if the notes use forbidden jargon or ignore the brand voice guidelines.`,
			}),
			judgeLlmQuality({
				id: "session_notes_on_brand",
				label: "Session Notes Written in Brand Voice",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if the session notes themselves read in the warm, direct, human-centered brand voice (short sentences, active voice, optimistic tone, concrete). Score 0.5 if the notes address the task but feel formal or corporate. Score 0.0 if the writing style is inconsistent with the brand guidelines.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// cp-task-comprehension-pm-legal
// ---------------------------------------------------------------------------

const cpTaskComprehensionPmLegal: EvalScenario = {
	id: "cp-task-comprehension-pm-legal",
	description:
		"PM correctly understands complex legal compliance task with specific done conditions",
	feature: "composed_prompt",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager responsible for legal and compliance initiatives.
You work at the intersection of product development and legal constraints.
Your job is to ensure the team understands compliance requirements and translates them into actionable work.
Always read task done conditions carefully — they define success precisely.`,
			taskTitle: "Coordinate GDPR Article 30 records of processing activities",
			taskDescription: `Complete the GDPR Article 30 compliance task for our EU data processing activities.

DONE CONDITIONS (all must be met):
1. Records of Processing Activities (RoPA) template populated with all 8 required fields
2. Legal basis documented for each processing activity (consent / legitimate interest / contractual necessity)
3. Data retention schedules mapped to each activity
4. Third-party processors identified with DPA status noted
5. Document reviewed by DPO and signed (simulated: document this in session notes)

Write session notes that confirm each done condition is addressed.
Explicitly note which done conditions you have addressed and how.`,
			betDescription: "GDPR Article 30 compliance documentation",
			betDoneCondition:
				"RoPA complete with all 8 fields, legal basis documented, retention schedules mapped, processors identified, DPO sign-off documented.",
		});
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
			judgeSessionNotesWritten(),
			judgeLlmQuality({
				id: "task_understood",
				label: "Done Conditions Understood",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if the session notes explicitly address at least 3 of the 5 done conditions (RoPA fields, legal basis, retention schedules, third-party processors, DPO sign-off). Score 0.5 if notes mention GDPR compliance generally but address fewer than 3 specific done conditions. Score 0.0 if notes are generic with no GDPR-specific content.`,
			}),
			judgeLlmQuality({
				id: "actions_aligned",
				label: "Actions Aligned With Task (Not Generic)",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if session notes describe specific GDPR Article 30 activities (processing activities, legal bases like consent/legitimate interest, data retention periods, or processor DPA status). Score 0.5 if notes describe legal compliance work generally without GDPR-specific details. Score 0.0 if notes describe unrelated work or are empty.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// cp-template-vars-pf-devops
// ---------------------------------------------------------------------------

const cpTemplateVarsPfDevops: EvalScenario = {
	id: "cp-template-vars-pf-devops",
	description: "PF system prompt template variables substituted and community name referenced",
	feature: "composed_prompt",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "facilitator", // @lore AD8c: renamed from practice_facilitator
			agentSystemPrompt: `You are the practice facilitator for the Platform Engineering community.

Your community: Platform Engineering
Your community's focus: Developer productivity, internal tooling, and platform reliability.
Your community values: reliability over velocity, documentation-first, reduce toil.

When working on knowledge tasks, always reference your community by name in your session notes.
Start your notes with "As the facilitator for Platform Engineering, ..." to confirm your identity.`,
			taskTitle: "Curate platform engineering knowledge for Q4",
			taskDescription: `Curate the platform engineering knowledge base for the Q4 planning cycle.

Your task:
1. Write session notes that explicitly identify your community (Platform Engineering)
2. Note the community's values and how they should shape knowledge curation
3. Identify one knowledge priority for Q4 (based on community values)

Your session notes MUST mention "Platform Engineering" by name.
This confirms that template variable substitution correctly set your community identity.`,
			betDescription: "Platform Engineering knowledge curation",
			betDoneCondition: "Q4 knowledge priorities identified and documented.",
		});
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
			judgeSessionNotesWritten(),
			{
				id: "community_correct",
				label: "Session Notes Reference Correct Community",
				judge: async (ctx: JudgeContext) => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					const notes = (session?.notes ?? "").toLowerCase();
					const hasCommunityName = notes.includes("platform engineering");
					return {
						score: hasCommunityName ? 1.0 : 0.0,
						note: hasCommunityName
							? undefined
							: "Session notes do not mention 'Platform Engineering' (template substitution may have failed)",
					};
				},
			},
			judgeLlmQuality({
				id: "identity_adherence",
				label: "PF Identity Demonstrated in Notes",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if session notes clearly identify the agent as the Platform Engineering facilitator AND describe knowledge curation activities that align with platform engineering values (reliability, documentation, reducing toil). Score 0.5 if the community is mentioned but the activities described don't reflect platform engineering priorities. Score 0.0 if the community name is absent or the role is not demonstrated.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const composedPromptScenarios: EvalScenario[] = [
	cpIdentityBrandvoiceMarketing,
	cpTaskComprehensionPmLegal,
	cpTemplateVarsPfDevops,
];
