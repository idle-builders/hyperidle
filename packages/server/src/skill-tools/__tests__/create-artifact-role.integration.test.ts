/**
 * R6 AC5: create_artifact tool is available to all agent roles.
 *
 * The architecture plan §3 states that create_artifact has no `roles`
 * restriction — all agent roles (builder, practice_facilitator, growth,
 * chief_of_staff, etc.) can produce artifacts.
 *
 * These tests WILL fail until:
 *   - create-artifact.ts is implemented (Task 3)
 *   - createArtifactTool is added to ALL_TOOL_DEFINITIONS in tool-registry.ts (Task 3)
 */

import * as os from "node:os";
import * as path from "node:path";
import { createTestDb, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { buildToolRegistry, type ToolContext } from "../tool-registry.js";

function makeContext(db: HyperIdleDb): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-r6-role-test",
		sessionId: "session-r6-role",
		taskId: "task-r6-role",
		workspacePath: path.join(os.tmpdir(), `hi-r6-role-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

describe("R6 AC5: create_artifact availability across agent roles", () => {
	let db: HyperIdleDb;

	beforeEach(async () => {
		const handle = await createTestDb();
		db = handle.db;
	});

	it("create_artifact is available to builder role", () => {
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("create_artifact")).toBe(true);
	});

	it("create_artifact is available to practice_facilitator role", () => {
		const registry = buildToolRegistry(makeContext(db), { role: "practice_facilitator" });
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("create_artifact")).toBe(true);
	});

	it("create_artifact is available to chief_of_staff role", () => {
		const registry = buildToolRegistry(makeContext(db), { role: "chief_of_staff" });
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("create_artifact")).toBe(true);
	});

	it("create_artifact is available to growth role", () => {
		const registry = buildToolRegistry(makeContext(db), { role: "growth" });
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("create_artifact")).toBe(true);
	});

	it("create_artifact Claude tool spec has correct name and input_schema type", () => {
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
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

	it("invoking create_artifact with role=builder returns FORBIDDEN if filtered, or succeeds if registered", async () => {
		// This test proves the tool is NOT filtered out for builders.
		// A FORBIDDEN result would mean it's in ALL_TOOL_DEFINITIONS with role restriction.
		// We just verify the registry can find it (no FORBIDDEN or NOT_FOUND).
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
		// Invoke with an invalid input to get INVALID_INPUT (proves the tool was found, not NOT_FOUND/FORBIDDEN).
		// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid to test routing
		const result = await registry.invoke("create_artifact", {} as any);
		expect(result.success).toBe(false);
		if (result.success) return;
		// Must be INVALID_INPUT (tool found + input rejected), NOT FORBIDDEN or NOT_FOUND.
		expect(result.code).toBe("INVALID_INPUT");
	});
});
