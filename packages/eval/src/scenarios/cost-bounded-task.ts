/**
 * Scenario 5: Cost-Bounded Task
 *
 * Agent works within a cost cap. The session emits cost_update events
 * that accumulate cost on the bet. Verifies the cost-tracking path:
 * cost_update events -> recordCostAndCheck -> bet.costActualMinor increment.
 */

import { bets } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { EvalScenario } from "../types.js";

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

export const costBoundedTaskScenario: EvalScenario = {
	id: "cost-bounded-task",
	name: "Cost-Bounded Task",
	description: "Agent works within a cost cap; cost tracking verified",
	seed: {
		team: { id: "team-eval-5", name: "Cost Team" },
		teamMember: { id: "tm-eval-5" },
		agents: [
			{
				id: "agent-builder-5",
				name: "Cost Builder",
				role: "builder",
				costCapMinor: 500, // $5.00 cap
			},
		],
		bet: {
			id: "bet-eval-5",
			description: "Cost-bounded bet",
			costAppetiteMinor: 1000, // $10.00 appetite
		},
		tasks: [
			{
				id: "task-eval-5",
				title: "Cost-tracked work",
				state: "accepted",
				description: "Do work within cost bounds",
			},
		],
	},
	trigger: { agentId: "agent-builder-5", taskId: "task-eval-5" },
	script: {
		turns: [
			{
				toolCalls: [
					{
						toolName: "write_session_notes",
						args: { notes: "Starting cost-tracked work." },
					},
				],
				costDelta: 0.5, // $0.50
			},
			{
				toolCalls: [
					{
						toolName: "write_memory",
						args: {
							layer: "L2",
							kind: "pattern",
							title: "Cost tracking pattern",
							body: "Verified cost tracking works end-to-end.",
						},
					},
				],
				costDelta: 0.25, // $0.25
				completion: "Completed cost-bounded work.",
			},
		],
	},
	assert: async (ctx) => {
		// AC: session completed (not crashed by cap breach)
		// Note: the cost cap for the agent is 500 minor units ($5.00).
		// Our cost deltas are $0.50 + $0.25 = $0.75 = 75 cents, well within cap.
		assert(
			ctx.sessionResult.outcome === "completed",
			`Session should complete within cost cap, got: ${ctx.sessionResult.outcome}`,
		);

		// AC: cost recorded on bet
		const betRows = await ctx.db.select().from(bets).where(eq(bets.id, "bet-eval-5"));
		assert(betRows.length === 1, "Bet should exist");
		const bet = betRows[0];
		assert(bet !== undefined, "Bet row should not be undefined");
		assert(
			bet.costActualMinor !== null && bet.costActualMinor > 0,
			`Expected positive costActualMinor, got ${bet.costActualMinor}`,
		);

		// AC: total cost cents positive in session result
		assert(
			ctx.sessionResult.totalCostCents > 0,
			`Expected positive totalCostCents, got ${ctx.sessionResult.totalCostCents}`,
		);
	},
};
