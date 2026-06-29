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

	it("step_start → benign empty completion (not an error — lifecycle event, AR2 fix)", () => {
		// @lore AR2 opencode-events: step_start is emitted at turn-start by opencode
		// `--format json`. Without this mapping it falls through to unknownEvent →
		// { type:"error" } → provisionSession crashed=true. Mapped to benign completion.
		const input = { type: "step_start", id: "s1" };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
	});

	it("text → benign empty completion (not an error — streaming chunk, AR2 fix)", () => {
		// @lore AR2 opencode-events: text events are streaming text chunks emitted by
		// opencode between step_start and step_finish. Mapped to benign completion.
		const input = { type: "text", content: "hello" };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
	});

	it("tool_use → tool_call (actual opencode --format json event shape, AR2 fix)", () => {
		// @lore AR2 opencode-tool_use: opencode --format json emits "tool_use" (not "tool")
		// for tool calls. Discovered 2026-06-29 by running opencode manually. Real event:
		// { type:"tool_use", part:{ type:"tool", tool:"bash", state:{ input:{ command:"echo 4" } } } }
		// Without this branch, tool_use hits default → preMapCodexEvent (no match) →
		// unknownEvent → { type:"error", code:"UnknownHarnessEvent" } → crash.
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
		expect(result.type).toBe("tool_call");
		if (result.type === "tool_call") {
			expect(result.toolName).toBe("bash");
			expect(result.args).toEqual({ command: "echo 4" });
		}
	});

	it("tool_use → tool_call (fallback toolName from top-level tool field when part absent)", () => {
		const input = {
			type: "tool_use",
			tool: "write_file",
			input: { path: "out.txt" },
		};
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("tool_call");
		if (result.type === "tool_call") {
			expect(result.toolName).toBe("write_file");
		}
	});

	it("genuinely unknown opencode type → error/UnknownHarnessEvent (not silently dropped)", () => {
		// Use a truly unrecognized type (not one of the handled lifecycle events).
		const input = { type: "opencode_future_unknown_event", id: "x1" };
		const result = normalizeHarnessEvent(input);
		// Unmapped types fall through to unknownEvent → error event with UnknownHarnessEvent code
		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.code).toBe("UnknownHarnessEvent");
		}
	});
});
