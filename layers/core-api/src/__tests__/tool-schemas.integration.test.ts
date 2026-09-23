import { toClaudeToolSpec } from "@hyperidle/tool-handlers";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { actionsAsTools } from "../actions/actions-as-tools.js";
import { buildCoreActions } from "../actions/compose.js";

// @lore BC5 T11: the hand-written management catalog (`create_team`/
// `add_agent`, `buildToolDefinitions`) is DELETED with the `CoreApiPort`
// seam it wrote through — the `org` package they scaffolded is gone. What
// an agent gets today is the composed action list's own tool projection
// only; the three document tools below are that projection's own
// long-standing schema proof.
const DOCUMENT_TOOL_NAMES = ["search_documents", "open_document", "edit_document"];

describe("AC8: every tool has a valid Claude tool_use JSON schema", () => {
	// @lore document-module B14: the three document tools aren't hand-written
	// `ToolDefinition`s — they're the composed `document` action's own
	// `actionsAsTools` projection, an agent reaches the same way it reaches
	// `search_tasks`/`send_message`.
	test("each document tool has a valid Claude tool_use JSON schema", ({ agentOrchestration }) => {
		const actionTools = actionsAsTools(
			buildCoreActions({
				agentOrchestration,
				agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
				reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
			}),
		);
		const documentTools = actionTools.filter((t) => DOCUMENT_TOOL_NAMES.includes(t.name));
		expect(documentTools.map((t) => t.name).sort()).toEqual([...DOCUMENT_TOOL_NAMES].sort());

		for (const tool of documentTools) {
			const spec = toClaudeToolSpec(tool);
			expect(spec.name).toBe(tool.name);
			expect(typeof spec.description).toBe("string");
			expect(spec.description.length).toBeGreaterThan(10);
			expect(spec.input_schema).toBeDefined();
			expect(spec.input_schema.type).toBe("object");
			expect(typeof spec.input_schema.properties).toBe("object");
			expect(spec.input_schema.properties).not.toBeNull();
			expect(Array.isArray(spec.input_schema.properties)).toBe(false);
			expect(() => JSON.stringify(spec)).not.toThrow();
		}

		// @lore §3.6/A4: the sentence an agent reads has to teach it the three
		// `as` values by name — `edit_document` is the door a model must pick
		// "memory" vs "artifact" vs "document" through, so both words are
		// asserted as a red-first case, not just "description is long enough".
		const editDocument = documentTools.find((t) => t.name === "edit_document");
		expect(editDocument).toBeDefined();
		if (!editDocument) return;
		const editSpec = toClaudeToolSpec(editDocument);
		expect(editSpec.description).toContain("memory");
		expect(editSpec.description).toContain("artifact");
	});
});
