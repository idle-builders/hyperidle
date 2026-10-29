/**
 * reviewOrientation renders tool names with the harness's literal form —
 * send_message and create_task differ per adapter type (MCP namespace,
 * opencode prefix, or bare name).
 */

import { describe, expect, it } from "vitest";
import { reviewOrientation } from "../provisioner.js";

describe("reviewOrientation — tool names are harness-literal", () => {
	it("uses the MCP-namespaced names for claude-code adapters", () => {
		const text = reviewOrientation(
			"mcp__hyperidle__send_message",
			"mcp__hyperidle__create_task",
		);
		expect(text).toContain("`mcp__hyperidle__send_message`");
		expect(text).toContain("`mcp__hyperidle__create_task`");
	});

	it("uses the opencode-prefixed names for opencode adapters", () => {
		const text = reviewOrientation("hyperidle_send_message", "hyperidle_create_task");
		expect(text).toContain("`hyperidle_send_message`");
		expect(text).toContain("`hyperidle_create_task`");
	});

	it("uses bare names for adapters with no renaming", () => {
		const text = reviewOrientation("send_message", "create_task");
		expect(text).toContain("`send_message`");
		expect(text).toContain("`create_task`");
	});
});
