/**
 * Scenario 2: Coordination Task
 *
 * Agent creates subtasks and sends a review message.
 * Exercises: create_task (inserts task in "proposed" state) + submit_review (thread + review message).
 */

import { messages, tasks, threads } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import type { EvalScenario } from "../types.js";

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

export const coordinationTaskScenario: EvalScenario = {
	id: "coordination-task",
	name: "Coordination Task",
	description: "Agent creates subtasks and sends a review message",
	seed: {
		team: { id: "team-eval-2", name: "Coord Team" },
		teamMember: { id: "tm-eval-2" },
		agents: [
			{ id: "agent-pm-1", name: "PM Agent", role: "product_manager" },
			{ id: "agent-builder-2", name: "Builder 2", role: "builder" },
		],
		bet: { id: "bet-eval-2", description: "Coordination bet" },
		tasks: [
			{
				id: "task-eval-2",
				title: "Plan implementation",
				state: "accepted",
				description: "Break down work and request review",
				ownerAgentId: "agent-pm-1",
			},
		],
	},
	trigger: { agentId: "agent-pm-1", taskId: "task-eval-2" },
	script: {
		turns: [
			{
				toolCalls: [
					{
						toolName: "create_task",
						args: { title: "Implement API endpoint", description: "Build the REST endpoint" },
					},
					{
						toolName: "create_task",
						args: { title: "Write integration tests", description: "Cover all API paths" },
					},
				],
			},
			{
				toolCalls: [
					{
						toolName: "submit_review",
						args: {
							title: "Implementation plan ready for review",
							reasoning: ["Broke work into two subtasks", "API endpoint first, tests second"],
						},
					},
				],
				completion: "Created subtasks and submitted review.",
			},
		],
	},
	assert: async (ctx) => {
		// AC: subtasks exist
		const allTasks = await ctx.db.select().from(tasks).where(eq(tasks.betId, "bet-eval-2"));
		const subtasks = allTasks.filter((t) => t.id !== "task-eval-2");
		assert(subtasks.length === 2, `Expected 2 subtasks, got ${subtasks.length}`);
		const subtaskTitles = subtasks.map((t) => t.title);
		assert(
			subtaskTitles.includes("Implement API endpoint"),
			"Expected subtask 'Implement API endpoint'",
		);
		assert(
			subtaskTitles.includes("Write integration tests"),
			"Expected subtask 'Write integration tests'",
		);
		for (const subtask of subtasks) {
			assert(
				subtask.state === "proposed",
				`Subtask ${subtask.id} should be in proposed state, got ${subtask.state}`,
			);
		}

		// AC: review message in bet thread
		const betThreads = await ctx.db
			.select()
			.from(threads)
			.where(and(eq(threads.hostKind, "bet"), eq(threads.hostId, "bet-eval-2")));
		assert(betThreads.length === 1, `Bet thread should exist, found ${betThreads.length}`);
		const betThread = betThreads[0];
		assert(betThread !== undefined, "Bet thread row should not be undefined");
		const threadMessages = await ctx.db
			.select()
			.from(messages)
			.where(eq(messages.threadId, betThread.id));
		assert(
			threadMessages.length >= 1,
			`Review message should exist in thread, found ${threadMessages.length}`,
		);
	},
};
