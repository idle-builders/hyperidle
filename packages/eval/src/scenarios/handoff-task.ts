/**
 * Scenario 4: Handoff Task
 *
 * Agent works on a task, hits a blocker, and hands off to another agent.
 * Exercises: handoff_to (task ownership reassignment, audit trail).
 */

import { tasks } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { EvalScenario } from "../types.js";

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

export const handoffTaskScenario: EvalScenario = {
	id: "handoff-task",
	name: "Handoff Task",
	description: "Agent hits a blocker and hands off to another agent",
	seed: {
		team: { id: "team-eval-4", name: "Handoff Team" },
		teamMember: { id: "tm-eval-4" },
		agents: [
			{ id: "agent-builder-4a", name: "Builder A", role: "builder" },
			{ id: "agent-builder-4b", name: "Builder B", role: "builder" },
		],
		bet: { id: "bet-eval-4", description: "Handoff bet" },
		tasks: [
			{
				id: "task-eval-4",
				title: "Complex implementation",
				state: "accepted",
				ownerAgentId: "agent-builder-4a",
				description: "Implement feature that requires expertise",
			},
		],
	},
	trigger: { agentId: "agent-builder-4a", taskId: "task-eval-4" },
	script: {
		turns: [
			{
				toolCalls: [
					{
						toolName: "write_session_notes",
						args: {
							notes: "Started implementation. Hit a conceptual blocker on the DB schema design.",
						},
					},
				],
			},
			{
				toolCalls: [
					{
						toolName: "handoff_to",
						args: {
							toAgent: "agent-builder-4b",
							contextId: "task-eval-4",
							status: "blocked",
							reason: "Need expertise on PostgreSQL partitioning for the schema design",
							remainingWork: ["Design partitioned schema", "Implement migration"],
						},
					},
				],
				completion: "Handed off to Builder B due to schema expertise requirement.",
			},
		],
	},
	assert: async (ctx) => {
		// AC: task reassigned to agent-builder-4b
		const taskRows = await ctx.db.select().from(tasks).where(eq(tasks.id, "task-eval-4"));
		assert(taskRows.length === 1, "Task should exist");
		const task = taskRows[0];
		assert(task !== undefined, "Task row should not be undefined");
		assert(
			task.ownerAgentId === "agent-builder-4b",
			`Expected ownerAgentId=agent-builder-4b, got ${task.ownerAgentId}`,
		);

		// AC: audit trail has handoff entry
		const audit = JSON.parse(task.auditTrail ?? "[]") as Array<{
			type?: string;
			toAgent?: string;
		}>;
		const handoffEntry = audit.find((e) => e.type === "handoff");
		assert(handoffEntry !== undefined, "Audit trail should contain a handoff entry");
		assert(
			handoffEntry.toAgent === "agent-builder-4b",
			`Handoff entry should reference target agent, got: ${handoffEntry.toAgent}`,
		);
	},
};
