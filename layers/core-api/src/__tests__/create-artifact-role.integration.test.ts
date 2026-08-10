/**
 * R6 AC5: create_artifact tool is available to all agent roles.
 *
 * The architecture plan §3 states that create_artifact has no `roles`
 * restriction — all agent roles (builder, facilitator, growth,
 * @lore AD8a: role string stays until AD8b. chief_of_staff, etc.) can produce artifacts.
 *
 * These tests WILL fail until:
 *   - create-artifact.ts is implemented (Task 3)
 *   - createArtifactTool is added to ALL_TOOL_DEFINITIONS in tool-registry.ts (Task 3)
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { buildToolRegistry as buildToolRegistryFromDefinitions } from "@hyperidle/tool-handlers";
import type { ToolContext } from "@hyperidle/tool-protocol";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

function makeContext(db: HyperIdleDb): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-r6-role-test",
		sessionId: "session-r6-role",
		taskId: "task-r6-role",
		sandboxPath: path.join(os.tmpdir(), `hi-r6-role-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("R6 AC5: create_artifact availability across agent roles", () => {
	test("create_artifact is available to builder role", async ({ db, app }) => {
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db),
			{ role: "builder" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("create_artifact")).toBe(true);
	});

	// @lore AD8c: role renamed from practice_facilitator to facilitator
	test("create_artifact is available to facilitator role", async ({ db, app }) => {
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db),
			{ role: "facilitator" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("create_artifact")).toBe(true);
	});

	test("create_artifact is available to assistant role", async ({ db, app }) => {
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db),
			{ role: "assistant" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("create_artifact")).toBe(true);
	});

	test("create_artifact is available to growth role", async ({ db, app }) => {
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db),
			{ role: "growth" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("create_artifact")).toBe(true);
	});

	test("create_artifact Claude tool spec has correct name and input_schema type", async ({
		db,
		app,
	}) => {
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db),
			{ role: "builder" },
		);
		const specs = registry.toClaudeToolSpecs();
		const spec = specs.find((s) => s.name === "create_artifact");
		expect(spec).toBeDefined();
		expect(spec?.input_schema.type).toBe("object");
		// The schema must require 'kind' and have 'preview' as a property.
		expect(spec?.input_schema.properties).toHaveProperty("kind");
		expect(spec?.input_schema.properties).toHaveProperty("preview");
		// 'producingTaskId' must NOT be in the input schema (read from ctx instead).
		expect(spec?.input_schema.properties).not.toHaveProperty("producingTaskId");
	});

	test("invoking create_artifact with role=builder returns FORBIDDEN if filtered, or succeeds if registered", async ({
		db,
		app,
	}) => {
		// This test proves the tool is NOT filtered out for builders.
		// A FORBIDDEN result would mean it's in ALL_TOOL_DEFINITIONS with role restriction.
		// We just verify the registry can find it (no FORBIDDEN or NOT_FOUND).
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db),
			{ role: "builder" },
		);
		// Invoke with an invalid input to get INVALID_INPUT (proves the tool was found, not NOT_FOUND/FORBIDDEN).
		// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid to test routing
		const result = await registry.invoke("create_artifact", {} as any);
		expect(result.success).toBe(false);
		if (result.success) return;
		// Must be INVALID_INPUT (tool found + input rejected), NOT FORBIDDEN or NOT_FOUND.
		expect(result.code).toBe("INVALID_INPUT");
	});
});
