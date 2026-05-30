import * as os from "node:os";
import * as path from "node:path";
import { createTestDb, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { buildToolRegistry, type ToolContext } from "../tool-registry.js";

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext {
	return {
		db,
		eventBus,
		agentId: "agent-x",
		sessionId: "session-x",
		taskId: "task-x",
		workspacePath: path.join(os.tmpdir(), `hyperidle-d4-registry-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

describe("buildToolRegistry", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		const handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
	});

	it("returns the canonical set of skill tools", () => {
		const registry = buildToolRegistry(makeContext(db, eventBus), { role: "chief_of_staff" });
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
				// G1 facilitator tools
				"route_item",
				"score_attention",
				"promote_knowledge",
				"create_conflict_review",
				// R6 artifact tools
				"create_artifact",
			].sort(),
		);
		// 12 base tools + create_task (R5) + submit_review (R5) + create_artifact (R6) = 15
		expect(registry.definitions).toHaveLength(15);
	});

	it("each definition has a non-empty description and a Zod input schema", () => {
		const registry = buildToolRegistry(makeContext(db, eventBus), { role: "chief_of_staff" });
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
		it("returns NOT_FOUND when tool name is unknown", async () => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "chief_of_staff" });
			const result = await registry.invoke("does_not_exist", {});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.code).toBe("NOT_FOUND");
			}
		});

		it("routes to the matching handler by name", async () => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "chief_of_staff" });
			// read_inbox with no inbox messages should return success: true with empty list
			const result = await registry.invoke("read_inbox", {});
			expect(result.success).toBe(true);
		});

		it("returns INVALID_INPUT when args fail Zod validation", async () => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "chief_of_staff" });
			// limit must be a positive integer
			const result = await registry.invoke("read_inbox", { limit: "not-a-number" });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.code).toBe("INVALID_INPUT");
			}
		});
	});

	describe("toClaudeToolSpecs()", () => {
		it("returns one Claude tool spec per definition", () => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "chief_of_staff" });
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

		it("preserves tool names exactly", () => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "chief_of_staff" });
			const specNames = registry
				.toClaudeToolSpecs()
				.map((s) => s.name)
				.sort();
			const defNames = registry.definitions.map((d) => d.name).sort();
			expect(specNames).toEqual(defNames);
		});
	});
});
