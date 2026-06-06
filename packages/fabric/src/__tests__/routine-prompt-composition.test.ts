/**
 * AA2 — Routine prompt composition tests.
 *
 * AC-3: composeRoutinePrompt produces a prompt with "## Routine" section,
 *       not "## Task" section. Includes last run summary when present.
 *       Shows "This is the first run" when no last run summary.
 */

import { describe, expect, it } from "vitest";
import { composeRoutinePrompt, type RoutinePromptCompositionInput } from "../prompt-composition.js";
import type { RoutineSessionContextData } from "../session-context.js";

function makeRoutineContext(
	overrides: Partial<RoutineSessionContextData["routine"]> = {},
): RoutineSessionContextData {
	return {
		routine: {
			id: "routine-1",
			name: "Daily digest",
			description: "Sends a daily summary to the team",
			lastRunSummary: null,
			...overrides,
		},
		agent: {
			id: "agent-1",
			name: "Digest Agent",
			role: "builder",
		},
		team: {
			id: "team-1",
			name: "Build Team",
		},
	};
}

describe("composeRoutinePrompt", () => {
	it("produces a prompt with a ## Routine section", async () => {
		const input: RoutinePromptCompositionInput = {
			soulPromptText: "",
			context: makeRoutineContext(),
			tools: [],
			workspacePath: "/tmp/ws",
		};

		const result = await composeRoutinePrompt(input);

		expect(result.composedPrompt).toContain("## Routine");
	});

	it("does NOT include a ## Task section in routine prompt", async () => {
		const input: RoutinePromptCompositionInput = {
			soulPromptText: "",
			context: makeRoutineContext(),
			tools: [],
			workspacePath: "/tmp/ws",
		};

		const result = await composeRoutinePrompt(input);

		expect(result.composedPrompt).not.toContain("## Task");
	});

	it("includes the routine name in the prompt", async () => {
		const input: RoutinePromptCompositionInput = {
			soulPromptText: "",
			context: makeRoutineContext({ name: "Weekly report" }),
			tools: [],
			workspacePath: "/tmp/ws",
		};

		const result = await composeRoutinePrompt(input);

		expect(result.composedPrompt).toContain("Weekly report");
	});

	it("includes the routine description when present", async () => {
		const input: RoutinePromptCompositionInput = {
			soulPromptText: "",
			context: makeRoutineContext({ description: "Summarizes the week" }),
			tools: [],
			workspacePath: "/tmp/ws",
		};

		const result = await composeRoutinePrompt(input);

		expect(result.composedPrompt).toContain("Summarizes the week");
	});

	it("includes Last Run Summary section with the summary text when present", async () => {
		const input: RoutinePromptCompositionInput = {
			soulPromptText: "",
			context: makeRoutineContext({
				lastRunSummary: "Successfully sent 10 notifications.",
			}),
			tools: [],
			workspacePath: "/tmp/ws",
		};

		const result = await composeRoutinePrompt(input);

		expect(result.composedPrompt).toContain("Last Run Summary");
		expect(result.composedPrompt).toContain("Successfully sent 10 notifications.");
	});

	it("shows 'This is the first run' when lastRunSummary is null", async () => {
		const input: RoutinePromptCompositionInput = {
			soulPromptText: "",
			context: makeRoutineContext({ lastRunSummary: null }),
			tools: [],
			workspacePath: "/tmp/ws",
		};

		const result = await composeRoutinePrompt(input);

		expect(result.composedPrompt).toContain("This is the first run");
	});

	it("includes soul prompt identity section when soulPromptText is provided", async () => {
		const input: RoutinePromptCompositionInput = {
			soulPromptText: "# Agent Identity\n\nYou are a focused digest agent.",
			context: makeRoutineContext(),
			tools: [],
			workspacePath: "/tmp/ws",
		};

		const result = await composeRoutinePrompt(input);

		expect(result.composedPrompt).toContain("## Identity");
		expect(result.composedPrompt).toContain("focused digest agent");
	});

	it("omits Identity section when soulPromptText is empty", async () => {
		const input: RoutinePromptCompositionInput = {
			soulPromptText: "",
			context: makeRoutineContext(),
			tools: [],
			workspacePath: "/tmp/ws",
		};

		const result = await composeRoutinePrompt(input);

		expect(result.composedPrompt).not.toContain("## Identity");
	});

	it("returns personaToolsTokens as a number", async () => {
		const input: RoutinePromptCompositionInput = {
			soulPromptText: "",
			context: makeRoutineContext(),
			tools: [],
			workspacePath: "/tmp/ws",
		};

		const result = await composeRoutinePrompt(input);

		expect(typeof result.personaToolsTokens).toBe("number");
		expect(result.personaToolsTokens).toBeGreaterThanOrEqual(0);
	});
});
