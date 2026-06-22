/**
 * AL6 v2 — Live eval scaffold: force-return scenarios.
 *
 * Tests the forcing enforcement: on the builtin harness (Tier-1 force path),
 * an agent that attempts to end without returning is re-prompted with
 * AL6_FORCE_RETURN_MESSAGE, and either returns or settles "not_returned"
 * (NEVER "completed" without a return).
 *
 * Two scenarios:
 *   fr-forced-return-builder  — AC1/AC3 teeth: agent tempted to NOT return;
 *                               forcing must fire; outcome must not be
 *                               "completed" with returnVerdict="not_returned".
 *   fr-compliant-return-builder — AC1 happy path: agent returns naturally;
 *                               no force injected; outcome "completed".
 *
 * Run locally only (live LLM, never CI):
 *   cd packages/eval && node dist/cli.js --feature force_return
 *
 * NOTE — WARNING-B (architecture-critique § v2 WARNING-B):
 *   `TriggerResult.outcome` is currently typed `"completed" | "crashed"`
 *   (eval/src/types.ts:59). It CANNOT carry "not_returned". Until green phase
 *   (T9) widens TriggerResult to include:
 *     readonly outcome: "completed" | "crashed" | "not_returned";
 *     readonly returnVerdict?: "returned" | "not_returned";
 *   — the judges that assert `triggerResult.outcome === "not_returned"` and
 *   `triggerResult.returnVerdict === "not_returned"` will fail to compile or
 *   produce incorrect results. This file is written in its correct final shape
 *   NOW (red), so the green phase is forced to widen TriggerResult before the
 *   judges can pass.
 *
 * @lore AL6: Evals are NOT tests (see @lore X7). They require real LLM calls
 * and are run locally on demand. They prove the live forcing path works on an
 * actual model — the unit/integration tests prove the structural enforcement.
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
			// WARNING-B: reads triggerResult.forceReturnCount — an additive eval-only field
			// that runEvalSession must surface (currently absent from TriggerResult).
			// This judge will compile only when TriggerResult gains forceReturnCount.
			{
				id: "force_return_injected",
				label: "Forcing Message Injected (≥1 AL6_FORCE_RETURN_MESSAGE)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed here
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// WARNING-B: TriggerResult.forceReturnCount is not yet defined.
					// When green (T9) adds it, this cast becomes safe.
					// Until then this judge compiles but will score 0 (field undefined).
					const extResult = ctx.triggerResult as TriggerResult & {
						forceReturnCount?: number;
					};
					const count = extResult.forceReturnCount ?? 0;
					if (count === 0) {
						return {
							score: 0.0,
							note:
								"No force injection recorded (forceReturnCount=0 or field absent). " +
								"Either the agent returned voluntarily (check judge #3) or T9 has not " +
								"yet widened TriggerResult.forceReturnCount.",
						};
					}
					return {
						score: 1.0,
						note: `${count} force injection(s) recorded`,
					};
				},
			},

			// Judge 2: return eventually called OR outcome is not_returned
			// (either proves the turn was NOT accepted as clean completed-without-return)
			// WARNING-B: reads triggerResult.outcome which is currently narrow to
			// "completed"|"crashed". Until T9 widens it to include "not_returned",
			// this judge cannot distinguish "not_returned" from "crashed".
			{
				id: "return_eventually_called_or_not_returned",
				label:
					"Return Tool Called Eventually OR Outcome is not_returned (NEVER completed-without-return)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed here
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// WARNING-B: outcome may be "crashed" because runEvalSession currently maps
					// "not_returned" → "crashed" (it's not in the "completed" | "crashed" union).
					// After T9 widens TriggerResult.outcome, "not_returned" flows through directly.
					const outcome = ctx.triggerResult.outcome;

					// If the return tools was called, the session should be "completed"
					if (outcome === "completed") {
						// Agent was forced and then returned — the good path.
						// Check that it wasn't trivially compliant (judge #1 will catch that).
						return {
							score: 1.0,
							note: "Session completed — agent was eventually forced to return and did so",
						};
					}

					// WARNING-B: when T9 widens TriggerResult.outcome:
					// "not_returned" outcome = forcing was attempted but agent refused both times;
					// the rejection fallback fired — still correct (turn not silently completed).
					// For now, "crashed" is the proxy for "not_returned" in the current narrow type.
					if (outcome === "crashed") {
						return {
							score: 0.8,
							note:
								"Outcome 'crashed' (proxy for 'not_returned' before T9 widens TriggerResult). " +
								"If this is 'not_returned' mapped to 'crashed' by runEvalSession, score is correct. " +
								"After T9, re-evaluate against outcome:'not_returned'.",
						};
					}

					return {
						score: 0.0,
						note: `Unexpected outcome: ${outcome}`,
					};
				},
			},

			// Judge 3: outcome is NOT completed-with-not_returned-verdict (the v1 bug)
			// This is the exact regression test: a "completed" outcome where
			// returnVerdict="not_returned" was the v1 failure mode.
			// WARNING-B: reads triggerResult.returnVerdict — another additive field absent
			// from the current TriggerResult type. Until T9 adds it, this judge cannot
			// directly assert the verdict. It falls back to outcome-based detection.
			{
				id: "not_silently_completed",
				label:
					"Turn NOT silently completed (v1 regression guard: outcome≠completed when returnVerdict=not_returned)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed here
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// WARNING-B: returnVerdict is not yet on TriggerResult.
					// After T9 widens TriggerResult, use:
					//   if (ctx.triggerResult.outcome === "completed" &&
					//       ctx.triggerResult.returnVerdict === "not_returned") { score: 0 }
					const extResult = ctx.triggerResult as TriggerResult & {
						returnVerdict?: string;
					};
					const returnVerdict = extResult.returnVerdict;
					const outcome = ctx.triggerResult.outcome;

					if (outcome === "completed" && returnVerdict === "not_returned") {
						// Exact v1 bug: completed but not returned — regression
						return {
							score: 0.0,
							note:
								"v1 regression detected: outcome=completed with returnVerdict=not_returned. " +
								"The turn was silently accepted as complete despite no return action. " +
								"T6 (endSession outcome threading) has not been fixed.",
						};
					}

					if (outcome === "completed" && returnVerdict === undefined) {
						// returnVerdict not yet surfaced — ambiguous; partial credit
						return {
							score: 0.5,
							note:
								"outcome=completed but returnVerdict not yet surfaced by TriggerResult (WARNING-B). " +
								"Cannot confirm v1 regression absence until T9 widens TriggerResult.",
						};
					}

					// "not_returned" (or proxy "crashed") + any verdict = no regression
					return {
						score: 1.0,
						note: `outcome=${outcome}, returnVerdict=${returnVerdict ?? "not-yet-surfaced"} — no v1 regression`,
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
			// WARNING-B: reads triggerResult.forceReturnCount — additive field not yet on TriggerResult.
			// After T9, this will directly assert forceReturnCount === 0.
			{
				id: "no_force_injected",
				label: "No Forcing Message Injected (compliant return — agent returned voluntarily)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed here
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const extResult = ctx.triggerResult as TriggerResult & {
						forceReturnCount?: number;
					};
					const count = extResult.forceReturnCount;

					if (count === undefined) {
						// forceReturnCount not yet surfaced (WARNING-B)
						return {
							score: 0.5,
							note:
								"forceReturnCount not yet surfaced on TriggerResult (WARNING-B). " +
								"Cannot confirm no-force until T9 widens TriggerResult.",
						};
					}

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
// Export
// ---------------------------------------------------------------------------

export const forceReturnScenarios: EvalScenario[] = [
	frForcedReturnBuilder,
	frCompliantReturnBuilder,
];
