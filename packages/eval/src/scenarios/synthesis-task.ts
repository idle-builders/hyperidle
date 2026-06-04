/**
 * Scenario 3: Synthesis Task
 *
 * Agent reads multiple knowledge items (pre-seeded) and produces a summary artifact.
 * Exercises: create_artifact with kind="decision".
 *
 * @lore X7: The decision artifact preview shape is { kind: "decision", claim: string, rationale: string }.
 * The architecture plan had a bug using { title, summary } — this is the corrected version
 * per the artifactPreviewSchema in packages/server/src/schemas/artifact-preview.ts.
 */

import { artifacts } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { EvalScenario } from "../types.js";

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

export const synthesisTaskScenario: EvalScenario = {
	id: "synthesis-task",
	name: "Synthesis Task",
	description: "Agent reads knowledge items and produces a summary artifact",
	seed: {
		team: { id: "team-eval-3", name: "Synth Team" },
		teamMember: { id: "tm-eval-3" },
		agents: [{ id: "agent-builder-3", name: "Synthesizer", role: "builder" }],
		bet: { id: "bet-eval-3", description: "Synthesis bet" },
		tasks: [
			{
				id: "task-eval-3",
				title: "Synthesize findings",
				state: "accepted",
				description: "Read knowledge items and produce summary",
			},
		],
		knowledgeItems: [
			{ id: "ki-synth-1", title: "Finding A", body: "First finding about performance." },
			{ id: "ki-synth-2", title: "Finding B", body: "Second finding about reliability." },
			{ id: "ki-synth-3", title: "Finding C", body: "Third finding about scalability." },
		],
	},
	trigger: { agentId: "agent-builder-3", taskId: "task-eval-3" },
	script: {
		turns: [
			{
				toolCalls: [
					{
						toolName: "write_session_notes",
						args: { notes: "Read 3 knowledge items. Synthesizing into decision artifact." },
					},
				],
			},
			{
				toolCalls: [
					{
						toolName: "create_artifact",
						args: {
							kind: "decision",
							preview: {
								kind: "decision",
								// @lore X7: artifactPreviewSchema for "decision" requires { claim, rationale },
								// not { title, summary }. Using the correct shape here.
								claim: "Recommend event-driven architecture for performance and reliability",
								rationale:
									"Based on findings A, B, and C: performance, reliability, and scalability all benefit from event-driven patterns.",
							},
						},
					},
				],
				completion: "Created summary artifact from knowledge synthesis.",
			},
		],
	},
	assert: async (ctx) => {
		// AC: artifact created with correct kind
		const arts = await ctx.db
			.select()
			.from(artifacts)
			.where(eq(artifacts.producingTaskId, "task-eval-3"));
		assert(arts.length === 1, `Expected 1 artifact, got ${arts.length}`);
		const artifact = arts[0];
		assert(artifact !== undefined, "Artifact row should not be undefined");
		assert(artifact.kind === "decision", `Expected kind=decision, got ${artifact.kind}`);
		const preview = JSON.parse(artifact.previewJson ?? "{}") as Record<string, unknown>;
		assert(
			typeof preview["claim"] === "string",
			`Preview should have a claim field, got: ${JSON.stringify(preview)}`,
		);
		assert(
			(preview["claim"] as string).includes("event-driven"),
			`Preview claim should mention event-driven, got: ${preview["claim"]}`,
		);
	},
};
