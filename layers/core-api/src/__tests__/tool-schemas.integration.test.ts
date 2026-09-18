import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
	unconfiguredCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { THROWING_OPEN_TASK } from "@hyperidle/agent-orchestration/testing";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { buildToolRegistry, toClaudeToolSpec } from "@hyperidle/tool-handlers";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

// @lore AU20 repair: read_inbox, write_session_notes, commit_file deleted by the destroyer pass.
// the architecture doc §7/§8 B1: handoff_to, create_task, edit_task (the old
// tool body) and log_task are deleted from `buildToolDefinitions` — they are
// projected instead from the action list (`search_tasks`/`open_task`/
// `edit_task`), composed in only at `buildToolRegistry`'s real call site,
// not this direct-definitions fixture.
// @lore BC3 architecture.md §5 B4: create_item/send_message/reply/
// submit_review deleted too — send_message reappears as an action, projected
// the same way edit_task is; the other three have no successor tool.
const EXPECTED_TOOL_NAMES = [
	"write_memory",
	// G1 facilitator tools (score_attention deleted)
	"promote_knowledge",
	"create_conflict_review",
	// R6 artifact tools
	"create_artifact",
	// AE3 management tools (chief_of_staff / assistant)
	"create_team",
	"add_agent",
	"create_routine",
	"update_routine",
	// BA9d wave 2: knowledge merge and split tools
	"merge_knowledge",
	"split_knowledge",
	// run_knowledge_sweep deleted
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
		const definitions = buildToolDefinitions(
			createInProcessCoreApiTransport(app),
			THROWING_OPEN_TASK,
		);
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
			buildToolDefinitions(unconfiguredCoreApiTransport(), THROWING_OPEN_TASK),
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
		const definitions = buildToolDefinitions(
			createInProcessCoreApiTransport(app),
			THROWING_OPEN_TASK,
		);
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
