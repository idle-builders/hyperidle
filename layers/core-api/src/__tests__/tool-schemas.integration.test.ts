import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
	unconfiguredCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { buildToolRegistry } from "@hyperidle/tool-handlers";
import { type ToolContext, toClaudeToolSpec } from "@hyperidle/tool-protocol";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const EXPECTED_TOOL_NAMES = [
	"create_item",
	"handoff_to",
	"log_task",
	"query_practice",
	"read_inbox",
	"send_message",
	// AU27 Increment 2: the generic reply tool.
	"reply",
	"write_memory",
	"write_session_notes",
	// R5 agent work loop tools
	"create_task",
	"submit_review",
	// G1 facilitator tools
	"score_attention",
	"promote_knowledge",
	"create_conflict_review",
	// R6 artifact tools
	"create_artifact",
	// AE3 management tools (chief_of_staff / assistant)
	"create_team",
	"add_agent",
	"create_bet",
	"create_routine",
	"update_routine",
	// AK4: bet draft/edit tool for assistant conversational drafting
	"edit_bet",
	// AL7: commit_file — live-proof tool; declared reversibility:"irreversible" for the checkpoint
	"commit_file",
];

function makeContext(db: HyperIdleDb): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-x",
		sessionId: "session-x",
		taskId: "task-x",
		sandboxPath: path.join(os.tmpdir(), `hi-d4-schemas-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("AC8: every tool has a valid Claude tool_use JSON schema", () => {
	test("registry produces one spec per expected tool name", ({ db, app }) => {
		const definitions = buildToolDefinitions(createInProcessCoreApiTransport(app));
		const specs = buildToolRegistry(definitions, makeContext(db), {
			role: "assistant",
		}).toClaudeToolSpecs();
		const names = specs.map((s) => s.name).sort();
		expect(names).toEqual([...EXPECTED_TOOL_NAMES].sort());
	});

	test.each(EXPECTED_TOOL_NAMES)("%s spec has Claude-compatible input_schema shape", (toolName) => {
		// Note: this test variant uses test.each and doesn't receive { db } args.
		// We use a placeholder db from a minimal context since no DB queries are needed.
		// The fixture db is not accessible in test.each without a wrapper, but a plain
		// EventBus + null db works because toClaudeToolSpec is pure schema introspection.
		// @lore tool-schemas: test.each doesn't compose with fixture injection in vitest;
		// buildToolRegistry here only inspects Zod schemas (no DB calls), so a dummy
		// context object satisfies the type without a real connection.
		// @lore AU31 §3.2/§5: no `app` fixture reachable from `test.each`, and
		// this whole describe block never actually calls a tool handler (schema
		// introspection only) — the unconfigured transport (throws only if
		// actually dialled) is honest here.
		const registry = buildToolRegistry(
			buildToolDefinitions(unconfiguredCoreApiTransport()),
			{
				db: null as unknown as HyperIdleDb,
				eventBus: new EventBus(),
				agentId: "agent-x",
				sessionId: "session-x",
				taskId: "task-x",
				sandboxPath: path.join(os.tmpdir(), "hi-d4-schemas-each"),
				ingestion: { dispose: (): void => {} },
			},
			{ role: "assistant" },
		);
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

	test("each spec is JSON-serializable (no circular references)", ({ db, app }) => {
		const definitions = buildToolDefinitions(createInProcessCoreApiTransport(app));
		const specs = buildToolRegistry(definitions, makeContext(db), {
			role: "assistant",
		}).toClaudeToolSpecs();
		for (const spec of specs) {
			expect(() => JSON.stringify(spec)).not.toThrow();
			const round = JSON.parse(JSON.stringify(spec)) as { name: string };
			expect(round.name).toBe(spec.name);
		}
	});
});
