/**
 * Scenario 1: Knowledge Task
 *
 * Agent reads context, writes session notes and a knowledge item.
 * Exercises: provisioning -> tool registry -> write_session_notes -> write_memory -> session completes.
 */

import { knowledgeItems, sessions } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { EvalScenario } from "../types.js";

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

export const knowledgeTaskScenario: EvalScenario = {
	id: "knowledge-task",
	name: "Knowledge Task",
	description: "Agent reads context, writes session notes and a knowledge item",
	seed: {
		team: { id: "team-eval-1", name: "Eval Team" },
		teamMember: { id: "tm-eval-1" },
		agents: [{ id: "agent-builder-1", name: "Builder", role: "builder" }],
		bet: { id: "bet-eval-1", description: "Eval bet" },
		tasks: [
			{
				id: "task-eval-1",
				title: "Write knowledge",
				state: "accepted",
				description: "Read context and write findings",
			},
		],
	},
	trigger: { agentId: "agent-builder-1", taskId: "task-eval-1" },
	script: {
		turns: [
			{
				toolCalls: [
					{
						toolName: "write_session_notes",
						args: {
							notes:
								"## Session Notes\n\nReviewed context. Key finding: system uses event-driven architecture.",
						},
					},
				],
			},
			{
				toolCalls: [
					{
						toolName: "write_memory",
						args: {
							layer: "L2",
							kind: "pattern",
							title: "Event-driven architecture pattern",
							body: "The system uses an event bus for inter-component communication.",
						},
					},
				],
				completion: "I have documented my findings in session notes and created a knowledge item.",
			},
		],
	},
	assert: async (ctx) => {
		// AC: knowledge item exists in DB
		const kis = await ctx.db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "Event-driven architecture pattern"));
		assert(kis.length === 1, "Knowledge item should exist");
		const ki = kis[0];
		assert(ki !== undefined, "Knowledge item row should not be undefined");
		assert(
			ki.body.includes("event bus"),
			`Knowledge item body should contain "event bus", got: ${ki.body}`,
		);

		// AC: session notes persisted
		const sessionRows = await ctx.db
			.select()
			.from(sessions)
			.where(eq(sessions.id, ctx.sessionResult.sessionId));
		assert(sessionRows.length === 1, "Session row should exist");
		const session = sessionRows[0];
		assert(session !== undefined, "Session row should not be undefined");
		assert(
			session.notes !== null && session.notes !== undefined,
			"Session notes should be persisted",
		);
		assert(
			session.notes.includes("event-driven"),
			`Session notes should contain "event-driven", got: ${session.notes}`,
		);

		// AC: session completed
		assert(
			ctx.sessionResult.outcome === "completed",
			`Session should complete successfully, got: ${ctx.sessionResult.outcome}`,
		);
	},
};
