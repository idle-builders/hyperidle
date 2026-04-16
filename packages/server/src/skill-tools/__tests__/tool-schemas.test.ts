import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, createTestDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { type ToolContext, buildToolRegistry, toClaudeToolSpec } from "../tool-registry.js";

const EXPECTED_TOOL_NAMES = [
	"create_item",
	"handoff_to",
	"log_task",
	"query_practice",
	"read_inbox",
	"send_message",
	"write_memory",
	"write_session_notes",
];

function makeContext(db: HyperIdleDb): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-x",
		sessionId: "session-x",
		taskId: "task-x",
		workspacePath: path.join(os.tmpdir(), `hi-d4-schemas-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

describe("AC8: every tool has a valid Claude tool_use JSON schema", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it("registry produces 8 specs, one per expected tool name", () => {
		const specs = buildToolRegistry(makeContext(db)).toClaudeToolSpecs();
		const names = specs.map((s) => s.name).sort();
		expect(names).toEqual([...EXPECTED_TOOL_NAMES].sort());
	});

	it.each(EXPECTED_TOOL_NAMES)("%s spec has Claude-compatible input_schema shape", (toolName) => {
		const registry = buildToolRegistry(makeContext(db));
		const def = registry.definitions.find((d) => d.name === toolName);
		expect(def).toBeDefined();
		if (!def) return;

		const spec = toClaudeToolSpec(def);

		expect(spec.name).toBe(toolName);
		expect(typeof spec.description).toBe("string");
		expect(spec.description.length).toBeGreaterThan(10);

		expect(spec.input_schema).toBeDefined();
		expect(spec.input_schema.type).toBe("object");
		expect(typeof spec.input_schema.properties).toBe("object");
		expect(spec.input_schema.properties).not.toBeNull();
		// Anthropic Messages API requires properties to be an object (may be empty for no-arg tools).
		expect(Array.isArray(spec.input_schema.properties)).toBe(false);
	});

	it("each spec is JSON-serializable (no circular references)", () => {
		const specs = buildToolRegistry(makeContext(db)).toClaudeToolSpecs();
		for (const spec of specs) {
			expect(() => JSON.stringify(spec)).not.toThrow();
			const round = JSON.parse(JSON.stringify(spec)) as { name: string };
			expect(round.name).toBe(spec.name);
		}
	});
});
