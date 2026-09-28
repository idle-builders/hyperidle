/**
 * Tool seam types — the execution-boundary contract every tool invocation
 * crosses: orchestration builds a ToolRegistry, execution invokes it, review
 * records outcomes.
 */

import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

/**
 * Minimal schema interface — structurally compatible with Zod v3 and v4.
 */
export interface AnySchema {
	safeParse(
		args: unknown,
	):
		| { readonly success: true; readonly data: unknown }
		| { readonly success: false; readonly error: { readonly message: string } };
}

/**
 * Per-invocation context handed to every skill tool. `TDb` is opaque to
 * dispatch code — only handler bodies (which keep `@hyperidle/db`) ever
 * read `ctx.db`.
 */
export interface ToolContext<TDb = unknown> {
	readonly db: TDb;
	readonly eventBus: EventBus;
	readonly agentId: string;
	readonly sessionId: string;
	readonly taskId: string;
	readonly teamId?: string;
	/**
	 * The thread this session was started FOR, its calling thread.
	 * Baked at emit time (never read on the run path).
	 */
	readonly threadId?: string;
	readonly requestContext?: {
		readonly requestId: string;
		readonly sourceKind: AgentSessionSourceKind;
		readonly sourceId: string;
		readonly sourceCorrelation: AgentSessionSourceCorrelation;
	};
	readonly sandboxPath: string;
	readonly ingestion: { readonly dispose: () => void };
	readonly onAbortSession?: (sessionId: string) => void;
}

/** Discriminated union returned by every skill tool handler. */
export type ToolResult<T = unknown> =
	| { readonly success: true; readonly data: T }
	| { readonly success: false; readonly error: string; readonly code: string };

/** Wrap a successful payload. */
export function ok<T>(data: T): ToolResult<T> {
	return { success: true, data };
}

/** Wrap an expected failure with a machine-readable code and human-readable message. */
export function err(code: string, error: string): ToolResult<never> {
	return { success: false, error, code };
}

/**
 * A `ToolDefinition` after registry boundary-erasure of its `Input` type
 * parameter. The registry validates `args` against `inputSchema` before
 * invoking `handler`, so erasure to `unknown` is sound.
 */
export interface RegisteredTool<TDb = unknown> {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: AnySchema;
	readonly handler: (args: unknown, ctx: ToolContext<TDb>) => Promise<ToolResult>;
}

/** Anthropic Messages API tool spec — see https://docs.anthropic.com/en/api/messages. */
export interface ClaudeToolSpec {
	readonly name: string;
	readonly description: string;
	readonly input_schema: {
		readonly type: "object";
		readonly properties: Record<string, unknown>;
		readonly required?: readonly string[];
	};
}

export interface ToolRegistry<TDb = unknown> {
	readonly definitions: readonly RegisteredTool<TDb>[];
	readonly invoke: (name: string, rawArgs: unknown) => Promise<ToolResult>;
	readonly toClaudeToolSpecs: () => readonly ClaudeToolSpec[];
}
