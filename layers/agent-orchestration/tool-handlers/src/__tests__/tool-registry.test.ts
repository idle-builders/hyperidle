/**
 * Dispatch-mechanics unit tests for `buildToolRegistry`.
 *
 * @lore AU31 §2.5: relocated with `tool-registry.ts` from
 * `@hyperidle/harness-registry` (agent-execution) into `@hyperidle/tool-
 * handlers` (agent-orchestration). The "extraTools wiring" case decomposed
 * out of harness-registry's `return-status-tool.test.ts` lands here — same
 * mechanism (an opaque `RegisteredTool` merges into the built registry via
 * `extraTools`), proven with a locally-built fixture tool instead of the
 * real `returnStatusTool` (which stays agent-execution's own, and rides the
 * execution adapters bundle at runtime — `layers/agent-execution/src/
 * boot.ts` — rather than being imported here, which would recreate the
 * cross-layer import this relocation exists to remove).
 */

import { EventBus } from "@hyperidle/event-bus";
import type { RegisteredTool, ToolContext } from "@hyperidle/harness-protocol";
import { ok } from "@hyperidle/harness-protocol";
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
			role: "builder",
			extraTools: [makeFixtureExtraTool()],
		});

		expect(registry.definitions.some((d) => d.name === "fixture_extra_tool")).toBe(true);
	});

	it("role-filters the base definitions, independent of extraTools", () => {
		const builderOnly: RegisteredTool = {
			name: "builder_only_tool",
			description: "Visible to builders only.",
			inputSchema: z.object({}),
			handler: async () => ok({}),
			roles: ["builder"],
		};

		const forAssistant = buildToolRegistry([builderOnly], makeCtx(), { role: "assistant" });
		const forBuilder = buildToolRegistry([builderOnly], makeCtx(), { role: "builder" });

		expect(forAssistant.definitions.some((d) => d.name === "builder_only_tool")).toBe(false);
		expect(forBuilder.definitions.some((d) => d.name === "builder_only_tool")).toBe(true);
	});
});
