/**
 * Tool seam types — the execution-boundary contract every tool invocation
 * crosses: orchestration builds a ToolRegistry, execution invokes it, review
 * records outcomes.
 *
 * Moved from `@hyperidle/tool-protocol` (dissolved) into the shared seam
 * package whose audience is identical: core-api, orchestration, execution,
 * and both applications. Zero UI consumers — `harness-capability` remains the
 * separate UI-facing vocabulary.
 *
 * @lore AU44 batch 5: tool-protocol dies because its founding rationale
 * (`tool-provider` needing a shared home with `tool-handlers`) evaporated when
 * `tool-provider` was dissolved in AU31. The residue is five types and two
 * three-line constructors — exactly what lives in a seam package alongside
 * the adapter contract it feeds into.
 */

import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

/**
 * Minimal schema interface — structurally compatible with Zod v3 and v4.
 * Keeps `tool-seam.ts` free of any zod version dependency so the seam can
 * sit in a framework package that predates the layer-level zod upgrade.
 *
 * @lore AU44 b5: the root workspace has Zod v3 while agent-orchestration and
 * agent-execution carry nested Zod v4. Importing `z.ZodType` here would fix
 * the type to whichever version npm hoists to `framework/harness-protocol`,
 * creating a structural mismatch with callers on the other version. A plain
 * structural interface sidesteps the dual-version problem entirely.
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
