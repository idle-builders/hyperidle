/**
 * AD8b — Status-discriminated result type for assistant tools.
 *
 * Extracted to a separate file to avoid circular imports between
 * assistant-tools.ts (which imports tool modules) and tool modules
 * (which need to return AssistantToolResult).
 *
 * @lore AD8b: Assistant tools use { status: "ok" | "error" } rather than
 * the older { success: boolean } ToolResult. The toolsForAssistant() adapter
 * in assistant-tools.ts converts these to harness-compatible ToolResult.
 */

import type z from "zod";
import type { ToolContext } from "./tool-registry.js";

/** Status-discriminated result for assistant tool handlers. */
export type AssistantToolResult<T = unknown> =
	| { readonly status: "ok"; readonly value: T }
	| { readonly status: "error"; readonly message: string };

/** Shape of an assistant-specific tool definition. */
export interface AssistantToolShape<Input = unknown> {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: z.ZodType<Input>;
	readonly handler: (args: Input, ctx: ToolContext) => Promise<AssistantToolResult>;
}
