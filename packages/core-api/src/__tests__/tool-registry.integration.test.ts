import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus, ToolContext } from "@hyperidle/shared";
import { describe, expect } from "vitest";
import {
	createInProcessCoreApiTransport,
	registerCoreApiTransport,
} from "../services/core-api-port-composition.js";
import { buildToolRegistry } from "../services/tool-provider-bindings.js";
import { test as baseTest } from "../test-fixtures.js";

/**
 * @lore AU21 §9 Increment 2 (conversation wave): this file invokes
 * `read_inbox`, which now reaches `ports.coreApi.listInboxBySenderExclusion`
 * (the seam) — same file-scoped `auto:true` fixture idiom as
 * `create-item.integration.test.ts`.
 */
const test = baseTest.extend<{ coreApiSeamRegistration: undefined }>({
	coreApiSeamRegistration: [
		async ({ app }, use) => {
			registerCoreApiTransport(createInProcessCoreApiTransport(app));
			await use(undefined);
		},
		{ auto: true },
	],
});

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-x",
		sessionId: "session-x",
		taskId: "task-x",
		sandboxPath: path.join(os.tmpdir(), `hyperidle-d4-registry-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("buildToolRegistry", () => {
	test("returns the canonical set of skill tools", ({ db, eventBus }) => {
		const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" }); // @lore AD8a: role string renamed to "assistant" in AD8b
		const names = registry.definitions.map((d) => d.name).sort();
		expect(names).toEqual(
			[
				"create_item",
				"handoff_to",
				"log_task",
				"query_practice",
				"read_inbox",
				"send_message",
				"write_memory",
				"write_session_notes",
				// R5 agent work loop tools
				"create_task",
				"submit_review",
				// G1 facilitator tools (`route_item` deleted outright as vestigial —
				// AU21 §6 Decision L3, not merely re-narrowed)
				"score_attention",
				"promote_knowledge",
				"create_conflict_review",
				// R6 artifact tools
				"create_artifact",
				// AE3 management tools
				"create_team",
				"add_agent",
				"create_bet",
				"create_routine",
				"update_routine",
				// AK4: bet draft/edit tool for assistant conversational drafting
				"edit_bet",
				// AL7: commit_file — live-proof tool; reversibility:"irreversible"
				"commit_file",
			].sort(),
		);
		// 12 base tools + create_task (R5) + submit_review (R5) + create_artifact (R6) = 15
		// + 5 AE3 management tools: create_team, add_agent, create_bet, create_routine, update_routine = 20
		// + 1 AK4 draft tool: edit_bet = 21
		// + 1 AL7: commit_file = 22
		// - 1 AU21 §6 Decision L3: route_item deleted = 21
		expect(registry.definitions).toHaveLength(21);
	});

	test("each definition has a non-empty description and a Zod input schema", ({ db, eventBus }) => {
		const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
		for (const def of registry.definitions) {
			expect(typeof def.name).toBe("string");
			expect(def.name.length).toBeGreaterThan(0);
			expect(typeof def.description).toBe("string");
			expect(def.description.length).toBeGreaterThan(10);
			expect(def.inputSchema).toBeDefined();
			// Zod object must expose .parse
			expect(typeof (def.inputSchema as { parse?: unknown }).parse).toBe("function");
		}
	});

	describe("invoke()", () => {
		test("returns NOT_FOUND when tool name is unknown", async ({ db, eventBus }) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
			const result = await registry.invoke("does_not_exist", {});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.code).toBe("NOT_FOUND");
			}
		});

		test("routes to the matching handler by name", async ({ db, eventBus }) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
			// read_inbox with no inbox messages should return success: true with empty list
			const result = await registry.invoke("read_inbox", {});
			expect(result.success).toBe(true);
		});

		test("returns INVALID_INPUT when args fail Zod validation", async ({ db, eventBus }) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
			// limit must be a positive integer
			const result = await registry.invoke("read_inbox", { limit: "not-a-number" });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.code).toBe("INVALID_INPUT");
			}
		});
	});

	describe("toClaudeToolSpecs()", () => {
		test("returns one Claude tool spec per definition", ({ db, eventBus }) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
			const specs = registry.toClaudeToolSpecs();
			expect(specs).toHaveLength(registry.definitions.length);
			for (const spec of specs) {
				expect(typeof spec.name).toBe("string");
				expect(typeof spec.description).toBe("string");
				expect(spec.input_schema).toBeDefined();
				expect(spec.input_schema.type).toBe("object");
				expect(typeof spec.input_schema.properties).toBe("object");
			}
		});

		test("preserves tool names exactly", ({ db, eventBus }) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
			const specNames = registry
				.toClaudeToolSpecs()
				.map((s) => s.name)
				.sort();
			const defNames = registry.definitions.map((d) => d.name).sort();
			expect(specNames).toEqual(defNames);
		});
	});
});
