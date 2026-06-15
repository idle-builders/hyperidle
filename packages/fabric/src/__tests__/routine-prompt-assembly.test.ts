/**
 * AA2 — Routine prompt assembly tests.
 *
 * AC-3: assembleRoutinePrompt produces a prompt with "## Routine" section,
 *       not "## Task" section. Includes last run summary when present.
 *       Shows "This is the first run" when no last run summary.
 */

import { describe, expect, it } from "vitest";
import {
	assembleRoutinePrompt,
	type RoutinePromptCompositionInput,
} from "../context-assembly-prompt.js";
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

describe("assembleRoutinePrompt", () => {
	it("produces a prompt with a ## Routine section", async () => {
		const input: RoutinePromptCompositionInput = {
			systemPromptText: "",
			context: makeRoutineContext(),
			tools: [],
			sandboxPath: "/tmp/ws",
		};

		const result = await assembleRoutinePrompt(input);

		expect(result.assembledPrompt).toContain("## Routine");
	});

	it("does NOT include a ## Task section in routine prompt", async () => {
		const input: RoutinePromptCompositionInput = {
			systemPromptText: "",
			context: makeRoutineContext(),
			tools: [],
			sandboxPath: "/tmp/ws",
		};

		const result = await assembleRoutinePrompt(input);

		expect(result.assembledPrompt).not.toContain("## Task");
	});

	it("includes the routine name in the prompt", async () => {
		const input: RoutinePromptCompositionInput = {
			systemPromptText: "",
			context: makeRoutineContext({ name: "Weekly report" }),
			tools: [],
			sandboxPath: "/tmp/ws",
		};

		const result = await assembleRoutinePrompt(input);

		expect(result.assembledPrompt).toContain("Weekly report");
	});

	it("includes the routine description when present", async () => {
		const input: RoutinePromptCompositionInput = {
			systemPromptText: "",
			context: makeRoutineContext({ description: "Summarizes the week" }),
			tools: [],
			sandboxPath: "/tmp/ws",
		};

		const result = await assembleRoutinePrompt(input);

		expect(result.assembledPrompt).toContain("Summarizes the week");
	});

	it("includes Last Run Summary section with the summary text when present", async () => {
		const input: RoutinePromptCompositionInput = {
			systemPromptText: "",
			context: makeRoutineContext({
				lastRunSummary: "Successfully sent 10 notifications.",
			}),
			tools: [],
			sandboxPath: "/tmp/ws",
		};

		const result = await assembleRoutinePrompt(input);

		expect(result.assembledPrompt).toContain("Last Run Summary");
		expect(result.assembledPrompt).toContain("Successfully sent 10 notifications.");
	});

	it("shows 'This is the first run' when lastRunSummary is null", async () => {
		const input: RoutinePromptCompositionInput = {
			systemPromptText: "",
			context: makeRoutineContext({ lastRunSummary: null }),
			tools: [],
			sandboxPath: "/tmp/ws",
		};

		const result = await assembleRoutinePrompt(input);

		expect(result.assembledPrompt).toContain("This is the first run");
	});

	it("includes system prompt identity section when systemPromptText is provided", async () => {
		const input: RoutinePromptCompositionInput = {
			systemPromptText: "# Agent Identity\n\nYou are a focused digest agent.",
			context: makeRoutineContext(),
			tools: [],
			sandboxPath: "/tmp/ws",
		};

		const result = await assembleRoutinePrompt(input);

		expect(result.assembledPrompt).toContain("## Identity");
		expect(result.assembledPrompt).toContain("focused digest agent");
	});

	it("omits Identity section when systemPromptText is empty", async () => {
		const input: RoutinePromptCompositionInput = {
			systemPromptText: "",
			context: makeRoutineContext(),
			tools: [],
			sandboxPath: "/tmp/ws",
		};

		const result = await assembleRoutinePrompt(input);

		expect(result.assembledPrompt).not.toContain("## Identity");
	});

	it("returns personaToolsTokens as a number", async () => {
		const input: RoutinePromptCompositionInput = {
			systemPromptText: "",
			context: makeRoutineContext(),
			tools: [],
			sandboxPath: "/tmp/ws",
		};

		const result = await assembleRoutinePrompt(input);

		expect(typeof result.personaToolsTokens).toBe("number");
		expect(result.personaToolsTokens).toBeGreaterThanOrEqual(0);
	});
});
