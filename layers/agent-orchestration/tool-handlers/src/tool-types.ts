// Builder types for tool registries — authoring shapes used by tool-handlers and tool-registry.ts.

import type {
	ClaudeToolSpec,
	RegisteredTool,
	ToolContext,
	ToolResult,
} from "@hyperidle/harness-protocol";
import z from "zod";

type ToolHandler<Input = unknown, TDb = unknown> = (
	args: Input,
	ctx: ToolContext<TDb>,
) => Promise<ToolResult>;

// A single skill tool: Zod input schema + handler.
export interface ToolDefinition<Input = unknown, TDb = unknown> {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: z.ZodType<Input>;
	readonly handler: ToolHandler<Input, TDb>;
}

// Erase a ToolDefinition<Input> to a RegisteredTool; schema still validates args at call time.
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

export interface BuildToolRegistryOptions<TDb = unknown> {
	readonly extraTools?: readonly RegisteredTool<TDb>[];
}
