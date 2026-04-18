import type { HyperIdleDb } from "@hyperidle/db";
import type { FileWatcher } from "@hyperidle/fabric";
import type { EventBus } from "@hyperidle/shared";
import { z } from "zod";
import { createItemTool } from "./create-item.js";
import { handoffToTool } from "./handoff-to.js";
import { logTaskTool } from "./log-task.js";
import { queryPracticeTool } from "./query-practice.js";
import { readInboxTool } from "./read-inbox.js";
import { sendMessageTool } from "./send-message.js";
import { type ToolResult, err } from "./tool-result.js";
import { writeMemoryTool } from "./write-memory.js";
import { writeSessionNotesTool } from "./write-session-notes.js";

/**
 * Per-invocation context handed to every skill tool. The harness owns the
 * database and event bus and identifies the caller (agent, session, task).
 *
 * Tools that need workspace IO (e.g. `write_session_notes`) read `workspacePath`
 * — the same materialized workspace the file watcher is observing.
 */
export interface ToolContext {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly agentId: string;
	readonly sessionId: string;
	readonly taskId: string;
	readonly workspacePath: string;
	readonly watcher: FileWatcher;
}

/**
 * A single skill tool. Tools expose a Zod input schema (so we can derive a
 * Claude tool_use JSON Schema and validate at the boundary) plus a handler
 * that always returns a `ToolResult`.
 */
export interface ToolDefinition<Input = unknown> {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: z.ZodType<Input>;
	readonly handler: (args: Input, ctx: ToolContext) => Promise<ToolResult>;
}

/**
 * Anthropic Messages API tool spec. The shape required by the SDK's `tools`
 * field — `input_schema.type` must be `"object"`.
 *
 * Source: https://docs.anthropic.com/en/api/messages — `tool_use` block.
 */
export interface ClaudeToolSpec {
	readonly name: string;
	readonly description: string;
	readonly input_schema: {
		readonly type: "object";
		readonly properties: Record<string, unknown>;
		readonly required?: readonly string[];
	};
}

/**
 * Convert a tool definition's Zod input schema to a Claude-compatible tool
 * spec. The Anthropic API requires `type: "object"` at the top level — every
 * skill tool's input is a `z.object(...)` so this invariant holds by design.
 */
export function toClaudeToolSpec(def: ToolDefinition): ClaudeToolSpec {
	const json = z.toJSONSchema(def.inputSchema, { target: "draft-7" }) as {
		properties?: Record<string, unknown>;
		required?: readonly string[];
	};

	return {
		name: def.name,
		description: def.description,
		input_schema: {
			type: "object",
			properties: json.properties ?? {},
			...(json.required ? { required: json.required } : {}),
		},
	};
}

export interface ToolRegistry {
	readonly definitions: readonly ToolDefinition[];
	readonly invoke: (name: string, rawArgs: unknown) => Promise<ToolResult>;
	readonly toClaudeToolSpecs: () => readonly ClaudeToolSpec[];
}

/** Build a fresh registry bound to the given context. */
export function buildToolRegistry(ctx: ToolContext): ToolRegistry {
	const definitions: readonly ToolDefinition[] = [
		readInboxTool,
		sendMessageTool,
		logTaskTool,
		queryPracticeTool,
		writeMemoryTool,
		handoffToTool,
		createItemTool,
		writeSessionNotesTool,
	];

	const byName = new Map(definitions.map((d) => [d.name, d]));

	async function invoke(name: string, rawArgs: unknown): Promise<ToolResult> {
		const def = byName.get(name);
		if (!def) {
			return err("NOT_FOUND", `Unknown tool: ${name}`);
		}
		const parsed = def.inputSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return err("INVALID_INPUT", parsed.error.message);
		}
		return def.handler(parsed.data, ctx);
	}

	return {
		definitions,
		invoke,
		toClaudeToolSpecs: () => definitions.map((d) => toClaudeToolSpec(d)),
	};
}
