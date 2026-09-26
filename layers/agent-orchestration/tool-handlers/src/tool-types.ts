/**
 * Builder types for assembling tool registries — the authoring shapes and
 * helpers used by tool-handlers' own 22 tool bodies and tool-registry.ts.
 *
 * Moved from `@hyperidle/tool-protocol` (dissolved). These were shared with
 * `tool-provider`, but `tool-provider` itself was dissolved.
 * The only remaining consumers are within this package, making the framework
 * home pure tidiness — not value.
 */

import type {
	ClaudeToolSpec,
	RegisteredTool,
	ToolContext,
	ToolResult,
} from "@hyperidle/harness-protocol";
import z from "zod";

/** A skill tool's handler function — internal alias. */
type ToolHandler<Input = unknown, TDb = unknown> = (
	args: Input,
	ctx: ToolContext<TDb>,
) => Promise<ToolResult>;

/**
 * A single skill tool. Tools expose a Zod input schema (so we can derive a
 * Claude tool_use JSON Schema and validate at the boundary) plus a handler
 * that always returns a `ToolResult`.
 */
export interface ToolDefinition<Input = unknown, TDb = unknown> {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: z.ZodType<Input>;
	readonly handler: ToolHandler<Input, TDb>;
}

/**
 * Erase a `ToolDefinition<Input>` to a `RegisteredTool`. The schema still
 * validates `args` at call time.
 */
export function toRegistered<Input, TDb = unknown>(
	def: ToolDefinition<Input, TDb>,
): RegisteredTool<TDb> {
	return {
		name: def.name,
		description: def.description,
		inputSchema: def.inputSchema,
		handler: (args, ctx) => def.handler(args as Input, ctx),
	};
}

/**
 * Anthropic Messages API tool spec builder.
 */
export function toClaudeToolSpec<TDb = unknown>(def: RegisteredTool<TDb>): ClaudeToolSpec {
	// biome-ignore lint/suspicious/noExplicitAny: AnySchema → ZodType cast required because tool-seam.ts uses a structural interface to avoid locking harness-protocol to a zod version
	const json = z.toJSONSchema(def.inputSchema as z.ZodType<any>, { target: "draft-7" }) as {
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

/** Options bag for `buildToolRegistry`. Not exported — callers infer from the signature. */
export interface BuildToolRegistryOptions<TDb = unknown> {
	readonly extraTools?: readonly RegisteredTool<TDb>[];
}
