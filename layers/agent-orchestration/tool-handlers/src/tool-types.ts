/**
 * Builder types for assembling tool registries — the authoring shapes and
 * helpers used by tool-handlers' own 22 tool bodies and tool-registry.ts.
 *
 * Moved from `@hyperidle/tool-protocol` (dissolved). These were shared with
 * `tool-provider` (AU19), but `tool-provider` itself was dissolved in AU31.
 * The only remaining consumers are within this package, making the framework
 * home pure tidiness — not value.
 *
 * @lore AU44 batch 5: builder types are internal to the layer that owns the
 * definitions. Only `ProposedCallWorkflowPort` is exported — it is named by
 * `run-orchestration-composition.ts` when wiring the DI seam.
 */

import * as crypto from "node:crypto";
import type { Reversibility } from "@hyperidle/domain-model";
import type {
	ClaudeToolSpec,
	RegisteredTool,
	SessionWorkflow,
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
	readonly roles?: readonly string[];
	readonly reversibility?: Reversibility;
	readonly annotations?: {
		readonly destructiveHint?: boolean;
		readonly idempotentHint?: boolean;
	};
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
		...(def.roles ? { roles: def.roles } : {}),
		...(def.reversibility !== undefined ? { reversibility: def.reversibility } : {}),
		...(def.annotations !== undefined ? { annotations: def.annotations } : {}),
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

/**
 * Classify a tool call's reversibility.
 *
 * Resolution order:
 * 1. Tool definition's explicit `reversibility` field.
 * 2. MCP `destructiveHint` annotation → `irreversible`.
 * 3. MCP `idempotentHint` annotation (without destructive) → `reversible`.
 * 4. No signal → `irreversible` (fail-closed out of care, not suspicion).
 */
export function classifyReversibility(
	_toolId: string,
	def: object & {
		reversibility?: Reversibility;
		annotations?: { destructiveHint?: boolean; idempotentHint?: boolean };
	},
): Reversibility {
	if (def.reversibility !== undefined) return def.reversibility;
	if (def.annotations?.destructiveHint === true) return "irreversible";
	if (def.annotations?.idempotentHint === true) return "reversible";
	return "irreversible";
}

function canonicalJson(toolId: string, args: Record<string, unknown>): string {
	function sortKeys(obj: unknown): unknown {
		if (obj === null || typeof obj !== "object") return obj;
		if (Array.isArray(obj)) return obj.map(sortKeys);
		const sorted: Record<string, unknown> = {};
		for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
			sorted[k] = sortKeys((obj as Record<string, unknown>)[k]);
		}
		return sorted;
	}
	return JSON.stringify({ toolId, args: sortKeys(args) });
}

/**
 * SHA-256 over the canonical JSON of `{toolId, args}`. Used as optional
 * metadata for the arg-pin convenience (AC5b). NOT a security guard.
 *
 * @lore AL7 D3: no-deadlock by design.
 */
export function identityHash(toolId: string, args: Record<string, unknown>): string {
	const digest = crypto.createHash("sha256").update(canonicalJson(toolId, args)).digest("hex");
	return `sha256-${digest}`;
}

/** Options bag for `buildToolRegistry`. Not exported — callers infer from the signature. */
export interface BuildToolRegistryOptions<TDb = unknown> {
	readonly role: string;
	readonly extraTools?: readonly RegisteredTool<TDb>[];
	readonly sessionWorkflow?: RegistrySessionWorkflow;
	readonly useOnlyExtraTools?: boolean;
}

/**
 * `RegistrySessionWorkflow` — extends `SessionWorkflow` with server-side
 * capture fields. Internal to the registry builder.
 */
export interface RegistrySessionWorkflow extends SessionWorkflow {
	readonly reviewMessageId: string;
	readonly subjectThreadId: string;
	readonly artifactId: string;
}

/**
 * AL7 trust-first two-session workflow router port. Exported so the
 * composition root (`run-orchestration-composition.ts`) can type-check the
 * wiring without importing `@hyperidle/review` directly.
 */
export interface ProposedCallWorkflowPort<TDb = unknown> {
	captureProposedCall(
		db: TDb,
		opts: {
			readonly originSessionId: string;
			readonly taskId: string;
			readonly agentId: string;
			readonly toolId: string;
			readonly args: Record<string, unknown>;
			readonly hash: string;
			readonly reviewMessageId: string;
			readonly subjectThreadId: string;
			readonly artifactId: string;
		},
	): Promise<{ readonly firstCapture: boolean }>;
	/** CAS-consume a tailored grant for `(taskId, agentId, toolId)`. */
	consumeTailoredGrant(
		db: TDb,
		opts: { readonly taskId: string; readonly agentId: string; readonly toolId: string },
	): Promise<{ readonly proposedCallId: string } | null>;
	recordOutcome(db: TDb, proposedCallId: string, result: ToolResult): Promise<void>;
}
