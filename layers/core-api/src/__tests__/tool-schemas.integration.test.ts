import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
	unconfiguredCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { buildToolRegistry, toClaudeToolSpec } from "@hyperidle/tool-handlers";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { actionsAsTools } from "../actions/actions-as-tools.js";
import { buildCoreActions } from "../actions/compose.js";

// @lore the six document tools (`write_memory`/`create_artifact`/
// `promote_knowledge`/`create_conflict_review`/`merge_knowledge`/
// `split_knowledge`) are DELETED — the hand-written catalog is now exactly
// the four AE3 management tools (chief_of_staff / assistant). The three
// REAL document tools (`search_documents`/`open_document`/`edit_document`)
// are not hand-written — they are the composed `document` action's own
// projection, covered separately below.
const EXPECTED_TOOL_NAMES = ["create_team", "add_agent", "create_routine", "update_routine"];
const DOCUMENT_TOOL_NAMES = ["search_documents", "open_document", "edit_document"];

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

	// @lore document-module B14: the three document tools aren't hand-written
	// `ToolDefinition`s — they're the composed `document` action's own
	// `actionsAsTools` projection, an agent reaches the same way it reaches
	// `search_tasks`/`send_message`. Covered here rather than folded into
	// `EXPECTED_TOOL_NAMES` above because they come from a different builder
	// (`buildCoreActions`, not `buildToolDefinitions`).
	test("each document tool has a valid Claude tool_use JSON schema", ({ agentOrchestration }) => {
		const actionTools = actionsAsTools(
			buildCoreActions({
				agentOrchestration,
				agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
				reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
			}),
		);
		const documentTools = actionTools.filter((t) => DOCUMENT_TOOL_NAMES.includes(t.name));
		expect(documentTools.map((t) => t.name).sort()).toEqual([...DOCUMENT_TOOL_NAMES].sort());

		for (const tool of documentTools) {
			const spec = toClaudeToolSpec(tool);
			expect(spec.name).toBe(tool.name);
			expect(typeof spec.description).toBe("string");
			expect(spec.description.length).toBeGreaterThan(10);
			expect(spec.input_schema).toBeDefined();
			expect(spec.input_schema.type).toBe("object");
			expect(typeof spec.input_schema.properties).toBe("object");
			expect(spec.input_schema.properties).not.toBeNull();
			expect(Array.isArray(spec.input_schema.properties)).toBe(false);
			expect(() => JSON.stringify(spec)).not.toThrow();
		}

		// @lore §3.6/A4: the sentence an agent reads has to teach it the three
		// `as` values by name — `edit_document` is the door a model must pick
		// "memory" vs "artifact" vs "document" through, so both words are
		// asserted as a red-first case, not just "description is long enough".
		const editDocument = documentTools.find((t) => t.name === "edit_document");
		expect(editDocument).toBeDefined();
		if (!editDocument) return;
		const editSpec = toClaudeToolSpec(editDocument);
		expect(editSpec.description).toContain("memory");
		expect(editSpec.description).toContain("artifact");
	});
});
