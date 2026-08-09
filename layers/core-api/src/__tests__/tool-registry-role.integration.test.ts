/**
 * I2 — B1/B2/B3: `buildToolRegistry` accepts an agent role and filters
 * tools via `toolsForRole()`.
 *
 * Today the registry returns every tool to every caller. Builders can
 * therefore call facilitator-only tools (`promote_knowledge`,
 * `score_attention`, `create_conflict_review`) directly through `invoke()`.
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
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/tool-protocol";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { buildToolRegistry } from "../services/tool-provider-bindings.js";

const FACILITATOR_ONLY = [
	"promote_knowledge",
	"score_attention",
	"create_conflict_review",
] as const;

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
	test("B1: builder registry excludes all three facilitator tools", ({ db }) => {
		// I2 contract: second-arg options object with `role`.
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of FACILITATOR_ONLY) {
			expect(names.has(t), `builder must not see ${t}`).toBe(false);
		}
	});

	test("B1: builder registry still contains the 8 base tools", ({ db }) => {
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("read_inbox")).toBe(true);
		expect(names.has("send_message")).toBe(true);
		expect(names.has("reply")).toBe(true);
		expect(names.has("log_task")).toBe(true);
		expect(names.has("query_practice")).toBe(true);
		expect(names.has("write_memory")).toBe(true);
		expect(names.has("handoff_to")).toBe(true);
		expect(names.has("create_item")).toBe(true);
		expect(names.has("write_session_notes")).toBe(true);
	});

	test("B2 + review W3: builder registry returns FORBIDDEN when invoking a facilitator tool that exists but is role-filtered", async ({
		db,
	}) => {
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
		const result = await registry.invoke("promote_knowledge", {});
		expect(result.success).toBe(false);
		if (result.success) return;
		// I2 review W3: distinguishes "exists but wrong role" from "unknown
		// tool name" so debuggers chase the right cause.
		expect(result.code).toBe("FORBIDDEN");
	});

	test("review W3: invoking a genuinely unknown tool name still returns NOT_FOUND", async ({
		db,
	}) => {
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
		const result = await registry.invoke("there_is_no_such_tool", {});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	test("B3: assistant registry includes all 22 tools (15 + 5 AE3 management tools + 1 AK4 draft tool + 1 AL7 stage_operation + the generic reply tool)", ({
		db,
	}) => {
		const registry = buildToolRegistry(makeContext(db), { role: "assistant" });
		const names = registry.definitions.map((d) => d.name).sort();
		// 12 base + create_task (R5) + submit_review (R5) + create_artifact (R6) = 15
		// + 5 AE3 management tools: create_team, add_agent, create_bet, create_routine, update_routine = 20
		// + 1 AK4 draft tool: edit_bet = 21
		// + 1 AL7: stage_operation = 22
		// - 1 AU21 §6 Decision L3: route_item deleted = 21
		// + 1 AU27 Increment 2: reply = 22
		expect(names).toHaveLength(22);
		for (const t of FACILITATOR_ONLY) {
			expect(names).toContain(t);
		}
	});

	// @lore AD8c: role renamed from practice_facilitator to facilitator
	test("B3: facilitator registry includes the facilitator tools", ({ db }) => {
		const registry = buildToolRegistry(makeContext(db), { role: "facilitator" });
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of FACILITATOR_ONLY) {
			expect(names.has(t), `facilitator must see ${t}`).toBe(true);
		}
	});

	// AE3 — AC-5: management tool authorization
	const MANAGEMENT_TOOLS = [
		"create_team",
		"add_agent",
		"create_bet",
		"create_routine",
		"update_routine",
	] as const;

	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	test("AE3 AC-5: assistant registry includes all 5 management tools", ({ db }) => {
		const registry = buildToolRegistry(makeContext(db), { role: "assistant" });
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of MANAGEMENT_TOOLS) {
			expect(names.has(t), `assistant must see management tool ${t}`).toBe(true);
		}
	});

	test("AE3 AC-5: builder registry excludes all 5 management tools", ({ db }) => {
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of MANAGEMENT_TOOLS) {
			expect(names.has(t), `builder must NOT see management tool ${t}`).toBe(false);
		}
	});

	test("AE3 AC-5: facilitator registry excludes all 5 management tools", ({ db }) => {
		const registry = buildToolRegistry(makeContext(db), { role: "facilitator" });
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of MANAGEMENT_TOOLS) {
			expect(names.has(t), `practice_facilitator must NOT see management tool ${t}`).toBe(false);
		}
	});

	test("AE3 AC-5: builder invoke of create_team returns FORBIDDEN", async ({ db }) => {
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
		const result = await registry.invoke("create_team", {
			name: "Test",
			functions: ["development"],
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("FORBIDDEN");
	});
});
