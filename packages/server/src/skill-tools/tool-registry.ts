import type { HyperIdleDb } from "@hyperidle/db";
import type { FileWatcher } from "@hyperidle/fabric";
import type { EventBus, UserRole } from "@hyperidle/shared";
import z from "zod";
import { createConflictReviewTool } from "./create-conflict-review.js";
import { createItemTool } from "./create-item.js";
import { createTaskTool } from "./create-task.js";
import { handoffToTool } from "./handoff-to.js";
import { logTaskTool } from "./log-task.js";
import { promoteKnowledgeTool } from "./promote-knowledge.js";
import { queryPracticeTool } from "./query-practice.js";
import { readInboxTool } from "./read-inbox.js";
import { routeItemTool } from "./route-item.js";
import { scoreAttentionTool } from "./score-attention.js";
import { sendMessageTool } from "./send-message.js";
import { submitReviewTool } from "./submit-review.js";
import { err, type ToolResult } from "./tool-result.js";
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
 *
 * `roles` narrows which agent roles may see this tool in their provisioned
 * session. `undefined` means "available to every role" (the common case).
 */
export interface ToolDefinition<Input = unknown> {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: z.ZodType<Input>;
	readonly handler: (args: Input, ctx: ToolContext) => Promise<ToolResult>;
	readonly roles?: readonly UserRole[];
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
	// biome-ignore lint/style/useNamingConvention: Claude API wire format uses snake_case
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

/**
 * The canonical list of every skill tool. Exported so callers can filter by
 * role without needing a `ctx` (e.g. the session-provisioning phase that has
 * to decide which tool names to hand the harness BEFORE the session is live).
 *
 * @lore Four facilitator-only tools (`route_item`, `score_attention`,
 * `promote_knowledge`, `create_conflict_review`) narrow to the facilitator
 * roles — passing them to builders would break G1 AC6's authorization intent
 * and let a builder mutate knowledge lifecycle state.
 */
export const ALL_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
	readInboxTool,
	sendMessageTool,
	logTaskTool,
	queryPracticeTool,
	writeMemoryTool,
	handoffToTool,
	createItemTool,
	writeSessionNotesTool,
	// R5: new agent work loop tools — available to all roles.
	createTaskTool,
	submitReviewTool,
	// G1 facilitator tools — restricted to facilitator roles.
	routeItemTool,
	scoreAttentionTool,
	promoteKnowledgeTool,
	createConflictReviewTool,
];

/**
 * Return the subset of tool definitions accessible to a given agent role.
 * A tool with `roles === undefined` is available to all roles; otherwise the
 * role must appear in the tool's `roles` array.
 */
export function toolsForRole(role: UserRole): readonly ToolDefinition[] {
	return ALL_TOOL_DEFINITIONS.filter((d) => d.roles === undefined || d.roles.includes(role));
}

/**
 * Options accepted by `buildToolRegistry`. `role` is REQUIRED so every call
 * site has to make an explicit authorization decision — silent fallback to
 * "all tools" was the I2 B1/B2 vulnerability.
 *
 * @lore I2 B1/B2: previously `buildToolRegistry(ctx)` returned every tool
 * to every caller. Defence-in-depth: the registry now filters by role at
 * the constructor boundary, mirroring the harness allowed-tool list.
 */
export interface BuildToolRegistryOptions {
	readonly role: UserRole;
}

/**
 * Build a fresh registry bound to the given context, filtered to the agent's role.
 *
 * @lore I2 review W3: when the requested tool exists in the global tool
 * catalogue but is filtered out for this role, `invoke()` returns
 * `FORBIDDEN` (not `NOT_FOUND`). NOT_FOUND is reserved for genuinely
 * unknown tool names so an operator debugging "missing tool" failures
 * can distinguish a typo (NOT_FOUND) from a role-boundary breach
 * (FORBIDDEN). The harness still applies its own per-session allowlist
 * (`session-provisioning.ts:303`); this is the inner gate.
 */
export function buildToolRegistry(
	ctx: ToolContext,
	options: BuildToolRegistryOptions,
): ToolRegistry {
	const definitions = toolsForRole(options.role);

	const byName = new Map(definitions.map((d) => [d.name, d]));
	const allByName = new Map(ALL_TOOL_DEFINITIONS.map((d) => [d.name, d]));

	// biome-ignore lint/suspicious/useAwait: ToolRegistry.invoke returns Promise for interface consistency
	async function invoke(name: string, rawArgs: unknown): Promise<ToolResult> {
		const def = byName.get(name);
		if (!def) {
			if (allByName.has(name)) {
				return err("FORBIDDEN", `Tool not available to this role: ${name}`);
			}
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
