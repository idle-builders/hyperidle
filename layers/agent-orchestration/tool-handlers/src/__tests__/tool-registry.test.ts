/**
 * Dispatch-mechanics unit tests for `buildToolRegistry`.
 *
 * @lore uses a locally-built fixture tool, not the real `returnStatusTool` — importing it here would be an illegal cross-layer import.
 */

import { EventBus } from "@hyperidle/event-bus";
import type { RegisteredTool, ToolContext } from "@hyperidle/harness-protocol";
import { err, ok } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import z from "zod";
import { buildToolRegistry } from "../tool-registry.js";

function makeCtx(): ToolContext<unknown> {
	return {
		db: undefined,
		eventBus: new EventBus(),
		agentId: "test-agent",
		sessionId: "test-session",
		taskId: "test-task",
		sandboxPath: "/tmp/test",
		ingestion: { dispose: () => {} },
	};
}

/** Shaped exactly like `returnStatusTool.forRegistry(registry)`'s output — an opaque `RegisteredTool`, never inspected by the dispatch. */
function makeFixtureExtraTool(): RegisteredTool {
	return {
		name: "fixture_extra_tool",
		description: "A fixture tool proving extraTools wiring.",
		inputSchema: z.object({}),
		handler: async () => ok({ fixture: true }),
	};
}

describe("buildToolRegistry", () => {
	it("merges extraTools into the built registry's definitions", () => {
		const registry = buildToolRegistry([], makeCtx(), {
			extraTools: [makeFixtureExtraTool()],
		});

		expect(registry.definitions.some((d) => d.name === "fixture_extra_tool")).toBe(true);
	});

	it("carries every base definition — no tool is scoped to a role", async () => {
		const base: RegisteredTool = {
			name: "base_tool",
			description: "Any agent may call it.",
			inputSchema: z.object({}),
			handler: async () => ok({ called: true }),
		};

		const registry = buildToolRegistry([base], makeCtx(), {});

		expect(registry.definitions.map((d) => d.name)).toEqual(["base_tool"]);
		expect(await registry.invoke("base_tool", {})).toEqual(ok({ called: true }));
	});

	it("answers NOT_FOUND for a name it does not carry", async () => {
		const registry = buildToolRegistry([], makeCtx(), {});
		expect(await registry.invoke("no_such_tool", {})).toEqual(
			err("NOT_FOUND", "Unknown tool: no_such_tool"),
		);
	});
});
