/**
 * I2 — B1/B2/B3: `buildToolRegistry` accepts an agent role and filters
 * tools via `toolsForRole()`.
 *
 * Today the registry returns every tool to every caller. Defence in depth
 * (the harness already filters tool names by role) is not the same as
 * authorization at the registry boundary.
 *
 * @lore the six document tools (`write_memory`/`create_artifact`/
 * `promote_knowledge`/`create_conflict_review`/`merge_knowledge`/
 * `split_knowledge`) are DELETED — they were the only tools restricted to a
 * non-"assistant" role (`facilitator`, `product_manager`), so every case
 * that pinned a facilitator/product_manager-visible tool is gone with them.
 * What remains is four `roles: ["assistant"]` management tools; the role
 * filter itself (B1/B2/B3) is still proven below against those survivors.
 *
 * Red phase: the type signature `buildToolRegistry(ctx, { role })` is the
 * I2 contract — current code is `buildToolRegistry(ctx)` and the second-arg
 * call site will fail TypeScript. The assertions then prove the filter.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { buildToolRegistry } from "@hyperidle/tool-handlers";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

function makeContext(db: HyperIdleDb): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-x",
		sessionId: "session-x",
		taskId: "task-x",
		sandboxPath: path.join(os.tmpdir(), `hi-i2-role-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("I2 B1/B2/B3 — buildToolRegistry role filter", () => {
	test("review W3: invoking a genuinely unknown tool name still returns NOT_FOUND", async ({
		db,
		app,
	}) => {
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db),
			{ role: "builder" },
		);
		const result = await registry.invoke("there_is_no_such_tool", {});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	// AE3 — AC-5: management tool authorization (BB1: create_bet removed)
	const MANAGEMENT_TOOLS = [
		"create_team",
		"add_agent",
		"create_routine",
		"update_routine",
	] as const;

	// @lore the six document tools are gone — MANAGEMENT_TOOLS is now the
	// whole hand-written catalog, so this also proves the catalog carries no
	// extra tool beyond the four.
	test("assistant registry includes exactly the 4 management tools", ({ db, app }) => {
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db),
			{ role: "assistant" },
		);
		const names = registry.definitions.map((d) => d.name).sort();
		expect(names).toEqual([...MANAGEMENT_TOOLS].sort());
	});

	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	test("AE3 AC-5: assistant registry includes all 4 management tools", ({ db, app }) => {
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db),
			{ role: "assistant" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of MANAGEMENT_TOOLS) {
			expect(names.has(t), `assistant must see management tool ${t}`).toBe(true);
		}
	});

	test("AE3 AC-5: builder registry excludes all 4 management tools", ({ db, app }) => {
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db),
			{ role: "builder" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of MANAGEMENT_TOOLS) {
			expect(names.has(t), `builder must NOT see management tool ${t}`).toBe(false);
		}
	});

	// @lore AD8c: role renamed from practice_facilitator to facilitator
	test("AE3 AC-5: facilitator registry excludes all 4 management tools", ({ db, app }) => {
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db),
			{ role: "facilitator" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of MANAGEMENT_TOOLS) {
			expect(names.has(t), `practice_facilitator must NOT see management tool ${t}`).toBe(false);
		}
	});

	test("AE3 AC-5: builder invoke of create_team returns FORBIDDEN", async ({ db, app }) => {
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db),
			{ role: "builder" },
		);
		const result = await registry.invoke("create_team", {
			name: "Test",
			functions: ["development"],
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("FORBIDDEN");
	});
});
