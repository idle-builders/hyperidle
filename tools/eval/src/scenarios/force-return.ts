/**
 * Live eval scaffold: force-return scenarios.
 *
 * Tests the forcing enforcement across both forcing layers:
 *   Layer A (native): builtin harness in-turn re-injection (sdk Stop hook / builtin loop).
 *   Layer B (loop):   provisioning re-prompt loop via sandbox-file rewrite.
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
 *   cd tools/eval && node dist/cli.js --feature force_return
 *
 * @lore Evals are NOT tests (see @lore X7). They require real LLM calls
 * and are run locally on demand. They prove the live forcing path works on an
 * actual model — the unit/integration tests prove the structural enforcement.
 */

import { judgeSendMessageCalled, judgeSessionCompleted, judgeSessionRowValid } from "../judges.js";
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
		"Forcing: agent told NOT to call return tools; forcing must re-inject " +
		"FORCE_RETURN_MESSAGE and ensure outcome is never completed-without-return",
	feature: "force_return",
	tags: [],

	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent.
IMPORTANT INSTRUCTION: Do the analysis task below and then STOP your turn immediately.
Do NOT call edit_task or send_message. Your job is just to analyze
and end your turn without reporting back. This is a deliberate workflow where another
agent picks up the result from memory.
Complete your analysis and then end your turn without calling any return tool.`,
			taskTitle: "Analyze the current task queue and summarize priorities",
			taskDescription: `Analyze the task queue:
1. Read any available context about the current priorities
2. Write a brief summary to memory using edit_document (as:"memory")
3. End your turn

Do NOT call edit_task or send_message.
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
			// Judge 1: force was injected (≥1 FORCE_RETURN_MESSAGE injection)
			// T9: TriggerResult.forceReturnCount is now surfaced by provision-harness.ts.
			{
				id: "force_return_injected",
				label: "Forcing Message Injected (≥1 FORCE_RETURN_MESSAGE)",
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
		"Happy path: agent instructed to submit review; does so without forcing; " +
		"outcome 'completed', no force injection, return tool called",
	feature: "force_return",
	tags: [],

	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent. When you complete work,
always use send_message with type "review" to report your results. This is required — your work
is only visible to the team when you submit a review. Always call send_message
at the end of your turn before stopping.`,
			taskTitle: "Write a brief status summary",
			taskDescription: `Write a brief status summary and submit it for review.

Use send_message with type "review" and:
- title: "Status Summary"
- reasoning: a brief summary of what you did
- No artifactRef needed

This is a simple task. Complete it and call send_message before ending your turn.`,
			betDescription: "Team status reporting",
			betDoneCondition: "Status summary reviewed.",
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
			// Standard judges: session completed, review submitted
			judgeSessionCompleted(),
			judgeSendMessageCalled(),
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
// AC4 Layer-B: an agent that ends its turn without returning is forced via the
// provisioning re-prompt loop (sandbox-file rewrite).
//
// @lore This used to select a second, external-shaped adapter to get a harness
// with `returnEnforcement:"none"`. It no longer needs to ask for one: which
// enforcement channel a run exercises is now a property of the harness the run
// selected, and a harness with no native hook takes the Layer-B loop by itself.
//
// The forceReturnCount judge reads result.forceReturnCount (turn-level, §2.4) —
// the unified counter, whichever channel fired.
// ---------------------------------------------------------------------------

const frForcedReturnExternal: EvalScenario = {
	id: "fr-forced-return-external",
	description:
		"Layer-B: agent on an external-shaped harness (hasNativeReturnHook:false) " +
		"forced via the provisioning re-prompt loop through sandbox-file rewrite. " +
		"Proves forcing is harness-agnostic — not Claude-only.",
	feature: "force_return",
	tags: [],

	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent.
IMPORTANT INSTRUCTION: Do the analysis task below and then STOP your turn immediately.
Do NOT call edit_task or send_message. Your job is just to analyze
and end your turn without reporting back. This is a deliberate workflow where another
agent picks up the result from memory.
Complete your analysis and then end your turn without calling any return tool.`,
			taskTitle: "Analyze task queue and summarize priorities (external harness test)",
			taskDescription: `Analyze the task queue:
1. Read any available context about the current priorities
2. Write a brief summary to memory using edit_document (as:"memory")
3. End your turn

Do NOT call edit_task or send_message.`,
			betDescription: "Task queue analysis (external harness)",
			betDoneCondition: "Task queue analyzed.",
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
							"live teeth verified.",
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
// fr-forced-return-external-compliant
// AC4 Layer-B happy path: external-shaped harness converts a plausibly-non-returning
// agent into returning via the provisioning re-prompt loop.
//
// Design intent:
//   Run-1 seed: agent is given a short analysis task with a compliant disposition
//   but no explicit instruction to call send_message RIGHT NOW. This creates
//   plausible first-run ambiguity — the agent may complete the analysis without
//   calling a return tool (it "thinks it's just one turn of analysis").
//
//   Run-2+ (after forcing): AGENTS.md is rewritten with FORCE_RETURN_MESSAGE.
//   The compliant agent reads the updated file and calls send_message.
//
//   Judge pass condition:
//     forceReturnCount >= 1   → Layer-B loop fired (sandbox was rewritten)
//     outcome == "completed"  → agent returned (not rejected to not_returned)
//     returnVerdict == "returned" → send_message was received by the ReturnGate
//
// This proves the "convert success" path on an external harness — the strongest
// proof of the founder's bar: "this needs to work with all harnesses."
//
// The existing fr-forced-return-external proves the "reject floor" (agent still
// won't comply after max re-prompts → not_returned).
// Together they form complete Layer-B coverage:
//   fr-forced-return-external          → reject floor (forceReturnCount=2, not_returned)
//   fr-forced-return-external-compliant → convert success (forceReturnCount>=1, completed)
//
// @lore Seed tuning notes — the system prompt deliberately omits
// "always call send_message at the end" to avoid run-1 compliance defeating the
// forcing signal. The task is framed as pure analysis so a neutral model naturally
// ends its turn by describing findings rather than invoking a return tool. The
// forcing message in AGENTS.md then explicitly triggers the return.
// ---------------------------------------------------------------------------

const frForcedReturnExternalCompliant: EvalScenario = {
	id: "fr-forced-return-external-compliant",
	description:
		"Layer-B happy path: compliant external-shaped agent is forced via " +
		"provisioning re-prompt loop (sandbox-file rewrite). Proves forcing CONVERTS " +
		"a real external agent from not-returning into returning. " +
		"Pass condition: forceReturnCount≥1 AND outcome=completed AND returnVerdict=returned.",
	feature: "force_return",
	tags: [],

	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			// @lore Seed tuning — compliant but ambiguous system prompt.
			// "You are a builder agent" → willing to comply with orchestrator directives.
			// No "always call send_message at end" — leaves run-1 open to end without return.
			// When AGENTS.md is rewritten with FORCE_RETURN_MESSAGE on run-2, the
			// compliant framing means the agent reads the forcing instruction and obeys.
			agentSystemPrompt: `You are a builder agent on a cross-functional team.
You follow your team's workflow conventions, including any directives in AGENTS.md.
When you complete work, you can summarize your findings in your response.
Always comply with any system-level instructions about task completion workflows.`,
			taskTitle: "Review the active bet and summarize its current state",
			taskDescription: `Review the active bet context and summarize:
1. What is the bet's main objective?
2. What is the done condition?

Write a brief 2-3 sentence summary of your findings.
Your response is complete once you have written the summary.`,
			betDescription: "Bet state review",
			betDoneCondition: "Bet state reviewed and summarized.",
		});
	},

	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		// Layer-B forcing via external-shaped harness (same as fr-forced-return-external).
		// The ExternalShapedAdapter reads AGENTS.md on each startSession.
		// When the provisioning loop detects no return on run-1, it rewrites AGENTS.md
		// with FORCE_RETURN_MESSAGE. The compliant agent reads it on run-2 and calls
		// send_message — yielding outcome=completed and returnVerdict=returned.
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
			// Judge 1: Layer-B loop fired (forceReturnCount ≥ 1).
			// If the agent returned on run-1 without forcing, forceReturnCount=0
			// and score=0 (the scenario only proves compliance, not forced conversion).
			{
				id: "force_return_injected",
				label: "Layer-B Loop Fired (forceReturnCount≥1 — forcing converted the agent)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const count = ctx.triggerResult.forceReturnCount ?? 0;
					if (count === 0) {
						return {
							score: 0.0,
							note:
								"No force injection recorded (forceReturnCount=0). " +
								"The agent returned voluntarily on run-1 — the scenario proves compliance " +
								"but NOT forced conversion. The seed needs stronger run-1 ambiguity. " +
								"Or the Layer-B loop did not fire.",
						};
					}
					return {
						score: 1.0,
						note:
							`${count} Layer-B loop re-engage(s) recorded — ` +
							"sandbox-file was rewritten with FORCE_RETURN_MESSAGE and agent was re-prompted. " +
							"Forcing mechanism fired correctly.",
					};
				},
			},

			// Judge 2: outcome = "completed" (agent returned after being forced — the convert-success path).
			// Score 0.0 for not_returned (reject floor — not what this scenario proves).
			{
				id: "outcome_completed_after_forcing",
				label: "Outcome = completed (agent converted from not-returning to returning by forcing)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const outcome = ctx.triggerResult.outcome;

					if (outcome === "completed") {
						return {
							score: 1.0,
							note:
								"Session completed — external agent was forced via Layer-B AND successfully returned. " +
								"Convert-success path verified.",
						};
					}

					if (outcome === "not_returned") {
						return {
							score: 0.0,
							note:
								"Outcome 'not_returned' — forcing budget spent, compliant agent still refused. " +
								"This proves the reject floor, not the convert-success path. " +
								"Seed may not be compliant enough. Iterate the system prompt or task description " +
								"to make post-forcing compliance more likely.",
						};
					}

					return {
						score: 0.0,
						note: `Unexpected outcome: ${outcome}. Session crashed.`,
					};
				},
			},

			// Judge 3: returnVerdict = "returned" (send_message was received by ReturnGate).
			// The combination forceReturnCount≥1 + outcome=completed + returnVerdict=returned
			// is the exact proof the founder asked for: "forcing converts a real external agent."
			{
				id: "return_verdict_returned",
				label: "returnVerdict = returned (send_message received by ReturnGate after forcing)",
				// biome-ignore lint/suspicious/useAwait: judge interface requires Promise; no DB query needed
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const returnVerdict = ctx.triggerResult.returnVerdict;
					const outcome = ctx.triggerResult.outcome;

					if (returnVerdict === "returned") {
						return {
							score: 1.0,
							note:
								`returnVerdict=returned, outcome=${outcome} — ` +
								"send_message was called after forcing. Convert-success on external harness proven.",
						};
					}

					// After the "returned" guard above, returnVerdict is "not_returned" | undefined.
					// If the session completed without a valid return action, that is the v1 regression.
					if (outcome === "completed") {
						return {
							score: 0.0,
							note:
								"v1 regression: outcome=completed but returnVerdict≠returned. " +
								`returnVerdict=${returnVerdict ?? "absent"}. ` +
								"The session closed without a valid return action.",
						};
					}

					return {
						score: 0.0,
						note:
							`returnVerdict=${returnVerdict ?? "absent"}, outcome=${outcome} — ` +
							"no return action received by ReturnGate.",
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
	frForcedReturnExternalCompliant,
];
