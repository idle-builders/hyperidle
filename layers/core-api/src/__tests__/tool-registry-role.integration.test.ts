/**
 * I2 — B1/B2/B3: `buildToolRegistry` accepts an agent role and filters
 * tools via `toolsForRole()`.
 *
 * Today the registry returns every tool to every caller. Builders can
 * therefore call facilitator-only tools (`promote_knowledge`,
 * `create_conflict_review`) directly through `invoke()`.
 * (`route_item` was a 4th facilitator-only tool here — AU21 §6 Decision L3
 * deleted it outright as vestigial, not merely re-narrowed.)
 * Defence in depth (the harness already filters tool names by role) is not
 * the same as authorization at the registry boundary.
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
import { THROWING_OPEN_TASK } from "@hyperidle/agent-orchestration/testing";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { buildToolRegistry } from "@hyperidle/tool-handlers";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const FACILITATOR_ONLY = ["promote_knowledge", "create_conflict_review"] as const;

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
	test("B1: builder registry excludes all three facilitator tools", ({ db, app }) => {
		// I2 contract: second-arg options object with `role`.
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_OPEN_TASK),
			makeContext(db),
			{ role: "builder" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of FACILITATOR_ONLY) {
			expect(names.has(t), `builder must not see ${t}`).toBe(false);
		}
	});

	test("B1: builder registry still contains the base tools", ({ db, app }) => {
		// @lore AU20 repair: read_inbox + write_session_notes deleted — removed from assertions.
		// the architecture doc §7/§8 B1: handoff_to and log_task are deleted —
		// projected from the action list instead, composed in only at
		// `buildToolRegistry`'s real call site, not this direct-definitions fixture.
		// @lore BC3 architecture.md §5 B4: send_message/reply/create_item/
		// submit_review are deleted from this catalog — send_message reappears
		// as an action, projected the same way edit_task is; the other three
		// have no successor tool.
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_OPEN_TASK),
			makeContext(db),
			{ role: "builder" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("write_memory")).toBe(true);
		expect(names.has("send_message")).toBe(false);
		expect(names.has("reply")).toBe(false);
		expect(names.has("create_item")).toBe(false);
		expect(names.has("submit_review")).toBe(false);
	});

	test("B2 + review W3: builder registry returns FORBIDDEN when invoking a facilitator tool that exists but is role-filtered", async ({
		db,
		app,
	}) => {
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_OPEN_TASK),
			makeContext(db),
			{ role: "builder" },
		);
		const result = await registry.invoke("promote_knowledge", {});
		expect(result.success).toBe(false);
		if (result.success) return;
		// I2 review W3: distinguishes "exists but wrong role" from "unknown
		// tool name" so debuggers chase the right cause.
		expect(result.code).toBe("FORBIDDEN");
	});

	test("review W3: invoking a genuinely unknown tool name still returns NOT_FOUND", async ({
		db,
		app,
	}) => {
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_OPEN_TASK),
			makeContext(db),
			{ role: "builder" },
		);
		const result = await registry.invoke("there_is_no_such_tool", {});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	// the architecture doc §7/§8 B1: handoff_to, create_task, edit_task (the
	// old tool body) and log_task are deleted — projected instead from the
	// action list, composed in only at `buildToolRegistry`'s real call site,
	// not this direct-definitions fixture. 20 → 14 (also minus the two
	// attention tools deleted with the attention engine).
	// @lore BC3 architecture.md §5 B4: send_message/reply/create_item/
	// submit_review deleted too — 14 → 10; send_message reappears as an
	// action, projected the same way edit_task is, not through this
	// direct-definitions fixture.
	test("B3: assistant registry includes all 10 tools", ({ db, app }) => {
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_OPEN_TASK),
			makeContext(db),
			{ role: "assistant" },
		);
		const names = registry.definitions.map((d) => d.name).sort();
		expect(names).toHaveLength(10);
		for (const t of FACILITATOR_ONLY) {
			expect(names).toContain(t);
		}
	});

	// @lore AD8c: role renamed from practice_facilitator to facilitator
	test("B3: facilitator registry includes the facilitator tools", ({ db, app }) => {
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_OPEN_TASK),
			makeContext(db),
			{ role: "facilitator" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of FACILITATOR_ONLY) {
			expect(names.has(t), `facilitator must see ${t}`).toBe(true);
		}
	});

	// AE3 — AC-5: management tool authorization (BB1: create_bet removed)
	const MANAGEMENT_TOOLS = [
		"create_team",
		"add_agent",
		"create_routine",
		"update_routine",
	] as const;

	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	test("AE3 AC-5: assistant registry includes all 4 management tools", ({ db, app }) => {
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_OPEN_TASK),
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
			buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_OPEN_TASK),
			makeContext(db),
			{ role: "builder" },
		);
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of MANAGEMENT_TOOLS) {
			expect(names.has(t), `builder must NOT see management tool ${t}`).toBe(false);
		}
	});

	test("AE3 AC-5: facilitator registry excludes all 4 management tools", ({ db, app }) => {
		const registry = buildToolRegistry(
			buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_OPEN_TASK),
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
			buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_OPEN_TASK),
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
