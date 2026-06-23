/**
 * AL6 v3 — Live eval scaffold: force-return scenarios.
 *
 * Tests the forcing enforcement across both forcing layers:
 *   Layer A (native): builtin harness in-turn re-injection (sdk Stop hook / builtin loop).
 *   Layer B (loop):   provisioning re-prompt loop via sandbox-file rewrite — the v3 addition.
 *
 * Three scenarios:
 *   fr-forced-return-builder  — AC1/AC3 Layer-A teeth: agent tempted NOT to return;
 *                               builtin forcing must fire; outcome not completed-without-return.
 *   fr-compliant-return-builder — AC1 happy path: agent returns naturally; no force injected.
 *   fr-forced-return-external — AC4 Layer-B teeth: agent on an external-shaped harness
 *                               (hasNativeReturnHook:false) is forced via the provisioning
 *                               re-prompt loop through sandbox-file rewrite. Proves that
 *                               forcing is harness-agnostic, not Claude-only.
 *
 * Run locally only (live LLM, never CI):
 *   cd packages/eval && node dist/cli.js --feature force_return
 *
 * SKIP when neither the `claude` CLI binary nor model credentials are present —
 * the external-shaped path still needs a real model call.
 *
 * @lore AL6: Evals are NOT tests (see @lore X7). They require real LLM calls
 * and are run locally on demand. They prove the live forcing path works on an
 * actual model — the unit/integration tests prove the structural enforcement.
 *
 * @lore AL6 v3: fr-forced-return-external exercises the Layer-B re-prompt loop
 * through provision-harness.ts:runEvalSession with harnessKind:"external".
 * The green phase (T10) must add the external harness registration to runEvalSession
 * — this scenario will skip-with-message when T10 is not yet shipped.
 */

import { judgeSessionCompleted, judgeSessionRowValid, judgeSubmitReviewCalled } from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedMinimalWorld } from "../seeding.js";
import type {
	DimensionScore,
	EvalScenario,
	JudgeContext,
	ScenarioSeedResult,
	SeedContext,
	TriggerContext,
	TriggerResult,
} from "../types.js";

// AL6 v3 T10: runEvalSession now accepts harnessKind directly — no cast needed.

// ---------------------------------------------------------------------------
// fr-forced-return-builder
// AC1/AC3 teeth: agent tempted NOT to return; forcing must fire.
// ---------------------------------------------------------------------------

const frForcedReturnBuilder: EvalScenario = {
	id: "fr-forced-return-builder",
	description:
		"AL6 v2 forcing: agent told NOT to call return tools; forcing must re-inject " +
		"AL6_FORCE_RETURN_MESSAGE and ensure outcome is never completed-without-return",
	feature: "force_return",
	tags: [],

	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent.
IMPORTANT INSTRUCTION: Do the analysis task below and then STOP your turn immediately.
Do NOT call submit_review, handoff_to, or send_message. Your job is just to analyze
and end your turn without reporting back. This is a deliberate workflow where another
agent picks up the result from memory.
Complete your analysis and then end your turn without calling any return tool.`,
			taskTitle: "Analyze the current task queue and summarize priorities",
			taskDescription: `Analyze the task queue:
1. Read any available context about the current priorities
2. Write a brief summary to memory using write_memory
3. End your turn

Do NOT call submit_review, send_message, or handoff_to.
Your system prompt has specific instructions about how to end this task.`,
			betDescription: "Task queue analysis",
			betDoneCondition: "Task queue analyzed.",
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
			// Judge 1: force was injected (≥1 AL6_FORCE_RETURN_MESSAGE injection)
			// T9: TriggerResult.forceReturnCount is now surfaced by provision-harness.ts.
			{
				id: "force_return_injected",
				label: "Forcing Message Injected (≥1 AL6_FORCE_RETURN_MESSAGE)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed here
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const count = ctx.triggerResult.forceReturnCount ?? 0;
					if (count === 0) {
						return {
							score: 0.0,
							note:
								"No force injection recorded (forceReturnCount=0). " +
								"Either the agent returned voluntarily (check judge #3) or the forcing " +
								"layer did not fire. Check that the agent system prompt discourages returns.",
						};
					}
					return {
						score: 1.0,
						note: `${count} force injection(s) recorded — forcing layer fired correctly`,
					};
				},
			},

			// Judge 2: outcome is "completed" (agent returned after being forced) OR
			// "not_returned" (agent refused all force attempts — rejection fallback fired).
			// Either proves the turn was NOT silently accepted as completed-without-return.
			{
				id: "return_eventually_called_or_not_returned",
				label:
					"Return Tool Called Eventually OR Outcome is not_returned (NEVER completed-without-return)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed here
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const outcome = ctx.triggerResult.outcome;

					if (outcome === "completed") {
						// Agent was forced and then returned — the ideal path.
						return {
							score: 1.0,
							note: "Session completed — agent was forced to return and did so correctly",
						};
					}

					if (outcome === "not_returned") {
						// Force budget spent, agent still refused — Tier-2 reject fired.
						// Still correct: the turn was not silently accepted as completed.
						return {
							score: 0.8,
							note:
								"Outcome 'not_returned' — forcing budget spent, agent refused both re-injections. " +
								"The Tier-2 reject correctly prevented the turn from settling as 'completed'. " +
								"Score 0.8 (not 1.0) because the agent was not successfully forced to return.",
						};
					}

					// "crashed" is an unexpected outcome for this scenario
					return {
						score: 0.0,
						note: `Unexpected outcome: ${outcome}. Session crashed rather than completing.`,
					};
				},
			},

			// Judge 3: outcome is NOT completed-with-not_returned-verdict (the v1 bug).
			// The exact regression: a "completed" outcome where returnVerdict="not_returned"
			// was the v1 failure mode. T9 surfaces returnVerdict on TriggerResult.
			{
				id: "not_silently_completed",
				label:
					"Turn NOT silently completed (v1 regression guard: outcome≠completed when returnVerdict=not_returned)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed here
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const returnVerdict = ctx.triggerResult.returnVerdict;
					const outcome = ctx.triggerResult.outcome;

					if (outcome === "completed" && returnVerdict === "not_returned") {
						// Exact v1 bug: completed but not returned — regression detected
						return {
							score: 0.0,
							note:
								"v1 regression detected: outcome=completed with returnVerdict=not_returned. " +
								"The turn was silently accepted as complete despite no return action. " +
								"T6 (endSession outcome threading) has not fixed this correctly.",
						};
					}

					// "not_returned" outcome or "completed" with returnVerdict="returned" = no regression
					return {
						score: 1.0,
						note: `outcome=${outcome}, returnVerdict=${returnVerdict ?? "unknown"} — no v1 regression`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// fr-compliant-return-builder
// AC1 happy path: agent returns naturally; no force injected; outcome "completed".
// ---------------------------------------------------------------------------

const frCompliantReturnBuilder: EvalScenario = {
	id: "fr-compliant-return-builder",
	description:
		"AL6 v2 happy path: agent instructed to submit review; does so without forcing; " +
		"outcome 'completed', no force injection, return tool called",
	feature: "force_return",
	tags: [],

	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent. When you complete work,
always use submit_review to report your results. This is required — your work
is only visible to the team when you submit a review. Always call submit_review
at the end of your turn before stopping.`,
			taskTitle: "Write a brief status summary",
			taskDescription: `Write a brief status summary and submit it for review.

Use submit_review with:
- title: "Status Summary"
- reasoning: a brief summary of what you did
- No artifactRef needed

This is a simple task. Complete it and call submit_review before ending your turn.`,
			betDescription: "Team status reporting",
			betDoneCondition: "Status summary reviewed.",
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
			// Standard judges: session completed, review submitted
			judgeSessionCompleted(),
			judgeSubmitReviewCalled(),
			judgeSessionRowValid(),

			// Judge: NO force injection (compliant agent returns without being forced)
			// T9: forceReturnCount is now first-class on TriggerResult.
			{
				id: "no_force_injected",
				label: "No Forcing Message Injected (compliant return — agent returned voluntarily)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed here
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const count = ctx.triggerResult.forceReturnCount ?? 0;

					if (count === 0) {
						return {
							score: 1.0,
							note: "No force injection — agent returned voluntarily (correct for compliant scenario)",
						};
					}

					return {
						score: 0.0,
						note: `Force was injected ${count} time(s) — compliant agent should not need forcing`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// fr-forced-return-external
// AC4 Layer-B: agent on an external-shaped harness (hasNativeReturnHook:false)
// forced via the provisioning re-prompt loop (sandbox-file rewrite).
//
// T10 red: runEvalSession needs harnessKind:"external" support in provision-harness.ts.
// When T10 ships: the green phase adds the external adapter registration branch.
// Until then: this scenario is REGISTERED but skips-with-message when the external
// harness branch is absent — so the eval can still run the builtin scenarios.
//
// The forceReturnCount judge reads result.forceReturnCount (turn-level, §2.4):
//   - For the external path: = loopForceCount (Layer-B re-engages) ≥ 1.
//   - For builtin: = getSessionForceCount (Layer-A in-turn re-injects).
// This is the unified counter added in T6/T10.
// ---------------------------------------------------------------------------

const frForcedReturnExternal: EvalScenario = {
	id: "fr-forced-return-external",
	description:
		"AL6 v3 Layer-B: agent on an external-shaped harness (hasNativeReturnHook:false) " +
		"forced via the provisioning re-prompt loop through sandbox-file rewrite. " +
		"Proves forcing is harness-agnostic — not Claude-only.",
	feature: "force_return",
	tags: [],

	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent.
IMPORTANT INSTRUCTION: Do the analysis task below and then STOP your turn immediately.
Do NOT call submit_review, handoff_to, or send_message. Your job is just to analyze
and end your turn without reporting back. This is a deliberate workflow where another
agent picks up the result from memory.
Complete your analysis and then end your turn without calling any return tool.`,
			taskTitle: "Analyze task queue and summarize priorities (external harness test)",
			taskDescription: `Analyze the task queue:
1. Read any available context about the current priorities
2. Write a brief summary to memory using write_memory
3. End your turn

Do NOT call submit_review, send_message, or handoff_to.`,
			betDescription: "Task queue analysis (external harness)",
			betDoneCondition: "Task queue analyzed.",
		});
	},

	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		// AL6 v3 T10: harnessKind:"external" routes to the external-shaped adapter.
		// If claude CLI is present: uses CliHarnessAdapter (real subprocess + sandbox-file carrier).
		// Else: uses ExternalShapedAdapter (direct LLM call, reads AGENTS.md from sandbox).
		// Both prove Layer-B forcing via the provisioning re-prompt loop.
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
				harnessKind: "external",
			},
		);
	},

	rubric: {
		dimensions: [
			// Judge 1: Layer-B loop forced the external agent (forceReturnCount ≥ 1 via loop).
			// T10 red: forceReturnCount on TriggerResult reflects turn-level unified count.
			// For the external path: = loopForceCount (Layer-B re-engages, not builtin Layer-A).
			{
				id: "force_return_injected",
				label: "Layer-B Re-Prompt Loop Fired (forceReturnCount≥1, NOT builtin shortcut)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const count = ctx.triggerResult.forceReturnCount ?? 0;
					if (count === 0) {
						return {
							score: 0.0,
							note:
								"No force injection recorded (forceReturnCount=0). " +
								"Either the agent returned voluntarily (check judge #3) or the Layer-B loop " +
								"did not fire. Check that T10 wired the external harness registration and " +
								"that the agent system prompt discourages returns.",
						};
					}
					return {
						score: 1.0,
						note:
							`${count} Layer-B loop re-engage(s) recorded — ` +
							"external harness was forced via sandbox-file rewrite (not builtin shortcut). " +
							"AC4 live teeth verified.",
					};
				},
			},

			// Judge 2: outcome is completed or not_returned (never silently completed-without-return).
			{
				id: "return_eventually_called_or_not_returned",
				label: "Return Tool Called Eventually OR Outcome is not_returned (never silent-complete)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const outcome = ctx.triggerResult.outcome;

					if (outcome === "completed") {
						return {
							score: 1.0,
							note: "Session completed — external agent was forced to return via Layer-B and did so correctly",
						};
					}

					if (outcome === "not_returned") {
						return {
							score: 0.8,
							note:
								"Outcome 'not_returned' — forcing budget spent, external agent still refused. " +
								"Layer-B reject correctly prevented silent-complete. Score 0.8 (not 1.0) because " +
								"the agent was not successfully forced to return.",
						};
					}

					return {
						score: 0.0,
						note: `Unexpected outcome: ${outcome}. Session crashed rather than completing or not_returning.`,
					};
				},
			},

			// Judge 3: v1 regression guard — outcome≠completed when returnVerdict=not_returned.
			{
				id: "not_silently_completed",
				label:
					"Turn NOT silently completed (v1 regression guard: outcome≠completed when returnVerdict=not_returned)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const returnVerdict = ctx.triggerResult.returnVerdict;
					const outcome = ctx.triggerResult.outcome;

					if (outcome === "completed" && returnVerdict === "not_returned") {
						return {
							score: 0.0,
							note:
								"v1 regression detected: outcome=completed with returnVerdict=not_returned. " +
								"The external turn was silently accepted as complete despite no return action. " +
								"T6 (re-prompt loop) has not fixed this correctly.",
						};
					}

					return {
						score: 1.0,
						note: `outcome=${outcome}, returnVerdict=${returnVerdict ?? "unknown"} — no v1 regression`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const forceReturnScenarios: EvalScenario[] = [
	frForcedReturnBuilder,
	frCompliantReturnBuilder,
	frForcedReturnExternal,
];
