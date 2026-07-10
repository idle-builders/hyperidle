import * as crypto from "node:crypto";
import { type HyperIdleDb, operationOutcomes, proposedCalls, tailoredGrants } from "@hyperidle/db";
import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	EventBus,
	Reversibility,
	SessionWorkflow,
	UserRole,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import z from "zod";
import type { IngestionHandle } from "../app-runtime/contracts.js";
import { addAgentTool } from "./add-agent.js";
import type { AssistantToolShape } from "./assistant-tool-result.js";
import { commitFileTool } from "./commit-file.js";
import { createArtifactTool } from "./create-artifact.js";
import { createBetTool } from "./create-bet.js";
import { createConflictReviewTool } from "./create-conflict-review.js";
import { createItemTool } from "./create-item.js";
import { createRoutineTool } from "./create-routine.js";
import { createTaskTool } from "./create-task.js";
import { createTeamTool } from "./create-team.js";
import { editBetTool } from "./edit-bet.js";
import { handoffToTool } from "./handoff-to.js";
import { logTaskTool } from "./log-task.js";
import { promoteKnowledgeTool } from "./promote-knowledge.js";
import { queryPracticeTool } from "./query-practice.js";
import { readInboxTool } from "./read-inbox.js";
import { routeItemTool } from "./route-item.js";
import { scoreAttentionTool } from "./score-attention.js";
import { sendMessageTool } from "./send-message.js";
import { submitReviewTool } from "./submit-review.js";
import { err, ok, type ToolResult } from "./tool-result.js";
import { updateRoutineTool } from "./update-routine.js";
import { writeMemoryTool } from "./write-memory.js";
import { writeSessionNotesTool } from "./write-session-notes.js";

/**
 * Per-invocation context handed to every skill tool. The harness owns the
 * database and event bus and identifies the caller (agent, session, task).
 *
 * Tools that need sandbox IO (e.g. `write_session_notes`) read `sandboxPath`
 * — the same assembled sandbox the file watcher is observing.
 *
 * @lore R7: `teamId` is optional because it is not available in all call sites
 * (e.g. unit tests that construct ToolContext directly). When present, tools
 * such as `write_memory` use it to set scopeKind/scopeId on created knowledge
 * items so they appear in the correct context assembly scope (L2 = product).
 */
export interface ToolContext {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly agentId: string;
	readonly sessionId: string;
	readonly taskId: string;
	readonly teamId?: string;
	readonly requestContext?: {
		readonly requestId: string;
		readonly sourceKind: AgentSessionSourceKind;
		readonly sourceId: string;
		readonly sourceCorrelation: AgentSessionSourceCorrelation;
	};
	readonly sandboxPath: string;
	/**
	 * AK2: was `watcher: FileWatcher` (direct Fabric import). Renamed to
	 * `ingestion: IngestionHandle` as part of Strategy port decoupling. The
	 * handoff-to tool uses this to reconstruct a SessionContext for the
	 * handoff path (which calls endSession/crashSession that dispose it).
	 */
	readonly ingestion: IngestionHandle;
	/**
	 * AL7 Task 5: When provided, the workflow router calls this after the
	 * first capture (session 1 ends — sessions aren't pausable). Injected
	 * by provisionSession via the sessionRunRegistry.abort closure.
	 * Optional — absent for sessions without a workflow (e.g. test fixtures).
	 *
	 * @lore AL7: abort fires after the FIRST distinct irreversible capture.
	 * A second identical call hits the UNIQUE-dedup (no-op). A second distinct
	 * call still captures (WARNING-5.1) before the process dies.
	 */
	readonly onAbortSession?: (sessionId: string) => void;
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
	/** AL7: optional reversibility annotation; see RegisteredTool.reversibility. */
	readonly reversibility?: Reversibility;
	/** AL7: optional MCP annotations; see RegisteredTool.annotations. */
	readonly annotations?: {
		readonly destructiveHint?: boolean;
		readonly idempotentHint?: boolean;
	};
}

/**
 * A `ToolDefinition` after registry boundary-erasure of its `Input` type
 * parameter. `ToolDefinition<Input>` is INVARIANT in `Input` (it appears both
 * covariantly in `inputSchema` and contravariantly in `handler`), so a
 * `ToolDefinition<{specific}>` is genuinely not assignable to
 * `ToolDefinition<unknown>` — you cannot feed `unknown` to a handler expecting
 * a narrow shape. The registry only ever invokes `handler` AFTER validating
 * `args` against `inputSchema` (the single `def.handler(parsed.data, …)` site
 * below), so erasing the boundary to `unknown` is sound: the runtime always
 * passes a parsed value of the schema's type. @lore AF4/§4b
 */
export interface RegisteredTool {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: z.ZodType;
	readonly handler: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
	readonly roles?: readonly UserRole[];
	/**
	 * AL7 Task 4: explicit reversibility annotation for `classifyReversibility`.
	 * When absent, the classifier is fail-closed: the tool is treated as `irreversible`
	 * (routed to review out of *care*, not suspicion). When present, overrides MCP hints.
	 *
	 * @lore AL7 D1: fail-closed means no missed consequential calls. Care, not suspicion.
	 */
	readonly reversibility?: Reversibility;
	/**
	 * AL7 Task 4: MCP tool annotations for reversibility classification.
	 * The classifier reads `destructiveHint`/`idempotentHint` when no explicit
	 * `reversibility` annotation is present.
	 */
	readonly annotations?: {
		readonly destructiveHint?: boolean;
		readonly idempotentHint?: boolean;
	};
}

/**
 * Erase a `ToolDefinition<Input>` to a `RegisteredTool`. The schema still
 * validates `args` at call time; the handler is only invoked with the parsed
 * (schema-typed) value. Behaviour-neutral boundary adapter — replaces the
 * previous covariant array typing that did not compile under invariance.
 */
export function toRegistered<Input>(def: ToolDefinition<Input>): RegisteredTool {
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
export function toClaudeToolSpec(def: RegisteredTool): ClaudeToolSpec {
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
	readonly definitions: readonly RegisteredTool[];
	readonly invoke: (name: string, rawArgs: unknown) => Promise<ToolResult>;
	readonly toClaudeToolSpecs: () => readonly ClaudeToolSpec[];
}

// ─────────────────────────────────────────────────────────────────────────────
// AL7 Task 4: Classifier + composer + identity hash
// ─────────────────────────────────────────────────────────────────────────────

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
	// 1. Explicit annotation wins
	if (def.reversibility !== undefined) return def.reversibility;
	// 2. MCP hints
	if (def.annotations?.destructiveHint === true) return "irreversible";
	if (def.annotations?.idempotentHint === true) return "reversible";
	// 3. Fail-closed: no signal → irreversible
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
			// Session 2: approved tool moves to allow
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
 * Wrap an AssistantToolShape to produce a ToolDefinition with a role filter.
 *
 * @lore AD8b: Tools using AssistantToolShape return `{ status: "ok" | "error" }`
 * instead of the older `{ success: boolean }` ToolResult. This adapter bridges
 * the two interfaces so AssistantToolShape tools can live in ALL_TOOL_DEFINITIONS
 * alongside legacy ToolDefinition tools.
 */
function wrapForRegistry<T>(
	shape: AssistantToolShape<T>,
	roles: readonly UserRole[],
): RegisteredTool {
	return toRegistered<T>({
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
 * The canonical list of every skill tool. Exported so callers can filter by
 * role without needing a `ctx` (e.g. the session-provisioning phase that has
 * to decide which tool names to hand the harness BEFORE the session is live).
 *
 * @lore Four facilitator-only tools (`route_item`, `score_attention`,
 * `promote_knowledge`, `create_conflict_review`) narrow to the facilitator
 * roles — passing them to builders would break G1 AC6's authorization intent
 * and let a builder mutate knowledge lifecycle state.
 */
export const ALL_TOOL_DEFINITIONS: readonly RegisteredTool[] = [
	// Each definition is erased to a RegisteredTool at the array boundary; the
	// schema still validates args at invoke time (toRegistered, §4b). Erasure is
	// per-element so the heterogeneous `ToolDefinition<various>` literals unify
	// (`ToolDefinition<Input>` is invariant — a covariant array would not compile).
	toRegistered(readInboxTool),
	toRegistered(sendMessageTool),
	toRegistered(logTaskTool),
	toRegistered(queryPracticeTool),
	toRegistered(writeMemoryTool),
	toRegistered(handoffToTool),
	toRegistered(createItemTool),
	toRegistered(writeSessionNotesTool),
	// R5: new agent work loop tools — available to all roles.
	toRegistered(createTaskTool),
	toRegistered(submitReviewTool),
	// R6: create_artifact is available to all agent roles — no `roles` filter.
	toRegistered(createArtifactTool),
	// G1 facilitator tools — restricted to facilitator roles.
	toRegistered(routeItemTool),
	toRegistered(scoreAttentionTool),
	toRegistered(promoteKnowledgeTool),
	toRegistered(createConflictReviewTool),
	// AE3 management tools — restricted to the assistant role.
	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	toRegistered(createTeamTool),
	toRegistered(addAgentTool),
	// @lore AE3: createBetTool uses AssistantToolShape; wrapForRegistry returns
	// the already-erased RegisteredTool shape.
	wrapForRegistry(createBetTool, ["assistant"]),
	// @lore AK4: editBetTool registered for assistant role so buildAssistantDraftRegistry
	// can assemble it. It was previously only in the dead assistant-tools.ts path.
	wrapForRegistry(editBetTool, ["assistant"]),
	toRegistered(createRoutineTool),
	toRegistered(updateRoutineTool),
	// AL7 Task 4: live-proof tool — MCP-exposed, reversibility:"irreversible".
	// Wired BEFORE Tasks 5-11 (topological order per architecture Task 4).
	// Proves the trust-first loop mechanics without external credentials (AC12).
	toRegistered(commitFileTool),
];

/**
 * Return the subset of tool definitions accessible to a given agent role.
 * A tool with `roles === undefined` is available to all roles; otherwise the
 * role must appear in the tool's `roles` array.
 */
export function toolsForRole(role: UserRole): readonly RegisteredTool[] {
	return ALL_TOOL_DEFINITIONS.filter((d) => d.roles === undefined || d.roles.includes(role));
}

/**
 * AL7 Task 5: Session-workflow extension for `BuildToolRegistryOptions`.
 *
 * Extends `SessionWorkflow` (from `@hyperidle/shared`) with the server-side
 * capture fields (`reviewMessageId`, `subjectThreadId`, `artifactId`) that are
 * derived server-side and never authored by the agent.
 *
 * These fields are in `BuildToolRegistryOptions` (not in `SessionWorkflow`) because:
 * - `SessionWorkflow` travels in `SessionConfig` (the shared harness interface);
 *   it must not carry fields that belong to a specific server capture context.
 * - The router in `invoke` reads them to anchor the Proposed Call to the right
 *   review message + thread + artifact.
 *
 * @lore AL7 concept rejection #8: `reviewMessageId`/`subjectThreadId`/`artifactId`
 * are derived server-side, never agent-authored. They belong in the provisioning
 * context, not in the shared `SessionWorkflow` type.
 */
export interface RegistrySessionWorkflow extends SessionWorkflow {
	/** The review message this session is anchored to (derived server-side). */
	readonly reviewMessageId: string;
	/** The subject thread for the review (anchor for the loader). */
	readonly subjectThreadId: string;
	/** The action_operation artifact id this proposed call nests on. */
	readonly artifactId: string;
}

/**
 * Options accepted by `buildToolRegistry`. `role` is REQUIRED so every call
 * site has to make an explicit authorization decision — silent fallback to
 * "all tools" was the I2 B1/B2 vulnerability.
 *
 * @lore I2 B1/B2: previously `buildToolRegistry(ctx)` returned every tool
 * to every caller. Defence-in-depth: the registry now filters by role at
 * the constructor boundary, mirroring the harness allowed-tool list.
 *
 * @lore AL6 v4-final: `extraTools` allows per-session tools (e.g.
 * hyperidle_return_status) to be injected into the registry at construction
 * time. Extra tools are appended AFTER role-filtered tools and bypass the
 * role filter (the caller controls injection; the tool itself encodes its
 * authorization via context or closed-over registry).
 *
 * @lore AL7 Task 5: `sessionWorkflow` (optional) carries the route-to-review
 * workflow + capture anchors. When present, `invoke` classifies reversibility
 * and routes irreversible calls to review (session 1) or permits the approved
 * op (session 2). Absent for sessions that don't participate in the workflow.
 */
export interface BuildToolRegistryOptions {
	readonly role: UserRole;
	readonly extraTools?: readonly RegisteredTool[];
	readonly sessionWorkflow?: RegistrySessionWorkflow;
	/**
	 * When true, skip roleFiltered tools entirely — registry is built ONLY from extraTools.
	 *
	 * @lore AR4a: Used for conversational mode registries where role tools (including all-role
	 * tools like submit_review) must not appear in toolDefs. The builtin adapter's
	 * force-return check (hasReturnActionInRegistry in runChatTurn) sees submit_review as a
	 * return action when it's in role tools, re-seeding toolIterations past MAX_TOOL_ITERATIONS.
	 * Conversational turns are compliant-by-construction; submit_review is irrelevant and
	 * harmful to include. `role` is still required (caller makes an explicit decision).
	 */
	readonly useOnlyExtraTools?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// AL7 Task 5: internal workflow-router helpers (capture, record outcome)
// ─────────────────────────────────────────────────────────────────────────────

function nowIso(): string {
	return new Date().toISOString();
}

/**
 * Insert a Proposed Call row idempotently using ON CONFLICT DO NOTHING semantics.
 * Returns `{ firstCapture: true }` if the row was newly inserted (zero prior rows
 * for this `(originSessionId, identityHash)` pair) or `{ firstCapture: false }` if
 * it was a duplicate.
 *
 * @lore AL7 WARNING-5.2: the `(origin_session_id, identity_hash)` constraint MUST
 * be a UNIQUE constraint (not a plain index) so the INSERT ON CONFLICT DO NOTHING
 * truly deduplicates. A plain index does NOT block duplicates in PostgreSQL.
 */
async function captureProposedCall(
	db: HyperIdleDb,
	opts: {
		originSessionId: string;
		taskId: string;
		agentId: string;
		toolId: string;
		args: Record<string, unknown>;
		hash: string;
		reviewMessageId: string;
		subjectThreadId: string;
		artifactId: string;
	},
): Promise<{ firstCapture: boolean }> {
	const id = `pc-${crypto.randomUUID()}`;
	const rows = await db
		.insert(proposedCalls)
		.values({
			id,
			reviewMessageId: opts.reviewMessageId,
			subjectThreadId: opts.subjectThreadId,
			artifactId: opts.artifactId,
			originSessionId: opts.originSessionId,
			toolId: opts.toolId,
			args: JSON.stringify(opts.args),
			identityHash: opts.hash,
			reversibility: "irreversible",
			status: "captured",
			stagedByAgentId: opts.agentId,
			createdAt: nowIso(),
		})
		.onConflictDoNothing()
		.returning();
	return { firstCapture: rows.length > 0 };
}

/**
 * Record the terminal outcome of an executed Proposed Call.
 * One row per `proposedCallId` (PK enforces immutability).
 */
async function recordOutcome(
	db: HyperIdleDb,
	proposedCallId: string,
	result: ToolResult,
): Promise<void> {
	const executedAt = nowIso();
	if (result.success) {
		const receipt = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
		await db.insert(operationOutcomes).values({
			proposedCallId,
			status: "ok",
			receipt,
			executedAt,
		});
	} else {
		await db.insert(operationOutcomes).values({
			proposedCallId,
			status: "failed",
			error: result.error,
			executedAt,
		});
	}
	// Transition the Proposed Call status
	const newStatus = result.success ? "executed" : "failed";
	await db
		.update(proposedCalls)
		.set({ status: newStatus })
		.where(eq(proposedCalls.id, proposedCallId));
}

/**
 * Build a fresh registry bound to the given context, filtered to the agent's role.
 *
 * When `options.sessionWorkflow` is provided, `invoke` becomes the **workflow
 * router**: classify reversibility → route irreversible to review (capture +
 * record) or permit the approved op (CAS-consume grant → run handler → record
 * Outcome). This is HyperIdle's participation point in the agent's brokered call.
 *
 * @lore I2 review W3: when the requested tool exists in the global tool
 * catalogue but is filtered out for this role, `invoke()` returns
 * `FORBIDDEN` (not `NOT_FOUND`). NOT_FOUND is reserved for genuinely
 * unknown tool names so an operator debugging "missing tool" failures
 * can distinguish a typo (NOT_FOUND) from a role-boundary breach
 * (FORBIDDEN). The harness still applies its own per-session allowlist
 * (`session-provisioning.ts:303`); this is the inner gate.
 *
 * @lore AL7 Task 5: the workflow router. One change, all harnesses, because
 * every brokered/MCP-routed call passes through this closure. The router is
 * collaboration plumbing, not a security floor (ETHOS §4).
 */
export function buildToolRegistry(
	ctx: ToolContext,
	options: BuildToolRegistryOptions,
): ToolRegistry {
	const roleFiltered = options.useOnlyExtraTools ? [] : toolsForRole(options.role);
	const definitions: readonly RegisteredTool[] = options.extraTools?.length
		? [...roleFiltered, ...options.extraTools]
		: roleFiltered;

	const byName = new Map(definitions.map((d) => [d.name, d]));
	const allByName = new Map(ALL_TOOL_DEFINITIONS.map((d) => [d.name, d]));

	const wf = options.sessionWorkflow;

	async function invoke(name: string, rawArgs: unknown): Promise<ToolResult> {
		const def = byName.get(name);
		if (!def) {
			// For unregistered tools: if the name appears in allByName, it's a role boundary
			// breach; otherwise it's truly unknown. The workflow router still fires for
			// unregistered tools that are irreversible (fail-closed treats unknowns as
			// irreversible and routes them to review rather than revealing the NOT_FOUND).
			if (wf) {
				// Unknown tool in a workflow session: fail-closed → route to review
				const hash = identityHash(name, (rawArgs as Record<string, unknown> | null) ?? {});
				const captured = await captureProposedCall(ctx.db, {
					originSessionId: ctx.sessionId,
					taskId: ctx.taskId,
					agentId: ctx.agentId,
					toolId: name,
					args: (rawArgs as Record<string, unknown> | null) ?? {},
					hash,
					reviewMessageId: wf.reviewMessageId,
					subjectThreadId: wf.subjectThreadId,
					artifactId: wf.artifactId,
				});
				if (captured.firstCapture) {
					ctx.onAbortSession?.(ctx.sessionId);
				}
				return err("AWAITING_REVIEW", `Call to ${name} routed to human review.`);
			}
			if (allByName.has(name)) {
				return err("FORBIDDEN", `Tool not available to this role: ${name}`);
			}
			return err("NOT_FOUND", `Unknown tool: ${name}`);
		}

		const parsed = def.inputSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return err("INVALID_INPUT", parsed.error.message);
		}

		// ── Workflow router ────────────────────────────────────────────────────
		if (wf) {
			const reversibility = classifyReversibility(name, def);
			const isIrreversible = wf.routeToReview.includes(reversibility);

			// Session 2 (grant-bearing): check if this is the approved op
			if (wf.sessionRole === "grant-bearing" && wf.approvedCall?.toolId === name) {
				// Arg-pin check: if pinned, identity must match
				const isArgPinned = wf.approvedCall.argPinned;
				const argsMatch =
					!isArgPinned ||
					identityHash(name, parsed.data as Record<string, unknown>) ===
						wf.approvedCall.identityHash;

				if (argsMatch) {
					// CAS-consume the tailored grant (single-statement atomic consume)
					const [claimed] = await ctx.db
						.update(tailoredGrants)
						.set({ consumed: true, consumedAt: nowIso() })
						.where(
							and(
								eq(tailoredGrants.taskScope, ctx.taskId),
								eq(tailoredGrants.agentScope, ctx.agentId),
								eq(tailoredGrants.approvedToolId, name),
								eq(tailoredGrants.consumed, false),
							),
						)
						.returning();

					if (claimed) {
						// Grant consumed: run the agent's own handler
						try {
							const result = await def.handler(parsed.data, ctx);
							await recordOutcome(ctx.db, claimed.proposedCallId, result);
							return result;
						} catch (e) {
							const failResult = err(
								"EXECUTION_FAILED",
								`Approved call ${name} threw: ${String(e)}`,
							);
							await recordOutcome(ctx.db, claimed.proposedCallId, failResult);
							return failResult;
						}
					}
					// Grant already consumed → fall through to route-to-review
					// (no double-execute; surfaced as a fresh decision)
				}
				// Arg-pinned mismatch → fall through to route-to-review
			}

			// Route irreversible (or unknown) calls to review
			if (isIrreversible) {
				const hash = identityHash(name, parsed.data as Record<string, unknown>);
				const captured = await captureProposedCall(ctx.db, {
					originSessionId: ctx.sessionId,
					taskId: ctx.taskId,
					agentId: ctx.agentId,
					toolId: name,
					args: parsed.data as Record<string, unknown>,
					hash,
					reviewMessageId: wf.reviewMessageId,
					subjectThreadId: wf.subjectThreadId,
					artifactId: wf.artifactId,
				});
				if (captured.firstCapture) {
					// Session 1 ends after first capture (sessions aren't pausable)
					ctx.onAbortSession?.(ctx.sessionId);
				}
				return err("AWAITING_REVIEW", `Call to ${name} routed to human review.`);
			}
		}
		// ── End workflow router ────────────────────────────────────────────────

		return def.handler(parsed.data, ctx);
	}

	return {
		definitions,
		invoke,
		toClaudeToolSpecs: () => definitions.map((d) => toClaudeToolSpec(d)),
	};
}
