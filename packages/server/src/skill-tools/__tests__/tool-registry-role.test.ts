/**
 * I2 — B1/B2/B3: `buildToolRegistry` accepts an agent role and filters
 * tools via `toolsForRole()`.
 *
 * Today the registry returns every tool to every caller. Builders can
 * therefore call facilitator-only tools (`promote_knowledge`, `route_item`,
 * `score_attention`, `create_conflict_review`) directly through `invoke()`.
 * Defence in depth (the harness already filters tool names by role) is not
 * the same as authorization at the registry boundary.
 *
 * Red phase: the type signature `buildToolRegistry(ctx, { role })` is the
 * I2 contract — current code is `buildToolRegistry(ctx)` and the second-arg
 * call site will fail TypeScript. The assertions then prove the filter.
 */

import * as os from "node:os";
import * as path from "node:path";
import { createTestDb, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { buildToolRegistry, type ToolContext } from "../tool-registry.js";

const FACILITATOR_ONLY = [
	"promote_knowledge",
	"route_item",
	"score_attention",
	"create_conflict_review",
] as const;

function makeContext(db: HyperIdleDb): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-x",
		sessionId: "session-x",
		taskId: "task-x",
		workspacePath: path.join(os.tmpdir(), `hi-i2-role-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

describe("I2 B1/B2/B3 — buildToolRegistry role filter", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it("B1: builder registry excludes all four facilitator tools", () => {
		// I2 contract: second-arg options object with `role`.
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of FACILITATOR_ONLY) {
			expect(names.has(t), `builder must not see ${t}`).toBe(false);
		}
	});

	it("B1: builder registry still contains the 8 base tools", () => {
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
		const names = new Set(registry.definitions.map((d) => d.name));
		expect(names.has("read_inbox")).toBe(true);
		expect(names.has("send_message")).toBe(true);
		expect(names.has("log_task")).toBe(true);
		expect(names.has("query_practice")).toBe(true);
		expect(names.has("write_memory")).toBe(true);
		expect(names.has("handoff_to")).toBe(true);
		expect(names.has("create_item")).toBe(true);
		expect(names.has("write_session_notes")).toBe(true);
	});

	it("B2 + review W3: builder registry returns FORBIDDEN when invoking a facilitator tool that exists but is role-filtered", async () => {
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
		const result = await registry.invoke("promote_knowledge", {});
		expect(result.success).toBe(false);
		if (result.success) return;
		// I2 review W3: distinguishes "exists but wrong role" from "unknown
		// tool name" so debuggers chase the right cause.
		expect(result.code).toBe("FORBIDDEN");
	});

	it("review W3: invoking a genuinely unknown tool name still returns NOT_FOUND", async () => {
		const registry = buildToolRegistry(makeContext(db), { role: "builder" });
		const result = await registry.invoke("there_is_no_such_tool", {});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	it("B3: chief_of_staff registry includes all 12 tools", () => {
		const registry = buildToolRegistry(makeContext(db), { role: "chief_of_staff" });
		const names = registry.definitions.map((d) => d.name).sort();
		expect(names).toHaveLength(12);
		for (const t of FACILITATOR_ONLY) {
			expect(names).toContain(t);
		}
	});

	it("B3: practice_facilitator registry includes the facilitator tools", () => {
		const registry = buildToolRegistry(makeContext(db), { role: "practice_facilitator" });
		const names = new Set(registry.definitions.map((d) => d.name));
		for (const t of FACILITATOR_ONLY) {
			expect(names.has(t), `practice_facilitator must see ${t}`).toBe(true);
		}
	});
});
