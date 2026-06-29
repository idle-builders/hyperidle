/**
 * AL7 NIT-3 — normalizeHarnessEvent: opencode pre-map + unmapped type.
 *
 * Locks the `preMapOpencodeEvent` pre-map in CI (test:all). The pre-map is
 * required for the MCP-routed two-session loop to see opencode tool calls and
 * turn completions — without it all opencode events normalize to `unknown`.
 *
 * The local-only harness-facing lane (`AL7-two-session-trust-first.integration.test.ts`)
 * proves this against a live opencode binary; these deterministic unit tests lock
 * the pure function's behavior in every CI run, no binary required.
 */

import { describe, expect, it } from "vitest";
import { normalizeHarnessEvent } from "../harness-event-normalization.js";

describe("normalizeHarnessEvent — opencode pre-map (AL7 W3)", () => {
	it("step_finish → completion (text from properties.output)", () => {
		const input = {
			type: "step_finish",
			properties: { output: "The task is done." },
		};
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
		if (result.type === "completion") {
			expect(result.text).toBe("The task is done.");
		}
	});

	it("step_finish → completion (text from top-level output when no properties)", () => {
		const input = { type: "step_finish", output: "Turn complete." };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
		if (result.type === "completion") {
			expect(result.text).toBe("Turn complete.");
		}
	});

	it("step_finish → completion (empty text when no extractable output)", () => {
		const input = { type: "step_finish" };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
		if (result.type === "completion") {
			expect(result.text).toBe("");
		}
	});

	it("tool → tool_call (toolName from tool field, args from input)", () => {
		const input = {
			type: "tool",
			tool: "commit_file",
			input: { path: "proof.txt", content: "al7-proof" },
		};
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("tool_call");
		if (result.type === "tool_call") {
			expect(result.toolName).toBe("commit_file");
			expect(result.args).toEqual({ path: "proof.txt", content: "al7-proof" });
		}
	});

	it("tool → tool_call (toolName from name field when tool absent)", () => {
		const input = {
			type: "tool",
			name: "write_file",
			args: { path: "out.txt" },
		};
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("tool_call");
		if (result.type === "tool_call") {
			expect(result.toolName).toBe("write_file");
			expect(result.args).toEqual({ path: "out.txt" });
		}
	});

	it("unmapped opencode type → error/UnknownHarnessEvent (not silently dropped)", () => {
		const input = { type: "step_start", id: "s1" };
		const result = normalizeHarnessEvent(input);
		// Unmapped types fall through to unknownEvent → error event with UnknownHarnessEvent code
		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.code).toBe("UnknownHarnessEvent");
		}
	});
});
