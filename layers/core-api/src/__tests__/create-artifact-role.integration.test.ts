/**
 * `create_artifact` is available to every agent role, and its input schema asks
 * for content and nothing else.
 *
 * The tool has no `roles` restriction — builder, facilitator, assistant and
 * growth all get it — and the parent it attaches to is read from the calling
 * context, never accepted as input. A role filter or a parent that a caller can
 * name are both silent regressions: the tool simply stops appearing, or starts
 * letting an agent attach its output to someone else's task.
 *
 * @lore artifacts-become-knowledge: this file was deleted with the artifacts
 * table and restored on review — nothing in it depended on that table. What did
 * change is the schema assertion below, which named the old `kind`/`preview`
 * fields; an artifact is written as a title and a markdown body now.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import {
	THROWING_OPEN_TASK,
	THROWING_REVIEW_ACCESSOR,
} from "@hyperidle/agent-orchestration/testing";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { buildToolRegistry as buildToolRegistryFromDefinitions } from "@hyperidle/tool-handlers";
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

describe("create_artifact availability across agent roles", () => {
	test("create_artifact is available to builder role", async ({ db, app }) => {
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(
				createInProcessCoreApiTransport(app),
				THROWING_REVIEW_ACCESSOR,
				THROWING_OPEN_TASK,
			),
			makeContext(db),
			{ role: "builder" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("create_artifact")).toBe(true);
	});

	// @lore AD8c: role renamed from practice_facilitator to facilitator
	test("create_artifact is available to facilitator role", async ({ db, app }) => {
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(
				createInProcessCoreApiTransport(app),
				THROWING_REVIEW_ACCESSOR,
				THROWING_OPEN_TASK,
			),
			makeContext(db),
			{ role: "facilitator" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("create_artifact")).toBe(true);
	});

	test("create_artifact is available to assistant role", async ({ db, app }) => {
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(
				createInProcessCoreApiTransport(app),
				THROWING_REVIEW_ACCESSOR,
				THROWING_OPEN_TASK,
			),
			makeContext(db),
			{ role: "assistant" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("create_artifact")).toBe(true);
	});

	test("create_artifact is available to growth role", async ({ db, app }) => {
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(
				createInProcessCoreApiTransport(app),
				THROWING_REVIEW_ACCESSOR,
				THROWING_OPEN_TASK,
			),
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
			buildToolDefinitions(
				createInProcessCoreApiTransport(app),
				THROWING_REVIEW_ACCESSOR,
				THROWING_OPEN_TASK,
			),
			makeContext(db),
			{ role: "builder" },
		);
		const specs = registry.toClaudeToolSpecs();
		const spec = specs.find((s) => s.name === "create_artifact");
		expect(spec).toBeDefined();
		expect(spec?.input_schema.type).toBe("object");
		// An artifact is a title and a markdown body.
		expect(spec?.input_schema.properties).toHaveProperty("title");
		expect(spec?.input_schema.properties).toHaveProperty("body");
		// The parent is read from the calling context, never named by the agent —
		// otherwise an agent can attach its output to a task that is not its own.
		expect(spec?.input_schema.properties).not.toHaveProperty("parentKind");
		expect(spec?.input_schema.properties).not.toHaveProperty("parentId");
	});

	test("invoking create_artifact with role=builder returns FORBIDDEN if filtered, or succeeds if registered", async ({
		db,
		app,
	}) => {
		// This test proves the tool is NOT filtered out for builders.
		// A FORBIDDEN result would mean it's in ALL_TOOL_DEFINITIONS with role restriction.
		// We just verify the registry can find it (no FORBIDDEN or NOT_FOUND).
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(
				createInProcessCoreApiTransport(app),
				THROWING_REVIEW_ACCESSOR,
				THROWING_OPEN_TASK,
			),
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
