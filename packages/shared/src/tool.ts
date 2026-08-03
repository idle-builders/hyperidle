/**
 * Skill-tool cross-boundary types (AU19 §7.5 C1 resolution).
 *
 * `tool-provider` (agent-execution, deps = shared only) holds tool
 * descriptors + the dispatch that calls an injected handler port.
 * `tool-handlers` (agent-orchestration, keeps db) holds the DB-/domain-
 * touching handler bodies. Both halves reference these types from
 * `@hyperidle/shared` so neither depends on the other (Mechanism C).
 *
 * @lore AU19 Increment 4: reclassified from `packages/server/src/tools/
 * {tool-registry,tool-result,assistant-tool-result}.ts`. `TDb` is generic
 * (same pattern as `HarnessPort`'s `TDb` / `AgentWorkIntentRecorder`'s
 * `TTx`/`TDb`) because `@hyperidle/shared` has zero `@hyperidle/db`
 * dependency — `tool-provider`'s own code never inspects `ctx.db`, it only
 * forwards the opaque value into an injected handler; `tool-handlers`
 * (which keeps db) instantiates this generic with the real `HyperIdleDb`
 * type for its own handler bodies. `ingestion` is narrowed to the single
 * method every tool body actually calls (`dispose()`) — structurally
 * identical to `@hyperidle/session-lifecycle`'s own `IngestionHandle`
 * (`contracts.ts`), so no adapter is needed at the boundary (same idiom
 * `dispatch`/`session-lifecycle`'s own `ports.ts` files already established
 * for this exact type before tool-provider/tool-handlers existed).
 */

import * as crypto from "node:crypto";
import z from "zod";
import type { EventBus } from "./event-bus.js";
import type { SessionWorkflow } from "./harness/harness-adapter.js";
import type { Reversibility } from "./proposed-call.js";
import type { AgentSessionSourceCorrelation, AgentSessionSourceKind } from "./session-request.js";
import type { UserRole } from "./types.js";

/**
 * Per-invocation context handed to every skill tool. `TDb` is opaque to
 * `tool-provider`'s own dispatch code — only `tool-handlers`' real handler
 * bodies (which keep `@hyperidle/db`) ever read `ctx.db`.
 */
export interface ToolContext<TDb = unknown> {
	readonly db: TDb;
	readonly eventBus: EventBus;
	readonly agentId: string;
	readonly sessionId: string;
	readonly taskId: string;
	readonly teamId?: string;
	/**
	 * AU27 Increment 1 (Decision 1) — the thread this session was started FOR,
	 * its calling thread. Baked at emit time (never read on the run path — AU21
	 * AC #2). Absent for `routine_run`/`knowledge_action`, which have no
	 * calling thread. The `taskId: ""`-for-absent idiom is deliberately not
	 * copied here, because `""` is not a valid thread id and the `reply` tool
	 * must be able to tell "no calling thread" apart from a real one.
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

/** A skill tool's handler function. */
export type ToolHandler<Input = unknown, TDb = unknown> = (
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
	readonly roles?: readonly UserRole[];
	readonly reversibility?: Reversibility;
	readonly annotations?: {
		readonly destructiveHint?: boolean;
		readonly idempotentHint?: boolean;
	};
}

/**
 * A `ToolDefinition` after registry boundary-erasure of its `Input` type
 * parameter. See the original `tool-registry.ts`'s `@lore AF4/§4b` for why
 * erasure to `unknown` is sound (the registry only ever invokes `handler`
 * AFTER validating `args` against `inputSchema`).
 */
export interface RegisteredTool<TDb = unknown> {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: z.ZodType;
	readonly handler: ToolHandler<unknown, TDb>;
	readonly roles?: readonly UserRole[];
	readonly reversibility?: Reversibility;
	readonly annotations?: {
		readonly destructiveHint?: boolean;
		readonly idempotentHint?: boolean;
	};
}

/** Anthropic Messages API tool spec — see https://docs.anthropic.com/en/api/messages. */
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

export interface ToolRegistry<TDb = unknown> {
	readonly definitions: readonly RegisteredTool<TDb>[];
	readonly invoke: (name: string, rawArgs: unknown) => Promise<ToolResult>;
	readonly toClaudeToolSpecs: () => readonly ClaudeToolSpec[];
}

/**
 * `RegistrySessionWorkflow` — extends `SessionWorkflow` with the server-side
 * capture fields derived server-side and never authored by the agent (see
 * the original `tool-registry.ts`'s `@lore AL7 concept rejection #8`).
 */
export interface RegistrySessionWorkflow extends SessionWorkflow {
	readonly reviewMessageId: string;
	readonly subjectThreadId: string;
	readonly artifactId: string;
}

/** Options accepted by `tool-provider`'s `buildToolRegistry`. */
export interface BuildToolRegistryOptions<TDb = unknown> {
	readonly role: UserRole;
	readonly extraTools?: readonly RegisteredTool<TDb>[];
	readonly sessionWorkflow?: RegistrySessionWorkflow;
	readonly useOnlyExtraTools?: boolean;
}

/**
 * AL7 trust-first two-session workflow router port. `tool-provider`'s
 * dispatch (agent-execution, zero `@hyperidle/db`) forwards `ctx.db`
 * opaquely into these methods — the concrete implementation (wired by the
 * composition root) is `@hyperidle/review`'s owned `proposedCalls`/
 * `tailoredGrants`/`operationOutcomes` tables (Table ACL — Mechanism A).
 * `tool-provider` never imports `@hyperidle/review` (Mechanism C); it only
 * imports this generic, db-free port type.
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
	/** CAS-consume a tailored grant for `(taskId, agentId, toolId)`. Returns the claimed proposedCallId, or `null` if already consumed / not granted. */
	consumeTailoredGrant(
		db: TDb,
		opts: { readonly taskId: string; readonly agentId: string; readonly toolId: string },
	): Promise<{ readonly proposedCallId: string } | null>;
	recordOutcome(db: TDb, proposedCallId: string, result: ToolResult): Promise<void>;
}

/** Status-discriminated result for assistant tool handlers (AD8b). */
export type AssistantToolResult<T = unknown> =
	| { readonly status: "ok"; readonly value: T }
	| { readonly status: "error"; readonly message: string };

/** Shape of an assistant-specific tool definition (AD8b). */
export interface AssistantToolShape<Input = unknown, TDb = unknown> {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: z.ZodType<Input>;
	readonly handler: (args: Input, ctx: ToolContext<TDb>) => Promise<AssistantToolResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure, db-free tool-registry helpers (AU19 Increment 4: moved from
// `packages/server/src/tools/tool-registry.ts`). BOTH `tool-provider`
// (agent-execution, assembling the dispatch) AND `tool-handlers`
// (agent-orchestration, assembling `ALL_TOOL_DEFINITIONS` from the 26 real
// tool bodies) need these — living in `@hyperidle/shared` (a leaf both
// already depend on) avoids duplicating them, since Mechanism B forbids
// `tool-handlers` from depending on `@hyperidle/tool-provider` even though
// the direction would otherwise look "downward" (execution-boundary-guard's
// ban is unconditional: only `agent-execution/*` + Applications may depend
// on an execution Service package).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Erase a `ToolDefinition<Input>` to a `RegisteredTool`. The schema still
 * validates `args` at call time; the handler is only invoked with the parsed
 * (schema-typed) value. Behaviour-neutral boundary adapter — replaces the
 * previous covariant array typing that did not compile under invariance.
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
 * Wrap an `AssistantToolShape` to produce a `RegisteredTool` with a role
 * filter (AD8b: assistant tools use `{ status: "ok" | "error" }` rather than
 * the older `{ success: boolean }` `ToolResult`).
 */
export function wrapForRegistry<T, TDb = unknown>(
	shape: AssistantToolShape<T, TDb>,
	roles: readonly UserRole[],
): RegisteredTool<TDb> {
	return toRegistered<T, TDb>({
		name: shape.name,
		description: shape.description,
		inputSchema: shape.inputSchema,
		roles,
		handler: async (args, ctx) => {
			const result = await shape.handler(args, ctx);
			if (result.status === "ok") {
				return ok(result.value);
			}
			return err("TOOL_ERROR", result.message);
		},
	});
}

/**
 * Anthropic Messages API tool spec. The shape required by the SDK's `tools`
 * field — `input_schema.type` must be `"object"`.
 *
 * Source: https://docs.anthropic.com/en/api/messages — `tool_use` block.
 */
export function toClaudeToolSpec<TDb = unknown>(def: RegisteredTool<TDb>): ClaudeToolSpec {
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

/**
 * Classify a tool call's reversibility.
 *
 * Resolution order:
 * 1. Tool definition's explicit `reversibility` field.
 * 2. MCP `destructiveHint` annotation → `irreversible`.
 * 3. MCP `idempotentHint` annotation (without destructive) → `reversible`.
 * 4. **No signal → `irreversible`** (fail-closed out of *care*, not suspicion).
 *    A consequential-looking call is surfaced to the human rather than silently executed.
 *
 * @lore AL7 D1: the fail-closed default is collaboration care, not agent-distrust.
 * The human might see a boring call — that is acceptable. Silently executing an
 * irreversible op is not.
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

/**
 * Produce a canonical JSON string for `{toolId, args}` with keys sorted
 * deterministically. Used by `identityHash` to ensure the hash is stable
 * regardless of key-insertion order in `args`.
 *
 * @lore AL7 D3: the canonical form is NOT a security boundary — it is
 * convenience metadata for the optional arg-pin. A hash mismatch NEVER
 * blocks the approved work.
 */
export function canonicalJson(toolId: string, args: Record<string, unknown>): string {
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
 * SHA-256 over the canonical JSON of `{toolId, args}`.
 *
 * Returns a hex string prefixed with `sha256-`. Used as optional metadata for
 * the arg-pin convenience (AC5b). NOT a security guard — nothing gates on this
 * hash; a hash mismatch never blocks the approved work.
 *
 * @lore AL7 D3: no-deadlock by design. The name-scoped allow always permits
 * the approved tool; the hash is only the convenience layer.
 */
export function identityHash(toolId: string, args: Record<string, unknown>): string {
	const digest = crypto.createHash("sha256").update(canonicalJson(toolId, args)).digest("hex");
	return `sha256-${digest}`;
}

/**
 * Determine which tools to allow and which to route to review, given a
 * `SessionWorkflow` and the full list of tools visible in the session.
 *
 * session-1 (open-work):
 *   - `routeToReview` = all irreversible tools
 *   - `allow` = reversible tools
 *
 * session-2 (grant-bearing):
 *   - `routeToReview` = irreversible tools EXCEPT the approvedCall.toolId
 *   - `allow` = reversible tools + approvedCall.toolId
 *
 * @lore AL7 D1: used by per-harness native carriers (Claude `allowedTools`/
 * `disallowedTools`). The router in `invoke` is the uniform record/consume
 * point; this helper surfaces the same partitioning to harness-specific adapters.
 */
export function composeWorkflowAllowDeny(
	wf: SessionWorkflow,
	allTools: ReadonlyArray<Pick<RegisteredTool, "name" | "reversibility" | "annotations">>,
): { allow: string[]; routeToReview: string[] } {
	const allow: string[] = [];
	const routeToReview: string[] = [];

	for (const tool of allTools) {
		const rev = classifyReversibility(tool.name, tool);
		const isIrreversible = wf.routeToReview.includes(rev as Reversibility);

		if (isIrreversible) {
			if (wf.sessionRole === "grant-bearing" && wf.approvedCall?.toolId === tool.name) {
				allow.push(tool.name);
			} else {
				routeToReview.push(tool.name);
			}
		} else {
			allow.push(tool.name);
		}
	}

	return { allow, routeToReview };
}

/**
 * Return the subset of tool definitions accessible to a given agent role.
 * A tool with `roles === undefined` is available to all roles; otherwise the
 * role must appear in the tool's `roles` array.
 */
export function toolsForRole<TDb = unknown>(
	allToolDefinitions: readonly RegisteredTool<TDb>[],
	role: UserRole,
): readonly RegisteredTool<TDb>[] {
	return allToolDefinitions.filter((d) => d.roles === undefined || d.roles.includes(role));
}
