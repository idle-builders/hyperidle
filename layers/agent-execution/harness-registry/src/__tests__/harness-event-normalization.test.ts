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

describe("normalizeHarnessEvent — opencode pre-map", () => {
	it("step_finish → completion (text from properties.output)", () => {
		const input = {
			type: "step_finish",
			properties: { output: "The task is done." },
		};
		const result = normalizeHarnessEvent(input);
		expect(result).toMatchObject({ type: "completion", text: "The task is done." });
	});

	it("step_finish → completion (text from top-level output when no properties)", () => {
		const input = { type: "step_finish", output: "Turn complete." };
		const result = normalizeHarnessEvent(input);
		expect(result).toMatchObject({ type: "completion", text: "Turn complete." });
	});

	it("step_finish → completion (empty text when no extractable output)", () => {
		const input = { type: "step_finish" };
		const result = normalizeHarnessEvent(input);
		expect(result).toMatchObject({ type: "completion", text: "" });
	});

	it("tool → tool_call (toolName from tool field, args from input)", () => {
		const input = {
			type: "tool",
			tool: "commit_file",
			input: { path: "proof.txt", content: "al7-proof" },
		};
		const result = normalizeHarnessEvent(input);
		expect(result).toMatchObject({
			type: "tool_call",
			toolName: "commit_file",
			args: { path: "proof.txt", content: "al7-proof" },
		});
	});

	it("tool → tool_call (toolName from name field when tool absent)", () => {
		const input = {
			type: "tool",
			name: "write_file",
			args: { path: "out.txt" },
		};
		const result = normalizeHarnessEvent(input);
		expect(result).toMatchObject({
			type: "tool_call",
			toolName: "write_file",
			args: { path: "out.txt" },
		});
	});

	it("step_start → benign empty completion (not an error — a lifecycle event)", () => {
		const input = { type: "step_start", id: "s1" };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
	});

	it("text → completion with part.text (real opencode event shape)", () => {
		const input = {
			type: "text",
			part: { type: "text", text: '[{"title":"Task 1"}]' },
		};
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
		expect((result as import("@hyperidle/harness-protocol").CompletionEvent).text).toBe(
			'[{"title":"Task 1"}]',
		);
	});

	it("text without part.text → benign empty completion (legacy shape)", () => {
		// Input without part.text (legacy/unknown shape) still maps to empty completion.
		const input = { type: "text", content: "hello" };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
		expect((result as import("@hyperidle/harness-protocol").CompletionEvent).text).toBe("");
	});

	it("tool_use → tool_call (actual opencode --format json event shape)", () => {
		const input = {
			type: "tool_use",
			part: {
				type: "tool",
				tool: "bash",
				callID: "call_abc",
				state: {
					status: "completed",
					input: { command: "echo 4" },
					output: "4\n",
				},
			},
		};
		const result = normalizeHarnessEvent(input);
		expect(result).toMatchObject({
			type: "tool_call",
			toolName: "bash",
			args: { command: "echo 4" },
		});
	});

	it("tool_use → tool_call (fallback toolName from top-level tool field when part absent)", () => {
		const input = {
			type: "tool_use",
			tool: "write_file",
			input: { path: "out.txt" },
		};
		const result = normalizeHarnessEvent(input);
		expect(result).toMatchObject({ type: "tool_call", toolName: "write_file" });
	});

	it("genuinely unknown opencode type → error/UnknownHarnessEvent (not silently dropped)", () => {
		// Use a truly unrecognized type (not one of the handled lifecycle events).
		const input = { type: "opencode_future_unknown_event", id: "x1" };
		const result = normalizeHarnessEvent(input);
		// Unmapped types fall through to unknownEvent → error event with UnknownHarnessEvent code
		expect(result).toMatchObject({ type: "error", code: "UnknownHarnessEvent" });
	});
});
