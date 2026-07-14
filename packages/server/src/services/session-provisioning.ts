import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, sessions } from "@hyperidle/db";
import { listFilesystemIdsByAgent, listFilesystemsByIds } from "@hyperidle/filesystems";
import { summarizeToolArgs } from "@hyperidle/observability";
import * as routineService from "@hyperidle/routine";
import { sessionRunRegistry } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import {
	type AgentSessionSourceCorrelation,
	type AgentSessionSourceKind,
	AL6_MAX_FORCE_RETURNS,
	ConcurrencyLimitError,
	type ConversationMessage,
	CostCapExceededError,
	type EventBus,
	type Filesystem,
	type FilesystemMounter,
	type HarnessAdapter,
	isInternalExtractionDrain,
	isReturnAction,
	MissingCredentialError,
	MODEL_TIERS,
	type ModelTier,
	NoEligibleHarnessError,
	type SessionConfig,
	type SessionHandle,
	type SessionMetrics,
	type SessionOutcome,
	scaleForCurrency,
	type TaskState,
	type TierTokenCount,
	type UserRole,
} from "@hyperidle/shared";
import { getFirstUserByKind, getUserById } from "@hyperidle/users";
import type { StateTransitionAuditEntry, TaskAuditEntry } from "@hyperidle/work";
import * as work from "@hyperidle/work";
import { transitionTask } from "@hyperidle/work";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { AdapterPool, SelectedEntry } from "../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../harness/builtin-harness-adapter.js";
import { writeCliMcpConfig } from "../harness/cli-mcp-config.js";
import { provisionReturnHook } from "../harness/provision-return-hook.js";
import { enforcementRegistry } from "../harness/return-enforcement-registry.js";
// v4-final: re-engage.ts (rewriteSandboxForcing) deleted — no Layer-B loop.
import { createReturnGate, evaluateReturn } from "../harness/return-gate.js";
import type { SandboxAdapter, SandboxHandle } from "../harness/sandbox-adapter.js";
import { createMcpBridge } from "../mcp/mcp-bridge.js";
import type { McpBridgeRegistry } from "../mcp/mcp-bridge-registry.js";
import { returnStatusTool } from "../tools/return-status-tool.js";
import {
	buildToolRegistry,
	type RegistrySessionWorkflow,
	type ToolContext,
	toolsForRole,
} from "../tools/tool-registry.js";
import { assembleAgentContext, beginAgentWriteback } from "./agent-context/assemble-context.js";
import {
	assemblePrompt,
	assembleRoutinePrompt,
	composeAssistantPrompt,
	type ToolSummary,
	writeSandboxAgentsMd,
} from "./context-assembly-prompt.js";
import type { IngestionHandle } from "./contracts.js";
import { checkCostCap, recordCostAndCheck } from "./cost-bindings.js";
import { buildRoutineSessionContextData, buildSessionContextData } from "./session-context.js";
import {
	crashSession,
	endSession,
	requestAgentTermination,
	type SessionContext,
} from "./session-lifecycle.js";
import { recordAgentWorkIntent } from "./session-requests-bindings.js";

// @lore X3: validateSystemPromptPath and SYSTEM_PROMPT_DIR_RELATIVE removed.
// The path traversal attack surface is eliminated by X3 — system prompts are now
// stored inline in the DB (agent.systemPrompt) rather than as file paths. No file
// read happens during session provisioning. The old file-read approach required
// a path traversal guard; the new inline-text approach has no such attack vector.

/**
 * Revert a task that we transitioned to `in_progress` back to `accepted` when
 * provisioning fails AFTER the state transition but BEFORE the session row is
 * committed. We bypass `transitionTask` because the state machine does not
 * include a valid `in_progress -> accepted` transition — this is intentionally
 * a repair path, not a normal workflow transition. We still append an audit
 * entry (carrying the failure reason) and emit a `task_state_changed` event so
 * the revert is observable downstream.
 *
 * @lore I1 H2: the revert entry lands in `tasks.auditTrail`, not `tasks.notes`.
 * `notes` is the agent-authored prose lane; writing audit JSON there corrupts
 * it. We re-use the `StateTransitionAuditEntry` shape so readers can discriminate
 * against `HandoffAuditEntry` via the `type: "handoff"` tag.
 */
async function revertTaskToAccepted(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	reason: string,
): Promise<void> {
	const task = await work.getTaskById(db, taskId);
	if (!task) return;
	const fromState = task.state as TaskState;
	const toState: TaskState = "accepted";

	const existingAudit: TaskAuditEntry[] = task.auditTrail
		? (JSON.parse(task.auditTrail) as TaskAuditEntry[])
		: [];
	const entry: StateTransitionAuditEntry = {
		from: fromState,
		to: toState,
		timestamp: new Date().toISOString(),
		reason,
	};

	await work.updateTaskById(db, taskId, {
		state: toState,
		auditTrail: JSON.stringify([...existingAudit, entry]),
		updatedAt: new Date().toISOString(),
	});

	eventBus.emit({
		type: "task_state_changed",
		streamId: taskId,
		taskId,
		fromState,
		toState,
		timestamp: Date.now(),
	});
}

async function assembleTaskFreePrompt(
	db: HyperIdleDb,
	params: ProvisionSessionParams,
	systemPromptText: string,
	toolSummaries: readonly ToolSummary[],
): Promise<string> {
	const sourceKind = params.requestContext?.sourceKind ?? "unknown";
	const toolSection =
		toolSummaries.length > 0
			? `\n\n## Tools\n${toolSummaries.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")}`
			: "";
	if (sourceKind === "decomposition") {
		const betId =
			params.requestContext?.sourceCorrelation &&
			"betId" in params.requestContext.sourceCorrelation &&
			typeof params.requestContext.sourceCorrelation.betId === "string"
				? params.requestContext.sourceCorrelation.betId
				: params.requestContext?.sourceId;
		const bet = betId ? await work.getBetById(db, betId) : undefined;
		return [
			systemPromptText,
			"## Bet decomposition",
			"Turn this bet into concrete proposed tasks. Use the available task-creation tool when task creation is needed; do not invent another execution path.",
			`Bet ID: ${betId ?? "unknown"}`,
			`Goal: ${bet?.description ?? ""}`,
			`Done condition: ${bet?.doneCondition ?? ""}`,
			toolSection,
		]
			.filter(Boolean)
			.join("\n\n");
	}

	const sourceSection = params.requestContext
		? `## Session request\nSource kind: ${params.requestContext.sourceKind}\nSource ID: ${params.requestContext.sourceId}\nCorrelation: ${JSON.stringify(params.requestContext.sourceCorrelation)}`
		: "## Session request\nTask-free session request";
	return [systemPromptText, sourceSection, toolSection].filter(Boolean).join("\n\n");
}

/**
 * Merge the session's accumulated token counts into bets.tokensActualJson.
 *
 * Uses a read-modify-write pattern (not atomic at the DB level) which is
 * acceptable for single-founder usage. Tokens are informational — budget
 * gating uses costActualMinor which IS atomic.
 *
 * @lore R5 D4: Token accumulation happens at session teardown (not per-event)
 * because tokens arrive as token_usage events (separate from cost_update) and
 * batching them at session end is far cheaper than a per-event read-modify-write.
 * Cost accumulation is per-event (recordCostAndCheck); token accumulation is
 * per-session. Do NOT re-increment costActualMinor here — that is done by
 * recordCostAndCheck per-event (D3). This function ONLY writes tokensActualJson.
 */
async function accumulateSessionTokensOnBet(
	db: HyperIdleDb,
	taskId: string,
	accumulatedTokens: Partial<Record<string, { prompt: number; completion: number }>>,
): Promise<void> {
	if (Object.keys(accumulatedTokens).length === 0) return;

	const task = await work.getTaskById(db, taskId);
	if (!task?.betId) return;

	const bet = await work.getBetById(db, task.betId);

	const existing: Record<string, { prompt: number; completion: number }> = bet?.tokensActualJson
		? ((
				JSON.parse(bet.tokensActualJson) as {
					byTier: Record<string, { prompt: number; completion: number }>;
				}
			).byTier ?? {})
		: {};

	const merged: Record<string, { prompt: number; completion: number }> = { ...existing };
	for (const [tier, counts] of Object.entries(accumulatedTokens)) {
		if (!counts) continue;
		const ex = merged[tier] ?? { prompt: 0, completion: 0 };
		merged[tier] = {
			prompt: ex.prompt + counts.prompt,
			completion: ex.completion + counts.completion,
		};
	}

	await work.updateBetById(db, task.betId, {
		tokensActualJson: JSON.stringify({ byTier: merged }),
	});
}

/**
 * AR2: Read-only context passed to `onBeforeTeardown` observers.
 * Exposes the session identity and sandbox location — sufficient for a
 * harness integration test to read the real files a real agent produced.
 */
export interface BeforeTeardownContext {
	readonly sessionId: string;
	readonly sandboxPath: string;
}

/**
 * Read-only pre-start observation point after session files are written and
 * before the external harness process is spawned.
 *
 * @lore session-setup proof: The harness-suite needs to prove AGENTS.md,
 * CLAUDE.md, MCP config, and return hooks are produced in the exact production
 * shape each binary reads, without spending an LLM call. This seam observes the
 * already-built SessionConfig and sandbox after Phase 8b/8b-enforce. Returning
 * "abort" stops before `harness.startSession` and lets normal teardown continue.
 */
export interface BeforeHarnessStartContext {
	readonly sessionId: string;
	readonly sandboxPath: string;
	readonly adapter: SelectedEntry;
	readonly sessionConfig: SessionConfig;
}

/**
 * Root-level files emitted by session-provisioning into the sandbox.
 * Currently: .mcp.json (Claude MCP auto-discovery config).
 * Exported so the AO2 scaffolding-drift-guard can assert coverage.
 *
 * @lore AO2 §8: .mcp.json is written at session-provisioning.ts:752 inside
 * runSession Phase 8b. It must be excluded from authored commits so the agent
 * working on a repo that tracks .mcp.json does not overwrite the real config.
 */
export const EMITTED_ROOTS_MCP_JSON = [".mcp.json"] as const;

// ── AO2 — Phase 4.5 mount + teardown capture-back helpers ────────────────────

/**
 * AO2 Hook A: Resolve the agent's injected filesystems and mount each into sandboxPath.
 *
 * Called in admitSession Phase 4.5 (AFTER sandbox spawn, BEFORE context assembly).
 * Returns the list of successfully-mounted Filesystem records — stored on AdmittedSession
 * so the teardown helper (Hook B) can capture them without a second DB query.
 *
 * Mount failures are best-effort: a failed mount logs a warning and is EXCLUDED from
 * the returned list. The session continues without that filesystem (degrade-to-today).
 *
 * @lore AO2 §9: Mount BEFORE context assembly so .git/info/exclude is written before
 * assembly drops scaffolding into the directory. A filesystem-less session → empty list,
 * no mounts, no capture rows — purely non-breaking for existing sessions.
 *
 * @lore AU19 Increment 2b: `filesystems`/`filesystem_injections` raw table
 * reads converted to `@hyperidle/filesystems`' real registry functions
 * (`filesystem-registry.ts`) — `filesystems` is now the confirmed real
 * `TABLE_OWNER` for both tables (§14 `⛁*` resolution).
 */
export async function mountFilesystemsForAgent(
	db: HyperIdleDb,
	agentId: string,
	sandboxPath: string,
	mounter: FilesystemMounter,
): Promise<Filesystem[]> {
	// Resolve injected filesystems: sessions.agentId → filesystem_injections → filesystems.
	const fsIds = await listFilesystemIdsByAgent(db, agentId);

	if (fsIds.length === 0) return [];

	const rows = await listFilesystemsByIds(db, fsIds);

	if (rows.length === 0) return [];

	// Parse DB rows into Filesystem domain objects.
	const fsList: Filesystem[] = rows.map((row) => ({
		id: row.id,
		teamId: row.teamId,
		source: row.source,
		kind: row.kind,
		connectionId: row.connectionId ?? null,
		resourceRef: JSON.parse(row.resourceRef) as Filesystem["resourceRef"],
		writeback: row.writeback as Filesystem["writeback"],
		state: row.state as Filesystem["state"],
		createdAt: row.createdAt,
	}));

	// Mount each filesystem; collect the ones that succeed.
	const mounted: Filesystem[] = [];
	for (const filesystem of fsList) {
		try {
			const result = await mounter.mount({ filesystem, sandboxPath, auth: null });
			if (result.success) {
				mounted.push(filesystem);
			} else {
				// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
				console.warn(
					`[session-provisioning] AO2 mount failed for filesystem ${filesystem.id}: ${result.error ?? "unknown"}`,
				);
			}
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(
				`[session-provisioning] AO2 mount threw for filesystem ${filesystem.id}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	return mounted;
}

/**
 * AO2 Hook B: Capture-back mounted filesystems before endSession/crashSession.
 *
 * Called BEFORE each endSession (which holds the rm -rf) and before crashSession
 * on the in-runSession crash path. Best-effort: a capture failure is logged but
 * never blocks teardown (uncommitted-but-failed = same loss as today).
 *
 * @lore AO2 §9: The delete lives in endSession (session-lifecycle.ts:341),
 * NOT workspace.destroy (adapter-map cleanup only, runs after the delete).
 * Anchoring capture "before workspace.destroy" would capture an already-deleted tree.
 * Must be called BEFORE endSession.
 */
export async function captureMountedFilesystems(
	sessionId: string,
	sandboxPath: string,
	mountedFilesystems: Filesystem[],
	mounter: FilesystemMounter,
): Promise<void> {
	if (mountedFilesystems.length === 0) return;

	for (const filesystem of mountedFilesystems) {
		try {
			await mounter.captureBack({ filesystem, sandboxPath, sessionId });
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(
				`[session-provisioning] AO2 captureBack threw for filesystem ${filesystem.id}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}

export interface ProvisionSessionDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly adapterPool: AdapterPool;
	readonly workspace: SandboxAdapter;
	/** X2: MCP bridge registry. When present, a bridge is created per session. */
	readonly mcpBridgeRegistry?: McpBridgeRegistry;
	/** X2: Base URL for MCP bridge (e.g., "http://localhost:3001"). */
	readonly mcpBaseUrl?: string;
	/**
	 * AN2: Already-constructed ServiceConnectionResolver (encapsulates serverSecret).
	 * When present, held connections are provisioned into the session sandbox.
	 * Mirrors the mcpBridgeRegistry? optional pattern: absent → graceful no-op.
	 *
	 * @lore AN2: No serverSecret? field here — the resolver encapsulates the secret.
	 * Threading the raw secret would open a second decryption path against
	 * concept hard-rule 3 (W2). The already-constructed resolver at app.ts:416
	 * is the ONLY secret-bearing path.
	 */
	readonly serviceConnectionResolver?: Pick<
		import("@hyperidle/connections").ServiceConnectionResolver,
		"resolve"
	>;
	/**
	 * AR2: optional observation hook, fired once after the agent's turn fully
	 * drains and the sandbox is completely written, BEFORE teardown deletes it
	 * (`endSession`'s `fs.promises.rm` at session-lifecycle.ts:341). Observes
	 * only — it cannot pause, defer, or cancel teardown, which runs unconditionally
	 * afterward even if this callback throws. Absent → no-op (every production
	 * caller omits it). Lets a harness integration test read the real files a real
	 * agent produced before deletion.
	 *
	 * Mirrors the existing optional `onHarnessStarted` callback (post-start twin).
	 * This is the post-drain / pre-teardown twin.
	 *
	 * @lore AR2: The seam fires AFTER `adapterPool.release` (drain try/finally,
	 * ~line 1095) and BEFORE the `if (crashed)` teardown dispatch (~line 1137).
	 * That is the unique point both AFTER the agent finished writing (stop done,
	 * drain done) AND BEFORE anything deletes the sandbox. It precedes all four
	 * teardown branches (completed / not_returned / budget_exhausted / crashed),
	 * so exactly one fire per run regardless of outcome.
	 *
	 * @lore AR2 crash-path note: on the crash path `crashSession` does NOT delete
	 * the sandbox (session-lifecycle.ts:415–416, "knowledge preserved for debugging").
	 * The seam fires anyway for consistency, but the sandbox would survive crash
	 * teardown regardless. For completed/not_returned/budget_exhausted the seam is
	 * the ONLY pre-deletion window.
	 */
	readonly onBeforeTeardown?: (ctx: BeforeTeardownContext) => void | Promise<void>;
	/**
	 * Optional observation hook fired after prompt/context/MCP/hook files are written
	 * and before `harness.startSession`. Returning "abort" stops before spawning
	 * the external harness and continues through normal teardown. Production callers
	 * omit this; it exists for harness-facing integration tests that validate the
	 * prepared sandbox and binary config surfaces without making an LLM call.
	 */
	readonly onBeforeHarnessStart?: (
		ctx: BeforeHarnessStartContext,
	) => void | "abort" | Promise<void | "abort">;
	/**
	 * Optional observer fired after `harness.startSession` succeeds.
	 * Production callers use the explicit `runSession` callback path; this dep-level
	 * hook lets provisionSession-based integration tests prove an abort stopped
	 * before the external harness session started.
	 */
	readonly onHarnessStarted?: () => void;
	/**
	 * AO2: Optional mounter for filesystem placement + capture-back.
	 * When absent, sessions run without any filesystem mount (degrade to today's behavior).
	 * When present, mount runs after sandbox spawn (Phase 4.5) and captureBack runs before
	 * each endSession/crashSession call.
	 *
	 * @lore AO2 §9: mount BEFORE context assembly (so .git/info/exclude is written before
	 * assembly drops scaffolding); captureBack BEFORE endSession (which holds the rm -rf),
	 * not before workspace.destroy (adapter-map cleanup only, after the delete).
	 */
	readonly mounter?: import("@hyperidle/shared").FilesystemMounter;
}

export interface ProvisionSessionParams {
	readonly taskId: string | null;
	readonly agentId: string;
	/** @lore U1: field name kept for backward compat; value is now a teams.id (formerly products.id). */
	readonly productId: string;
	readonly sandboxBasePath: string;
	readonly factoryCap?: number;
	readonly factorySpend?: number;
	readonly reviewThreadId?: string;
	readonly modelTier?: ModelTier;
	/**
	 * X4: Resolved model from the gateway. When present, passed through to the
	 * harness adapter via SessionConfig so the adapter uses the correct provider,
	 * model, and API key.
	 *
	 * @lore X4 A-IMP-1: Resolution happens in sessions-routes.ts (where
	 * credentialResolver is available). ProvisionSessionParams receives the
	 * already-resolved value so session-provisioning.ts stays gateway-unaware.
	 */
	readonly resolvedModel?: import("@hyperidle/shared").ResolvedModel;
	/**
	 * X6: Resolved fast-tier model for builtin harness summarization.
	 * Optional — when absent the builtin harness uses resolvedModel for all LLM
	 * calls including summarization (slightly higher cost, functionally equivalent).
	 */
	readonly resolvedFastModel?: import("@hyperidle/shared").ResolvedModel;
	readonly requestContext?: {
		readonly requestId: string;
		readonly sourceKind: AgentSessionSourceKind;
		readonly sourceId: string;
		readonly sourceCorrelation: AgentSessionSourceCorrelation;
		readonly triggerPromptOverride?: string;
	};
	/**
	 * AA2: When set, this session is a routine session. The provisioning orchestrator
	 * will use routine context (buildRoutineSessionContextData + composeRoutinePrompt)
	 * instead of task/bet context, and will populate sessions.routineId.
	 *
	 * @lore AA2: routineId is optional — normal task sessions omit it. When present,
	 * context assembly switches to the routine path which reads from the routines
	 * table rather than tasks/bets. AU1 made sessions.taskId nullable, so routine
	 * sessions no longer fabricate task rows.
	 */
	readonly routineId?: string;
	/**
	 * AL7 Task 6: When set, the registry invoke router participates in the
	 * trust-first review workflow for this session.
	 *
	 * - Session 1 (open-work): route irreversible calls to review + capture.
	 * - Session 2 (grant-bearing): permit the approved op (CAS-consume grant)
	 *   and route other irreversible calls to a fresh review.
	 *
	 * Absent for sessions that don't participate in the workflow (normal sessions,
	 * routine sessions, assistant turns, extraction drains).
	 *
	 * @lore AL7 Task 6: the workflow is injected here (server-side) rather than
	 * in SessionConfig (shared) because `reviewMessageId`/`subjectThreadId`/
	 * `artifactId` are server-side capture anchors that don't belong in the shared
	 * harness interface (concept rejection #8).
	 */
	readonly sessionWorkflow?: RegistrySessionWorkflow;
	/**
	 * AR4a: When set, this session is a CONVERSATIONAL-mode turn (the assistant
	 * replying to a thread message). Context assembly switches to the conversation
	 * branch — thread transcript is delivered via the assembled prompt / AGENTS.md
	 * so every harness receives it. AU1 made these task-free sessions first-class.
	 *
	 * `draftRegistry` is the caller-supplied draft tool surface (AR4a↔AR4b seam —
	 * §3b). AR4a's caller (`runAssistantTurn`) populates it directly from
	 * `buildAssistantDraftRegistry`; AR4b later reroutes that one call site to the
	 * strategy formation answer. `provisionSession` forwards it to `buildToolRegistry`
	 * without reaching into the builder — the seam is isolated to the caller.
	 *
	 * @lore AR4a: The result's null `taskId` is expected in conversational mode —
	 * the caller (`runAssistantTurn`) reads `conversationalReply` + `sessionId`
	 * + `outcome` for notice mapping.
	 *
	 * @lore AR4a NIT-4: `messages` in the builtin sessionStartConfig is load-bearing
	 * for the builtin path — builtin routes to `runChatTurn` only when `messages` is
	 * non-empty (builtin-harness-adapter.ts:397). CLI harnesses receive the transcript
	 * via the assembled prompt (AGENTS.md) and ignore `messages`. Both channels are
	 * populated; the builtin channel is the correctness gate for the builtin lane.
	 */
	readonly conversational?: {
		/** The thread the assistant is replying in. */
		readonly threadId: string;
		/** The assistant agent id (ast-${userId}). */
		readonly assistantAgentId: string;
		/**
		 * Caller-supplied draft tool surface (AR4a↔AR4b seam, §3b).
		 * Populated by `buildAssistantDraftRegistry` in AR4a; rerouted to the
		 * strategy formation answer in AR4b. Forwarded to `buildToolRegistry`
		 * as `extraDraftTools`; the registry forwards them alongside the role tools.
		 * When absent, no draft tools are added (non-conversational sessions).
		 */
		readonly draftRegistry: import("../tools/tool-registry.js").ToolRegistry;
		/**
		 * Conversation messages for the builtin adapter's `runChatTurn` path.
		 * Load-bearing for builtin (NIT-4): builtin routes to runChatTurn only
		 * when messages is non-empty; if absent builtin falls into the task
		 * planning loop and produces garbled output.
		 */
		readonly messages: import("@hyperidle/shared").ConversationMessage[];
		/**
		 * AR4b: Strategy formation answer — persona override for this turn.
		 * null = no override; use the agent row's systemPrompt as-is.
		 * undefined = not set by caller (pre-AR4b callers; treated as no override).
		 *
		 * @lore AR4b: The persona at turn time comes from the active strategy's
		 * formAssistant() answer (concept §4 formation seam). It overrides the
		 * agent row's systemPrompt for the assembled prompt / AGENTS.md of this
		 * turn ONLY — the row is not mutated. null = "Minimal strategy: no override."
		 */
		readonly systemPromptOverride?: string | null;
	};
}

export interface ProvisionSessionResult {
	readonly sessionId: string;
	/** AA3: widened to include "budget_exhausted" for per-run cap enforcement. */
	readonly outcome: SessionOutcome | "budget_exhausted";
	readonly totalCostCents: number;
	readonly taskId: string | null;
	/**
	 * AL6: Return-gate verdict for this session run. Present on all task-session
	 * outcomes ("returned" | "not_returned"). Absent (undefined) on assistant
	 * turns and extraction drains which use different provisioning paths.
	 *
	 * "returned"     — turn ended with a member of RETURN_ACTION_NAMES, or was
	 *                  exempt (crashed/stopped/budget_exhausted).
	 * "not_returned" — turn completed normally without a return action; a
	 *                  session_not_returned event was emitted on the bus.
	 */
	readonly returnVerdict?: "returned" | "not_returned";
	/**
	 * AL6 v3: Unified turn-level force injection count. Present on all task-session
	 * outcomes. Equals:
	 *   loopForceCount (Layer-B re-engages) + adapter.getForceReturnCount?.(sessionId) (Layer-A native-hook count).
	 *
	 * For external adapters (cli/isolated/remote): = loopForceCount (Layer-B loop).
	 * For builtin/SDK (Layer-A fast-path): = harness.getForceReturnCount (in-turn injections).
	 * The two layers are mutually exclusive per turn (Layer A resolves in-turn → loop never fires; vice versa).
	 *
	 * Zero when no forcing was needed (agent returned on the first run).
	 */
	readonly forceReturnCount: number;
	readonly metrics?: SessionMetrics;
	/**
	 * AR4a: The agent's reply text for a CONVERSATIONAL-mode turn — the last
	 * non-empty `completion` event text from the drain. Present ONLY when
	 * `params.conversational` was set AND the session outcome is "completed".
	 * Absent (undefined) for task/routine sessions (byte-for-byte unchanged
	 * result contract) and for crashed/budget_exhausted/not_returned conversational
	 * turns (those map to a never-silent notice, not a fake reply).
	 *
	 * Mirrors the `returnVerdict?` optionality precedent.
	 *
	 * @lore AR4a WARNING-3: Blind `+=` accumulation DOUBLE-COUNTS on the claude
	 * stream-json dialect: `preMapClaudeEvent` emits assistant blocks as deltas
	 * AND restates the full answer in the terminal `result` line. We capture the
	 * LAST NON-EMPTY completion text instead of concatenating — the terminal
	 * `result` line overwrites the accumulated deltas with the correct full answer,
	 * which is correct for claude (last = final) and safe for all other dialects
	 * (builtin emits exactly one completion; codex/opencode emit the last reply
	 * as the final stdout line / step_finish).
	 */
	readonly conversationalReply?: string;
	/**
	 * AR4a: captured tool calls from the conversational turn (builtin: from the
	 * runChatTurn loop; CLI: not yet captured). Present only when the completion
	 * event carries toolCalls (i.e. the agent made tool calls). Absent for text-only
	 * replies and for task/routine sessions. Used by runAssistantTurn to persist
	 * toolCalls on the reply message so resolveCurrentDraftBetId can rebind on turn 2.
	 */
	readonly conversationalToolCalls?: readonly import("@hyperidle/shared").CapturedToolCall[];
}

/**
 * AF7 §2: The synchronous result of admission (phases 1-7). Carries everything
 * `runSession` (phases 8-11) needs to run the harness and tear down. Produced by
 * `admitSession` AFTER the session row is committed and `session_started` emitted.
 */
export interface AdmittedSession {
	readonly sessionId: string;
	readonly sessionContext: SessionContext;
	readonly agentRole: UserRole;
	readonly teamId: string | undefined;
	readonly systemPromptText: string;
	readonly modelTier: ModelTier;
	readonly sandboxHandle: SandboxHandle;
	readonly sandboxPath: string;
	/** AK2: was `watcher: FileWatcher` — renamed to `ingestion: IngestionHandle` as part of Strategy port decoupling. */
	readonly ingestion: IngestionHandle;
	readonly selectedAdapter: SelectedEntry;
	readonly harness: HarnessAdapter;
	readonly adapterId: string;
	readonly routinePerRunCap: number | null;
	/**
	 * AO2: Filesystems that were successfully mounted in Phase 4.5 for this session.
	 * Empty when no mounter is configured or no filesystems are injected for the agent.
	 * Consumed by the Hook B capture-back helper before each endSession/crashSession call.
	 *
	 * @lore AO2 §9: Resolved at admit time to avoid a second DB query at teardown.
	 * Only successfully-mounted filesystems are included — failed mounts (cloud-not-built,
	 * malformed) are logged as warnings and excluded; the session continues without them.
	 */
	readonly mountedFilesystems: import("@hyperidle/shared").Filesystem[];
}

/**
 * AF7 §2 — Admit a session synchronously (phases 1-7).
 *
 * Runs the HTTP-observable prefix: load agent, cost pre-flight (P2), adapter
 * select + concurrency check (P3), **resolvedModel presence guard (WARNING-2,
 * pre-P5)**, task transition, workspace spawn (P4), session row insert (P5),
 * context assembly (P6), start watcher (P7), emit `session_started`. ALL admission
 * failures (CostCapExceeded 422 / ConcurrencyLimit 429 / MissingCredential 500)
 * throw BEFORE the P5 row insert — the detach boundary — so they map to HTTP
 * status on the POST path and never leave a doomed row.
 *
 * @lore AF7 §2: the resolvedModel presence guard lives here (not at P9
 * `harness.startSession`) so that in local mode (no credentialResolver) a missing
 * resolved model for a builtin adapter surfaces as a synchronous 500 on the POST
 * path, NOT as a later `state=crashed` from the detached tail. Throwing
 * MissingCredentialError pre-insert keeps the honest contract: no row inserted,
 * harness never started.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: admission coordinates multi-phase pre-flight with error handling
export async function admitSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
	/**
	 * AF7 §2: enforce the synchronous resolvedModel-presence guard for builtin
	 * adapters. Set ONLY on the HTTP POST path (startSessionProvision) so a missing
	 * resolved model maps to a 500 + no row. The dispatcher path leaves it false: a
	 * missing credential there is unrecoverable-PER-TASK (the dispatcher drops the
	 * task), not an HTTP error — and dispatcher fixtures legitimately run
	 * builtin-typed stub adapters that do not require a resolved model.
	 */
	enforceResolvedModelGuard = false,
): Promise<AdmittedSession> {
	const { db, eventBus, adapterPool, workspace } = deps;

	// ── Phase 1: load agent
	const agent = await getUserById(db, params.agentId);
	if (!agent) {
		throw new Error(`Agent not found: ${params.agentId}`);
	}
	const agentRole = agent.role;
	const teamId = agent.teamId ?? undefined;

	// X3: Read system prompt inline from DB column. No file read required.
	const systemPromptText = agent.systemPrompt ?? "";

	// X3: Model tier priority: explicit param > agent preference > default "workhorse".
	// Runtime validation: modelTierPreference is a text column — validate before casting.
	// Uses MODEL_TIERS from @hyperidle/shared to avoid duplicating the canonical list.
	const rawPreference = agent.modelTierPreference;
	const agentPreference =
		rawPreference !== null &&
		rawPreference !== undefined &&
		(MODEL_TIERS as readonly string[]).includes(rawPreference)
			? (rawPreference as ModelTier)
			: null;
	const modelTier: ModelTier = params.modelTier ?? agentPreference ?? "workhorse";

	// ── Phase 2: cost cap pre-flight. Throws before any DB writes.
	const capResult = await checkCostCap(db, eventBus, {
		agentId: params.agentId,
		teamId,
		factoryCap: params.factoryCap,
		factorySpend: params.factorySpend,
	});
	if (!capResult.allowed) {
		throw new CostCapExceededError(
			capResult.level === "factory"
				? "factory"
				: capResult.level === "team"
					? (teamId ?? "team")
					: params.agentId,
			capResult.currentSpend ?? 0,
			capResult.cap ?? 0,
		);
	}

	// ── Phase 3: adapter selection + concurrency check + task transition.
	// Adapter selection MUST come before task transition: if no adapter is
	// available we should not strand the task in `in_progress`.
	// X3: Pass harnessType to select() so the pool filters by agent preference.
	// When agent.harnessType is null, all adapters are eligible (backward compat).
	// AH2: Pass modelProviders when agent has a per-agent modelProvider so the pool
	// enforces cross-axis harness↔provider compatibility (ARCH-1). An agent whose
	// only registered harness cannot serve its provider gets NoEligibleHarnessError
	// instead of silently picking a provider-incompatible adapter.
	// AM4 CHANGE 1 (Seam 1 caller side): read harnessDisabled from server_config and
	// pass as disabledTypes to select(). The pool is DB-free + select() is synchronous
	// so the caller must supply the set. db is already in deps (line 276).
	const { harnessDisabled } = await readServerConfig(db);
	const selectRequirements = {
		harnessType: agent.harnessType ?? undefined,
		...(agent.modelProvider ? { modelProviders: [agent.modelProvider] as readonly string[] } : {}),
		disabledTypes: harnessDisabled as readonly string[],
	};
	const selectedAdapter = adapterPool.select(selectRequirements);
	if (!selectedAdapter) {
		// AH2: If the agent has a harnessType configured, throw NoEligibleHarnessError
		// (no registered adapter of that type can serve this agent's provider).
		// Otherwise fall back to a generic capacity error.
		if (agent.harnessType) {
			throw new NoEligibleHarnessError(agent.harnessType);
		}
		throw new Error(
			`No available adapter in pool — all adapters are at capacity${agent.harnessType ? ` (harnessType: ${agent.harnessType})` : ""}`,
		);
	}
	const harness = selectedAdapter.adapter;
	const adapterId = selectedAdapter.id;

	// @lore AU9: request-mediated admission (runClaimedRequest) already reserved/
	// adopted this exact request's session via reserveOrAdoptSession BEFORE this
	// concurrency check runs. Counting it here would make every request-mediated
	// admission count its OWN just-reserved session against its own limit — an
	// off-by-one that permanently self-blocks any agent at the default
	// maxConcurrentSessions=1. Exclude the request's own correlated session.
	const activeCountWhere = params.requestContext
		? and(
				eq(sessions.agentId, params.agentId),
				eq(sessions.state, "active"),
				// NULL requestId rows must still count — `ne` alone would exclude them
				// under SQL three-valued logic, silently under-counting concurrency.
				or(isNull(sessions.requestId), ne(sessions.requestId, params.requestContext.requestId)),
			)
		: and(eq(sessions.agentId, params.agentId), eq(sessions.state, "active"));
	const [activeCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(sessions)
		.where(activeCountWhere)
		.limit(1);
	if ((activeCount?.count ?? 0) >= agent.maxConcurrentSessions) {
		adapterPool.release(adapterId);
		throw new ConcurrencyLimitError(params.agentId, agent.maxConcurrentSessions);
	}

	// AF7 §2 (WARNING-2): resolvedModel presence guard — synchronous, pre-P5.
	// The builtin adapter requires a resolved model and throws "resolvedModel is
	// required" at P9 startSession. Under the detached run tail that throw would
	// land in crashSession (state=crashed) instead of an HTTP 500. We check here,
	// before the row insert and before detach, so a missing credential in local
	// mode (no credentialResolver ⇒ resolvedModel undefined) maps to a 500
	// MISSING_CREDENTIAL on the POST path with NO session row and harness never
	// started. We release the adapter slot reserved by select() before throwing.
	if (
		enforceResolvedModelGuard &&
		selectedAdapter.meta.type === "builtin" &&
		!params.resolvedModel
	) {
		adapterPool.release(adapterId);
		throw new MissingCredentialError(
			`anthropic_api_key (required for builtin harness, tier: ${modelTier}) — set it in Settings > Models`,
		);
	}

	// AD2: Only transition if not already in_progress (handoff re-dispatch path).
	// When a handoff assigns a new ownerAgentId, the task stays in_progress.
	// provisionSession is re-called for the new owner — transitionTask would
	// throw InvalidTransitionError for in_progress → in_progress.
	// @lore AD2: The guard is additive — normal callers (sessions-routes) always
	// start from accepted, so the SELECT adds negligible overhead. The safety
	// barrier is the hasActiveSession check in the dispatcher, not this guard.
	if (params.taskId) {
		const taskForTransition = await work.getTaskById(db, params.taskId);
		if (taskForTransition && taskForTransition.state !== "in_progress") {
			await transitionTask(db, eventBus, params.taskId, "in_progress", {
				workIntents: { record: recordAgentWorkIntent },
			});
		}
	}

	// ── Phases 4-7 (wrapped): spawn workspace → insert session row →
	// context assembly → start watcher. If any step throws before the session row
	// is committed AND before the harness starts, we revert the task back to
	// `accepted` so a transient failure (disk full, path collision, EMFILE)
	// does not permanently strand the task in `in_progress`.
	let sessionId: string;
	let sandboxHandle: SandboxHandle;
	let sandboxPath: string;
	let ingestion: IngestionHandle;
	let mountedFilesystems: Filesystem[] = [];
	try {
		// ── Phase 4: spawn sandbox via adapter.
		sandboxHandle = await workspace.spawn(params.sandboxBasePath);
		sandboxPath = sandboxHandle.path;

		// ── Phase 5: insert session row.
		const [reservedSession] = params.requestContext
			? await db
					.select()
					.from(sessions)
					.where(eq(sessions.requestId, params.requestContext.requestId))
					.limit(1)
			: [undefined];
		sessionId = reservedSession?.id ?? randomUUID();
		const startedAt = new Date().toISOString();
		const sessionValues = {
			id: sessionId,
			taskId: params.taskId,
			...(params.requestContext
				? {
						requestId: params.requestContext.requestId,
						sourceKind: params.requestContext.sourceKind,
						sourceId: params.requestContext.sourceId,
						sourceCorrelationJson: JSON.stringify(params.requestContext.sourceCorrelation),
					}
				: {}),
			agentId: params.agentId,
			modelTier,
			startedAt,
			state: "active",
			sandboxSnapshot: sandboxPath,
			// AA2: populate routineId when this is a routine session.
			...(params.routineId ? { routineId: params.routineId } : {}),
		};
		if (reservedSession) {
			await db
				.update(sessions)
				.set({ ...sessionValues, id: undefined })
				.where(eq(sessions.id, reservedSession.id));
		} else {
			await db.insert(sessions).values(sessionValues);
		}

		// ── Phase 4.5: mount injected filesystems (AO2).
		// Runs AFTER sandbox spawn (sandboxPath known) and BEFORE context assembly
		// so .git/info/exclude is written before assembly drops scaffolding into the dir.
		// A filesystem-less session (no mounter, no injections) → empty list, no-op.
		// @lore AO2 §9: mount before assembleContext (scaffolding-exclusion order).
		if (deps.mounter) {
			mountedFilesystems = await mountFilesystemsForAgent(
				db,
				params.agentId,
				sandboxPath,
				deps.mounter,
			);
		}

		// ── Phase 6: assemble context into the sandbox through the agent layer.
		if (params.taskId) {
			await assembleAgentContext({
				db,
				sandboxPath,
				sessionId,
				taskId: params.taskId,
				agentId: params.agentId,
				agentRole,
				teamId: params.productId,
				isRoutine: !!params.routineId,
				sourceKind: params.requestContext?.sourceKind ?? null,
				sourceId: params.requestContext?.sourceId ?? null,
				sourceCorrelation: params.requestContext?.sourceCorrelation ?? null,
			});
		} else if (params.requestContext) {
			await assembleAgentContext({
				db,
				sandboxPath,
				sessionId,
				taskId: null,
				agentId: params.agentId,
				agentRole,
				teamId: params.productId,
				isRoutine: !!params.routineId,
				sourceKind: params.requestContext.sourceKind,
				sourceId: params.requestContext.sourceId,
				sourceCorrelation: params.requestContext.sourceCorrelation,
			});
		}

		// ── Phase 7: begin writeback ingestion.
		const manifestPath = path.join(sandboxPath, ".fabric/manifest.json");
		ingestion = beginAgentWriteback({
			sandboxPath,
			sessionId,
			manifestPath,
			// AU19 Increment 3f: §10.3 line 517's pure-inversion — the watcher
			// emits `sandbox_writeback_changes_detected` on this EventBus instead
			// of calling an injected writeback port; `@hyperidle/capture-writeback`'s
			// `registerCaptureWriteback` subscriber (wired at boot,
			// `server-factory.ts`) drives `processWriteback` itself.
			eventBus,
		});
	} catch (err) {
		const reason = `provisioning failed: ${err instanceof Error ? err.message : String(err)}`;
		if (params.taskId) {
			await revertTaskToAccepted(db, eventBus, params.taskId, reason);
		}
		throw err;
	}

	// Emit session_started now that the workspace is ready.
	eventBus.emit({
		type: "session_started",
		streamId: sessionId,
		sessionId,
		agentId: params.agentId,
		taskId: params.taskId,
		...(params.requestContext
			? {
					requestId: params.requestContext.requestId,
					sourceKind: params.requestContext.sourceKind,
					sourceId: params.requestContext.sourceId,
					sourceCorrelation: params.requestContext.sourceCorrelation,
				}
			: {}),
		timestamp: Date.now(),
	});

	const sessionContext: SessionContext = {
		sessionId,
		agentId: params.agentId,
		taskId: params.taskId,
		...(params.requestContext ? { requestContext: params.requestContext } : {}),
		sandboxPath,
		ingestion,
		// @lore AF4/§5: traceId correlates observability events for this session
		// (H3). The provisioning path owns the session, so it mints the id (the
		// crash/end consumers key events on it). Behaviour-neutral — previously the
		// field was simply absent (the path quarantined under the type gate).
		traceId: randomUUID(),
		// AA2: pass routineId so endSession/crashSession can update routine_runs.
		...(params.routineId ? { routineId: params.routineId } : {}),
	};

	// AA3: Read per-run cost cap once at admission time for routine sessions.
	// Non-routine sessions always get null (no cap to check).
	let routinePerRunCap: number | null = null;
	if (params.routineId) {
		const routineRow = await routineService.getRoutineById(db, params.routineId);
		routinePerRunCap = routineRow?.costCapPerRunMinor ?? null;
	}

	return {
		sessionId,
		sessionContext,
		agentRole,
		teamId,
		systemPromptText,
		modelTier,
		sandboxHandle,
		sandboxPath,
		ingestion,
		selectedAdapter,
		harness,
		adapterId,
		routinePerRunCap,
		mountedFilesystems,
	};
}

/**
 * AF7 §2 — Run an admitted session (phases 8-11).
 *
 * Builds the session-scoped tool registry, composes the prompt, starts the
 * harness (P9), drains the event stream (P10), and tears down (P11). Normal
 * completion calls `endSession`; an error mid-stream calls `crashSession`.
 *
 * Registers itself in the `sessionRunRegistry` (AF7 §4/§5) at harness-start so a
 * PATCH/handoff can cooperatively abort it, and deregisters at teardown. The
 * abort signal flips a local `aborted` flag the event loop checks each iteration
 * (secondary, non-builtin) while `stopSession` halts builtin's internal loop
 * (primary — wired through the registry's abort()).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: run coordinates harness lifecycle, event-stream consumption, abort, and teardown
export async function runSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
	admitted: AdmittedSession,
	/**
	 * AF7 §2: fired exactly once right after `harness.startSession` resolves
	 * (success OR failure). `startSessionProvision` awaits this so the HTTP POST
	 * returns AFTER the harness has started (the test-observable "startSession was
	 * called") but BEFORE the long event-stream drain (P10) completes. The
	 * dispatcher/await callers omit it.
	 */
	onHarnessStarted?: () => void,
): Promise<ProvisionSessionResult> {
	const {
		db,
		eventBus,
		adapterPool,
		workspace,
		mcpBridgeRegistry,
		mcpBaseUrl,
		serviceConnectionResolver,
	} = deps;
	const {
		sessionId,
		sessionContext,
		agentRole,
		teamId,
		systemPromptText,
		modelTier,
		sandboxHandle,
		sandboxPath,
		ingestion,
		selectedAdapter,
		harness,
		adapterId,
		routinePerRunCap,
		mountedFilesystems,
	} = admitted;

	// AF7 §5: cooperative abort flag for non-builtin adapters (the provisioning
	// event loop checks this each iteration). For builtin the real stop is
	// stopSession (wired via sessionRunRegistry.abort), which halts its internal
	// loop where builtin tools actually execute.
	let aborted = false;

	// ── Phase 8: build tool registry bound to this context.
	// @lore AK2 §5a: toolContext no longer carries a `watcher` field — the IngestionHandle
	// is not a ToolContext concern. Tools that previously used watcher.stop() go through
	// the session teardown paths (endSession/crashSession) which hold sessionContext.
	//
	// @lore AL7 Task 6: `onAbortSession` wires the workflow router's abort trigger
	// to `sessionRunRegistry.abort` so that when session 1 routes an irreversible call
	// to review, it terminates the harness (sessions aren't pausable). The abort is
	// async but we fire-and-forget here — the harness receives a stop signal; the
	// provisioning drain's `aborted` flag is the secondary cooperative break.
	const toolContext: ToolContext = {
		db,
		eventBus,
		agentId: params.agentId,
		sessionId,
		taskId: params.taskId ?? "",
		teamId,
		...(params.requestContext ? { requestContext: params.requestContext } : {}),
		sandboxPath,
		ingestion,
		// AL7 Task 6: inject abort callback so the workflow router can end session 1
		// after capturing the first irreversible call. Fire-and-forget is intentional:
		// the abort is best-effort (sessions aren't pausable); the router already
		// returned AWAITING_REVIEW before calling this.
		onAbortSession: params.sessionWorkflow
			? (abortedSessionId) => {
					void sessionRunRegistry.abort(abortedSessionId).catch(() => {
						// Non-fatal: the harness may have already exited.
					});
				}
			: undefined,
	};
	// AR4a §3b seam: in conversational mode, forward the caller-supplied draft tool
	// surface into the registry. The draft tools (create_bet, edit_bet) are extracted
	// from the caller-built ToolRegistry and injected as extraTools alongside the
	// return-status tool. The seam is isolated to the call site — provisionSession
	// never reaches into the builder directly (AR4b reroutes this in runAssistantTurn).
	const conversationalDraftTools = params.conversational?.draftRegistry.definitions ?? [];
	// @lore AR4a: Conversational mode uses ONLY [draftTools + return-status] — no role tools.
	// Role tools for "assistant" include submit_review (an all-role tool registered without
	// a roles filter). submit_review is a return action; the builtin adapter's force-return
	// check (hasReturnActionInRegistry in runChatTurn) fires when it is in toolDefs, re-seeding
	// toolIterations past MAX_TOOL_ITERATIONS and creating extra bets/side-effects.
	// Fix: pass role:"__conversational__" — a sentinel that matches NO entry in
	// ALL_TOOL_DEFINITIONS (UserRole is an open string). roleFiltered = []. Only
	// conversationalDraftTools + returnStatusTool appear in definitions/toolDefs.
	// Task/routine sessions are unaffected (they don't pass params.conversational).
	const registry = params.conversational
		? buildToolRegistry(toolContext, {
				role: agentRole,
				// @lore AR4a: useOnlyExtraTools=true suppresses roleFiltered so submit_review
				// (and all other all-role tools) are excluded from conversational toolDefs.
				// Without this, the builtin adapter's force-return check sees submit_review
				// (a return action) in toolDefs, re-seeding toolIterations past MAX_TOOL_ITERATIONS.
				// Conversational turns are compliant-by-construction; submit_review is irrelevant.
				useOnlyExtraTools: true,
				// @lore AR4a: returnStatusTool first (return gate bridge), draft tools after.
				// The builtin adapter reads toolDefs for force-return check + callLlm tool specs.
				extraTools: [
					returnStatusTool.forRegistry(enforcementRegistry),
					...conversationalDraftTools,
				],
				// No sessionWorkflow for conversational turns (AR4a: no review gate for chat).
			})
		: buildToolRegistry(toolContext, {
				role: agentRole,
				// AL6 v4-final: inject hyperidle_return_status as a per-session tool.
				extraTools: [returnStatusTool.forRegistry(enforcementRegistry)],
				// AL7 Task 6: thread the session workflow into the registry so the invoke
				// router classifies reversibility, routes irreversible calls to review, and
				// permits the approved op (CAS-consume grant) on the grant-bearing session.
				sessionWorkflow: params.sessionWorkflow,
			});

	// ── Phase 8.5a: inject registry into builtin harness before startSession.
	//
	// @lore X6: The builtin harness executes tools internally (inside the agent
	// loop) rather than emitting tool_call events for the provisioning orchestrator
	// to invoke. setSessionToolRegistry() pre-registers the session-scoped registry
	// so the harness can call it when the loop starts. This call is guarded by
	// meta.type === "builtin" — external harnesses (claude CLI adapter, codex, etc.)
	// receive the registry indirectly via MCP bridge (X2), not via this method.
	if (selectedAdapter.meta.type === "builtin" && harness instanceof BuiltinHarnessAdapter) {
		harness.setSessionToolRegistry(sessionId, registry);
	}

	// ── Phase 8.5: compose prompt and write CLAUDE.md.
	//
	// @lore X1: spec says "written during Phase 6 (context assembly)" but we
	// place it here because the composed prompt requires tool definitions from
	// Phase 8. The spec's intent (CLAUDE.md exists before harness start) is
	// preserved — Phase 8.5 runs before Phase 9 (harness start).
	//
	// @lore AA2: When params.routineId is set, use routine context assembly
	// (buildRoutineSessionContextData + composeRoutinePrompt) instead of task/bet
	// context. No task row is required.

	const toolSummaries: ToolSummary[] = toolsForRole(agentRole).map((d) => ({
		name: d.name,
		description: d.description,
	}));

	/** AR4a: true only in conversational mode — gates the reply-capture drain branch. */
	const isConversational = !!params.conversational;
	/** AR4a NIT-4: messages for the builtin chat path (load-bearing for builtin). */
	let conversationalMessages: ConversationMessage[] | undefined;

	const effectiveSystemPromptText =
		params.requestContext?.triggerPromptOverride ?? systemPromptText;

	let assembledPrompt: string;
	if (params.conversational) {
		// AR4a: Conversational mode — assemble thread transcript as the system prompt.
		// The transcript reaches the model via the assembled prompt / AGENTS.md so
		// every harness reads it. The builtin adapter additionally receives `messages`
		// so it routes to `runChatTurn` (NIT-4 — load-bearing for builtin correctness).
		//
		// @lore AR4b: composeAssistantPrompt uses the strategy formation persona when
		// provided (systemPromptOverride), falling back to the agent row's systemPrompt.
		// null override = "Minimal Strategy, no persona knowledge" = use agent row default.
		// The formation answer shapes the assembled prompt (AGENTS.md) at TURN TIME without
		// mutating the users row. This satisfies AC3: switching the strategy changes the
		// assistant's form on the NEXT turn.
		//
		// @lore AR4a: The toolSummaries passed here are for the role tools summary section.
		// Draft tool summaries are not explicitly listed in the prompt here — the agent
		// discovers them via the MCP bridge tool list (CLI) or the injected registry (builtin).
		const effectivePersona =
			params.conversational.systemPromptOverride !== undefined &&
			params.conversational.systemPromptOverride !== null
				? params.conversational.systemPromptOverride
				: effectiveSystemPromptText;
		const { composedPrompt } = composeAssistantPrompt(effectivePersona);
		// Use the caller-supplied messages (already loaded from DB by runAssistantTurn)
		conversationalMessages = params.conversational.messages;
		// Append conversation to the composed prompt for CLI harnesses (AGENTS.md channel)
		const transcriptSection =
			conversationalMessages.length > 0
				? "\n\n## Conversation\n" +
					conversationalMessages
						.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
						.join("\n")
				: "";
		assembledPrompt = composedPrompt + transcriptSection;
	} else if (params.routineId) {
		// Routine session: read routine + agent + team context (no task/bet).
		const routineContextData = await buildRoutineSessionContextData(db, {
			sessionId,
			routineId: params.routineId,
			agentId: params.agentId,
			agentRole,
			teamId: params.productId,
		});
		({ assembledPrompt } = await assembleRoutinePrompt({
			systemPromptText: effectiveSystemPromptText,
			context: routineContextData,
			tools: toolSummaries,
			sandboxPath,
		}));
	} else if (params.requestContext) {
		assembledPrompt = await assembleTaskFreePrompt(
			db,
			params,
			effectiveSystemPromptText,
			toolSummaries,
		);
	} else {
		// Normal task session: read task + bet + agent + team context.
		if (!params.taskId) {
			throw new Error("Task session provisioning requires taskId");
		}
		const sessionContextData = await buildSessionContextData(db, {
			sessionId,
			taskId: params.taskId,
			agentId: params.agentId,
			agentRole,
			productId: params.productId,
		});
		({ assembledPrompt } = await assemblePrompt({
			systemPromptText: effectiveSystemPromptText,
			context: sessionContextData,
			tools: toolSummaries,
			sandboxPath,
		}));
	}

	writeSandboxAgentsMd(sandboxPath, assembledPrompt);

	// Retrieve adapter capabilities once — used in Phase 8b (cliMcpDialect) and
	// Phase 8b-enforce (returnEnforcement) and later (interceptToolCalls).
	const adapterCapabilities = harness.getCapabilities();

	// ── Phase 8b: create MCP bridge (if registry is configured).
	//
	// @lore X2: Bridge creation is wrapped in a try/catch for graceful degradation.
	// If createMcpBridge fails (e.g. transport initialization error), the session
	// continues in event-stream fallback mode — the MCP bridge is optional
	// infrastructure, not required for a session to run. This matches the
	// architecture critique requirement: bridge failure must NOT propagate to
	// provisionSession and must NOT prevent the session from starting.
	//
	// The bridge is created BEFORE harness.startSession() so the token is written
	// to .mcp.json before the harness reads it at startup.
	//
	// @lore AO2 Lane-b: write an empty .mcp.json before the bridge block so that
	// harnesses using `--mcp-config .mcp.json --strict-mcp-config` (CLAUDE_CLI_CONFIG)
	// don't crash when no MCP bridge is configured. The bridge block overwrites it with
	// the real config when a bridge is available. An empty mcpServers object is safe:
	// claude accepts it and registers no MCP servers.
	const mcpJsonPath = path.join(sandboxPath, ".mcp.json");
	if (!fs.existsSync(mcpJsonPath)) {
		fs.writeFileSync(mcpJsonPath, JSON.stringify({ mcpServers: {} }, null, 2), "utf-8");
	}

	let mcpBridgeToken: string | undefined;
	/** AL7 delta: per-session MCP token env for CLI harnesses (codex: HYPERIDLE_MCP_TOKEN). */
	let mcpTokenEnv: Record<string, string> | undefined;
	if (mcpBridgeRegistry && mcpBaseUrl) {
		try {
			const bridge = await createMcpBridge({
				sessionId,
				registry,
				onToolCall: ({ toolName, args }) => {
					if (!isReturnAction(toolName, args as Record<string, unknown>)) return;

					returnGate.observe({
						type: "tool_call",
						toolName,
						args: args && typeof args === "object" ? (args as Record<string, unknown>) : {},
					});
					if (selectedAdapter.meta.type === "opencode") {
						aborted = true;
						setTimeout(() => {
							void sessionRunRegistry.abort(sessionId).catch(() => {
								// The harness may already have exited after the return action.
							});
						}, 0);
					}
				},
			});
			mcpBridgeRegistry.register(bridge);
			mcpBridgeToken = bridge.token;
			const mcpUrl = `${mcpBaseUrl}/api/mcp/${bridge.token}`;

			// Write .mcp.json to sandbox for claude auto-discovery (overwrites the empty stub).
			const mcpJsonConfig = {
				mcpServers: {
					hyperidle: {
						type: "http",
						url: mcpUrl,
					},
				},
			};
			fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpJsonConfig, null, 2), "utf-8");

			// ── AL7 delta: write per-binary MCP config for codex + opencode.
			//
			// The selected harness's cliMcpDialect (from HarnessCapabilities) declares
			// which config file format the binary reads. writeCliMcpConfig handles the
			// dialect-specific writing. The dialect knowledge lives ONLY here — no
			// per-backend branching in the router or registry.
			//
			// @lore AL7 Phase 8b: Mirrors claude's .mcp.json in the same Phase 8b block.
			// The codex tokenEnv (HYPERIDLE_MCP_TOKEN) is threaded into sessionStartConfig
			// so startSession can inject it outside the envAllowlist (N6).
			if (adapterCapabilities.cliMcpDialect) {
				const result = writeCliMcpConfig({
					dialect: adapterCapabilities.cliMcpDialect,
					sandboxPath,
					mcpUrl,
					token: bridge.token,
				});
				if (result.tokenEnv && Object.keys(result.tokenEnv).length > 0) {
					mcpTokenEnv = result.tokenEnv;
				}
			}
		} catch (bridgeErr) {
			// Bridge creation failed — continue in event-stream fallback mode.
			// mcpBridgeToken remains undefined; teardown will be a no-op.
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(
				`[session-provisioning] MCP bridge creation failed for session ${sessionId}; falling back to event-stream mode:`,
				bridgeErr,
			);
		}
	}

	// ── Phase 8b-connections: AN2 Connection provisioning (parallel to inbound bridge).
	//
	// Re-applies the owning human's active held connections into the session sandbox.
	// Gate-free: installs tools, steps out of the way. Re-applied every spawn from
	// the durable service_connections rows (idempotent — no provisioned state).
	//
	// Gated on serviceConnectionResolver being configured (optional dep, mirrors
	// the mcpBridgeRegistry? pattern for graceful no-op when unconfigured).
	//
	// The discriminator `selectedAdapter.meta.type === "claude-code"` is the resolved
	// adapter identity (confirmed at adapter-pool.ts:553). There is no `harnessType`
	// local in runSession scope — `selectedAdapter.meta.type` is the real discriminator
	// (W4 in the architecture critique).
	//
	// builtin is NOT a carrier: mcpSupport:false, in-process callLlm() loop, never
	// spawns a child, never reads mcpTokenEnv. A write here would be dead. See
	// @lore AN2 builtin-scoped-out in connection-provisioning.ts.
	//
	// @lore AN2 Phase8b-connections: This block runs AFTER the inbound bridge write
	// so the inbound .mcp.json already exists when claudeNative=true merges into it.
	// The merge is additive — the hyperidle entry is preserved.
	if (serviceConnectionResolver) {
		try {
			const { buildProvisioningPlan, applyProvisioningPlan, resolveOwningHumanUserId } =
				await import("@hyperidle/connections");
			// AU19 Increment 1h: `resolveOwningHumanUserId` now takes a `deps.users`
			// (Mechanism C) DI port instead of importing `@hyperidle/users` itself
			// (illegal inside a nested Service package) — wired here, the real
			// production composition point, to `@hyperidle/users`' real
			// `getFirstUserByKind` export (already imported above).
			const ownerId = await resolveOwningHumanUserId(db, { users: { getFirstUserByKind } });
			const plan = await buildProvisioningPlan({
				db,
				resolver: serviceConnectionResolver,
				userId: ownerId,
			});
			const { mcpTokenEnv: connEnv } = await applyProvisioningPlan({
				plan,
				sandboxPath,
				cliMcpDialect: adapterCapabilities.cliMcpDialect,
				claudeNative:
					adapterCapabilities.cliMcpDialect === undefined &&
					selectedAdapter.meta.type === "claude-code",
			});
			// Merge MCP token env from file-carrier (codex bearer_token_env_var) AND
			// env injections from plan (CLI-key: GH_TOKEN/GITHUB_TOKEN; convention carriers).
			// plan.envInjections is the sole carrier for CLI-key tokens — it never rides a
			// config file, so without this merge GH_TOKEN never reaches the spawned process.
			// @lore AN2 C2-fix: connEnv covers the codex/opencode MCP file-carrier tokens;
			// plan.envInjections covers CLI-key (GH_TOKEN) and convention (<SVC>_TOKEN) vars.
			// Both must be merged; only connEnv was merged before this fix.
			//
			// @lore AN2 C2-regression-exposure: this exact merge (two spreads, six lines) is
			// verified only by code-read + the real-harness tests reproducing the merge locally
			// in-test. No integration test calls provisionSession() through the real `app`
			// fixture and asserts a spawned child sees the injected env. Regression surface is
			// low (the merge is two spreads of well-typed plain objects) but if a refactor ever
			// splits this block, the CLI-key carrier silently breaks. A future hardening pass
			// should drive one provisionSession() integration spawn through the server `app`
			// fixture (codex or CLI-key session) and assert the child env carries the token.
			// Blocked on a lightweight "start a session and inspect its env" test harness that
			// the current integration fixture doesn't have.
			const mergedConnEnv: Record<string, string> = {
				...plan.envInjections,
				...connEnv,
			};
			if (Object.keys(mergedConnEnv).length > 0) {
				// Merge with inbound bridge token env (distinct var names prevent collision).
				mcpTokenEnv = { ...(mcpTokenEnv ?? {}), ...mergedConnEnv };
			}
		} catch (connErr) {
			// Connection provisioning failed — continue without external tools.
			// A missing tool is not a session-killer (concept hard-rule 1: no gate).
			// biome-ignore lint/suspicious/noConsole: graceful-degradation, matches inbound bridge :789
			console.warn(
				`[connection-provisioning] failed for session ${sessionId}; continuing without external tools:`,
				connErr,
			);
		}
	}

	// ── Phase 8b-enforce: provision the return-enforcement hook for this adapter.
	//
	// AL6 v4-final: called BEFORE startSession so the hook artifact exists when the
	// harness starts. Dispatches per the declared channel:
	//   "settings-claude" → writes .claude/settings.json Stop hook
	//   "settings-codex"  → writes .codex/hooks.json Stop hook
	//   "process-reengage"→ writes .opencode/plugins/return-signal.ts
	//   "sdk-inprocess", "builtin-loop", "none" → no-op (in-process or drain-floor)
	// @lore AL6 v4-final: modelConfig on this path. bridgeToken/mcpUrl come from the MCP
	// bridge (if available) or empty strings (process-reengage uses them for plugin content;
	// settings-* channels use them for the curl command in the hook).
	// adapterCapabilities is declared above Phase 8b (moved up for AL7 cliMcpDialect usage).
	await provisionReturnHook({
		sandboxPath,
		channel: adapterCapabilities.returnEnforcement,
		bridgeToken: mcpBridgeToken ?? "",
		mcpUrl: mcpBridgeToken && mcpBaseUrl ? `${mcpBaseUrl}/api/mcp/${mcpBridgeToken}` : "",
		forceBudget: AL6_MAX_FORCE_RETURNS,
	});

	// ── Phase 9-10: single startSession + drain (AL6 v4-final — Loop DELETED).
	//
	// v3 had a while(true) re-prompt loop + sandbox-file rewrite carrier.
	// v4-final: single startSession + drain. Return enforcement is provisioned
	// per-harness via provisionReturnHook (above). The drain-gate floor backstops all.
	//
	// One gate spans the entire session drain.
	// The adapter pool slot is held and released ONCE post-drain (W1).
	// onHarnessStarted fires once (W2).
	// sessionRunRegistry: registered once; deregistered post-drain.
	// session_ended: emitted ONCE at teardown.

	// AL6: One gate per session — all events observed by this gate.
	const returnGate = createReturnGate();

	// AL6 v4-final: register this session in the enforcement registry now that the
	// real gate exists. The returnStatusTool reads from this registry (ctx.sessionId → entry).
	// Exempt = internal-extraction drain (empty tools list → structurally cannot return)
	// OR conversational mode (compliant-by-construction: the reply IS the return artifact).
	//
	// @lore AR4a: Conversational turns are compliant-by-construction (concept §4.4) —
	// the turn's return is the persisted assistant reply row, not a tool call. The
	// return gate is exempt for conversational mode to prevent a spurious `not_returned`
	// outcome from the session drain (which evaluates the gate after the drain completes).
	// This mirrors the AL6 lore in the old assistant-turn.ts @lore AL6 comment.
	const exempt =
		isConversational ||
		isInternalExtractionDrain({ tools: toolsForRole(agentRole).map((d) => d.name) });
	enforcementRegistry.register(sessionId, { gate: returnGate, forceCount: 0, exempt });

	let totalCostCents = 0;
	let crashed = false;
	/** AA3: set to true when per-run cost cap is hit; breaks the event loop gracefully. */
	let budgetExhausted = false;
	/** L17: accumulated tokens by tier for the session's tokensJson column. */
	const accumulatedTokens: Partial<Record<ModelTier, TierTokenCount>> = {};

	// Shared session config fields across runs.
	const allowedToolNames = toolsForRole(agentRole).map((d) => d.name);
	// AL6 CRIT-2: thread returnHook into sessionStartConfig so SDK/builtin closures
	// and the process wrapper can reach the bridge URL + token. The enforcementRegistry
	// is the process singleton, accessible without threading — only the URL/token/budget
	// need to be threaded via SessionConfig.
	const returnHookConfig =
		mcpBridgeToken && mcpBaseUrl
			? {
					bridgeToken: mcpBridgeToken,
					mcpUrl: `${mcpBaseUrl}/api/mcp/${mcpBridgeToken}`,
					forceBudget: AL6_MAX_FORCE_RETURNS,
				}
			: undefined;
	const sessionStartConfig = {
		sessionId,
		sandboxPath,
		systemPromptPath: "", // @deprecated X3
		assembledPrompt,
		modelTier,
		tools: allowedToolNames,
		resolvedModel: params.resolvedModel,
		resolvedFastModel: params.resolvedFastModel,
		mcpConnectionInfo: mcpBridgeToken
			? { url: `${mcpBaseUrl}/api/mcp/${mcpBridgeToken}`, token: mcpBridgeToken }
			: undefined,
		returnHook: returnHookConfig,
		// AL7 CRITICAL-1: pass sessionWorkflow through to the harness adapter so
		// external observers (tests, external harnesses) can see which workflow mode
		// this session was provisioned with. The builtin adapter also has the workflow
		// embedded in the tool registry, but SessionConfig is the canonical observable.
		...(params.sessionWorkflow ? { sessionWorkflow: params.sessionWorkflow } : {}),
		// AL7 delta: thread per-session MCP token env var (codex: HYPERIDLE_MCP_TOKEN)
		// into SessionConfig so startSession can inject it outside the envAllowlist (N6).
		...(mcpTokenEnv ? { mcpTokenEnv } : {}),
		// AR4a NIT-4: messages is load-bearing for the builtin chat path — builtin
		// routes to runChatTurn only when messages is non-empty (builtin-harness-adapter.ts:397).
		// CLI harnesses ignore messages; they receive the transcript via AGENTS.md.
		...(conversationalMessages ? { messages: conversationalMessages } : {}),
	};

	// X5: Determine whether to intercept tool_call events from the stream.
	// Computed once — same across all loop runs (adapter capabilities are static).
	// adapterCapabilities already retrieved above for provisionReturnHook.
	const interceptToolCalls = !(adapterCapabilities.mcpSupport && mcpBridgeToken);

	let beforeHarnessStartError: unknown;
	try {
		const beforeHarnessStartResult = await deps.onBeforeHarnessStart?.({
			sessionId,
			sandboxPath,
			adapter: selectedAdapter,
			sessionConfig: sessionStartConfig,
		});
		if (beforeHarnessStartResult === "abort") {
			aborted = true;
		}
	} catch (err) {
		beforeHarnessStartError = err;
		aborted = true;
	}

	let harnessHandle: SessionHandle | null = null;
	let metrics: SessionMetrics | undefined;
	// AR4a: hoisted outside the try/finally so the completed return site (line ~1418)
	// can reference it. Stays "" for task/routine sessions (isConversational=false).
	let conversationalReplyText = "";
	// AR4a: tool calls captured from the last non-empty completion event.
	// Used to persist toolCalls on the reply message so resolveCurrentDraftBetId
	// can rebind on subsequent turns (transcript-based draft binding, AK4 §C).
	let conversationalToolCallsCapture:
		| readonly import("@hyperidle/shared").CapturedToolCall[]
		| undefined;

	// W1: try/finally ensures the adapter pool slot is ALWAYS released once, even
	// on errors. Released after the single run.
	//
	// @lore AL6 v4-final: The v3 while(true) re-prompt loop is DELETED. v4 uses a
	// single startSession + drain. Enforcement is provisioned per-harness via
	// provisionReturnHook (called in Phase 8b above). Blocking adapters enforce
	// in-turn via their native hook; no-block adapters use the process-wrapper
	// re-engage (cli-harness-adapter.ts). The drain-gate floor catches any escape.
	try {
		// ── Phase 9: start the harness session (exactly ONCE in v4).
		if (!aborted) {
			try {
				// Role-based tool authorization: facilitator-only tools are stripped
				// from builder/growth/brand_voice sessions. See G1 AC6.
				harnessHandle = await harness.startSession(sessionStartConfig);
			} catch {
				// startSession failed — treat as crash.
				crashed = true;
			}
		}

		if (harnessHandle) {
			// AF7 §4/§5: register once after harness starts.
			sessionRunRegistry.register(sessionId, {
				signalAbort: () => {
					aborted = true;
				},
				handle: harnessHandle,
				adapter: harness,
			});

			// AF7 §2: fired exactly once — after harness starts, before drain.
			onHarnessStarted?.();

			// ── Phase 10: drain the event stream (single pass in v4).
			//
			// AR4a: conversational reply accumulator — track the LAST non-empty
			// completion text (not blind +=). See WARNING-3: the claude stream-json
			// dialect emits assistant deltas AND restates the full answer in the
			// terminal `result` line via preMapClaudeEvent. Blind `+=` double-counts.
			// Taking the last non-empty completion means the terminal `result` line
			// (full answer) overwrites the intermediate delta fragments — correct for
			// claude. For builtin (one completion) and codex/opencode (last stdout
			// line / step_finish), last-non-empty is identical to the reply text.
			// Guarded by `isConversational` — zero cost for task/routine sessions.
			// (conversationalReplyText declared at outer scope — hoisted for the
			// completed return site after the try/finally block.)
			try {
				for await (const event of harness.streamEvents(harnessHandle)) {
					// AL6: Observe every event FIRST — the gate is read-only.
					returnGate.observe(event);

					if (aborted) {
						break;
					}
					if (event.type === "cost_update") {
						const delta = Math.max(0, event.deltaCost);
						const currency = event.currency ?? "USD";
						const scale = 10 ** scaleForCurrency(currency);
						// @lore AF10: deltaMinor is the PER-EVENT delta in minor units.
						const deltaMinor = Math.round(delta * scale);
						totalCostCents += deltaMinor;
						if (routinePerRunCap != null && totalCostCents >= routinePerRunCap) {
							budgetExhausted = true;
							break;
						}
						await recordCostAndCheck(db, eventBus, {
							sessionId,
							costMinor: deltaMinor,
							currency,
							agentId: params.agentId,
							teamId,
							...(params.taskId ? { taskId: params.taskId } : {}),
							factoryCap: params.factoryCap,
							factorySpend: params.factorySpend,
							reviewThreadId: params.reviewThreadId,
						});
					} else if (event.type === "token_usage") {
						const tier: ModelTier = event.tier ?? modelTier;
						const existing = accumulatedTokens[tier];
						accumulatedTokens[tier] = {
							prompt: (existing?.prompt ?? 0) + event.inputTokens,
							completion: (existing?.completion ?? 0) + event.outputTokens,
						};
					} else if (event.type === "tool_call") {
						eventBus.emit({
							type: "tool_call_recorded",
							streamId: sessionId,
							sessionId,
							toolName: event.toolName,
							argsSummary: summarizeToolArgs(event.args),
							timestamp: Date.now(),
						});
						if (interceptToolCalls && selectedAdapter.meta.type !== "builtin") {
							await registry.invoke(event.toolName, event.args);
						}
					} else if (event.type === "completion") {
						// AR4a: capture the last non-empty completion text (WARNING-3).
						// Also capture tool calls from the same completion for transcript binding.
						// Guard on isConversational — inert for task/routine sessions.
						if (isConversational && event.text.length > 0) {
							conversationalReplyText = event.text;
							// @lore AR4a: capture toolCalls with the completion text so
							// resolveCurrentDraftBetId can rebind the draft bet on turn 2.
							// The last non-empty completion carries the accumulated tool calls
							// from the entire tool-use loop (builtin: CapturedToolCall[] per
							// runChatTurn; CLI: not yet captured, undefined is safe).
							conversationalToolCallsCapture =
								event.toolCalls && event.toolCalls.length > 0 ? event.toolCalls : undefined;
						}
					} else if (event.type === "error") {
						crashed = true;
						break;
					}
				}
			} catch {
				crashed = true;
			}

			// Stop the harness session.
			if (crashed) {
				try {
					metrics = (await harness.stopSession(harnessHandle))?.metrics;
				} catch (stopErr) {
					// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
					console.warn(
						`[session-provisioning] stopSession failed during crash teardown for ${sessionId}:`,
						stopErr,
					);
				}
			} else {
				metrics = (await harness.stopSession(harnessHandle))?.metrics;
			}
		}
	} finally {
		// W1: release the adapter pool slot EXACTLY ONCE after the single run.
		adapterPool.release(adapterId);
	}

	// ── Phase 11: teardown. The baseline cost parameter is retained for API
	// compatibility but is no longer used to compute costDelta (removed in O1).
	//
	// @lore O2: tokensJson column stripped from sessions table.
	// Token accumulation kept in-memory for the result object only.

	// AF7 §4/§5: the run is over — drop the abort affordance so a late PATCH/handoff
	// falls back to the guarded direct-write path instead of stopping a dead loop.
	sessionRunRegistry.deregister(sessionId);

	// X2: Unregister the MCP bridge BEFORE calling endSession/crashSession.
	// Both paths MUST unregister — the critique flagged crash-path cleanup as a
	// requirement. Orphaned entries block token GC until process restart.
	if (mcpBridgeRegistry && mcpBridgeToken) {
		// Await unregister to ensure cleanup is complete before teardown continues.
		// unregister() swallows close() errors internally — this call never throws.
		await mcpBridgeRegistry.unregister(mcpBridgeToken);
	}

	// AL6 v4-final: forceReturnCount = enforcement registry count (populated by in-turn
	// hooks + the hyperidle_return_status tool) + adapter's own in-process count.
	// The v3 loopForceCount is gone (outer loop deleted).
	//
	// @lore AL6 v4-final: Primary source is the enforcement registry (incremented by
	// the returnStatusTool when it hands back forceMessage!==null, and by blocking
	// adapters that call registry.incrementForce directly at turn-end). The adapter's
	// getForceReturnCount() supplements for adapters that maintain their own counter
	// (builtin: session.forceCount; SDK: stopHookCount). We add both to be safe.
	//
	// @lore AL6 CRIT-4: No drain fallback. forceCount reflects ONLY real hook fires and
	// adapter re-engage increments. forceCount=0 on not_returned means the hook did NOT
	// fire — inspect hook provisioning + endpoint wiring. The drain-gate floor is still
	// the backstop (not_returned outcome is recorded), but forceCount=0 is an honest signal.
	function computeForceReturnCount(): number {
		const registryEntry = enforcementRegistry.get(sessionId);
		const registryForceCount = registryEntry?.forceCount ?? 0;
		const adapterForceCount = harness.getForceReturnCount?.(sessionId) ?? 0;
		return registryForceCount + adapterForceCount;
	}

	// AR2: observation seam — sandbox is fully written; teardown has not run yet.
	// Fires once, after drain + stopSession + adapterPool.release, before every
	// teardown branch (completed / not_returned / budget_exhausted / crashed).
	// Swallow observer errors so a failed capture never strands a sandbox; the
	// teardown below always runs unconditionally. A failed capture surfaces as a
	// failed test assertion (expected bytes never captured), not a leaked sandbox.
	//
	// @lore AR2: Production callers omit `onBeforeTeardown` → this block is a
	// no-op at zero cost. The seam is purely test-observability infrastructure
	// (mirrors the existing optional `onHarnessStarted` callback). It observes;
	// it does not disable, defer, or condition teardown.
	if (deps.onBeforeTeardown) {
		try {
			await deps.onBeforeTeardown({ sessionId, sandboxPath });
		} catch (observeErr) {
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(
				`[session-provisioning] onBeforeTeardown observer threw for ${sessionId}; ` +
					`continuing teardown:`,
				observeErr,
			);
		}
	}

	if (crashed) {
		// ── Hook B: capture-back before crash teardown (AO2 §9).
		if (deps.mounter && mountedFilesystems.length > 0) {
			await captureMountedFilesystems(sessionId, sandboxPath, mountedFilesystems, deps.mounter);
		}
		await crashSession(db, eventBus, sessionContext, totalCostCents, 0);
		if (params.taskId) {
			await accumulateSessionTokensOnBet(db, params.taskId, accumulatedTokens);
		}
		// AL6: crashed → exempt from return enforcement (agent was prevented from
		// finishing, not refusing to return). evaluateReturn maps "crashed" → "returned".
		const returnVerdict = evaluateReturn(returnGate, "crashed");
		enforcementRegistry.unregister(sessionId);
		return {
			sessionId,
			outcome: "crashed",
			totalCostCents,
			taskId: params.taskId,
			returnVerdict,
			forceReturnCount: computeForceReturnCount(),
			...(metrics ? { metrics } : {}),
		};
	}

	// AA3: Per-run cap hit — end the session gracefully and record budget_exhausted outcome.
	// Pass "budget_exhausted" directly to endSession so updateRoutineRunOnSessionEnd
	// writes the correct outcome in a single write (avoids write-then-overwrite window).
	if (budgetExhausted) {
		// @lore AU9: store the durable "cost_cap" termination cause BEFORE tearing
		// down — the later unconditional transitionAgentRunLifecycle("completed")
		// call this run's caller makes will re-read this reason and disposition it
		// to failed/BUDGET_EXHAUSTED instead, per the "teardown never infers cause
		// from an in-memory outcome" contract. Only requests admitted through the
		// request-mediated path carry requestContext.
		if (sessionContext.requestContext) {
			await requestAgentTermination(db, {
				requestId: sessionContext.requestContext.requestId,
				reason: "cost_cap",
			});
		}
		// ── Hook B: capture-back before budget_exhausted teardown (AO2 §9).
		if (deps.mounter && mountedFilesystems.length > 0) {
			await captureMountedFilesystems(sessionId, sandboxPath, mountedFilesystems, deps.mounter);
		}
		await endSession(db, eventBus, sessionContext, totalCostCents, 0, "budget_exhausted");
		if (params.taskId) {
			await accumulateSessionTokensOnBet(db, params.taskId, accumulatedTokens);
		}
		await workspace.destroy(sandboxHandle);
		// AL6: budget_exhausted → exempt from return enforcement.
		const returnVerdict = evaluateReturn(returnGate, "budget_exhausted");
		enforcementRegistry.unregister(sessionId);
		return {
			sessionId,
			outcome: "budget_exhausted",
			totalCostCents,
			taskId: params.taskId,
			returnVerdict,
			forceReturnCount: computeForceReturnCount(),
			...(metrics ? { metrics } : {}),
		};
	}

	// AL6: Evaluate the return gate at normal turn completion.
	//
	// @lore AL6: `aborted` maps to "stopped" — the aborted flag causes a `break`
	// into the SAME teardown path as normal completion; there is NO separate
	// teardown branch for abort. We must check `aborted` here to correctly map
	// an intentional handoff-abort to the "stopped" (exempt) end-reason and avoid
	// spuriously flagging a handoff-abort as `not_returned`.
	//
	// @lore AR4a: Conversational turns are compliant-by-construction (concept §4.4)
	// — the reply IS the return artifact. Map to "stopped" so evaluateReturn returns
	// "returned" without observing a return-action tool call. Using "stopped" is
	// honest: the session ended normally at the agent's natural completion boundary
	// (no external abort), and the return verdict is correctly "returned".
	// The enforcementRegistry.exempt flag only guards the returnStatusTool path;
	// this mapping guards the evaluateReturn path at teardown.
	const returnEndReason = aborted || isConversational ? "stopped" : "completed";
	const returnVerdict = evaluateReturn(returnGate, returnEndReason);

	if (returnVerdict === "not_returned") {
		// AC3: never silently complete a not-returned turn — surface the escape.
		eventBus.emit({
			type: "session_not_returned",
			streamId: sessionId,
			sessionId,
			agentId: params.agentId,
			taskId: params.taskId,
			...(params.requestContext
				? {
						requestId: params.requestContext.requestId,
						sourceKind: params.requestContext.sourceKind,
						sourceId: params.requestContext.sourceId,
						sourceCorrelation: params.requestContext.sourceCorrelation,
					}
				: {}),
			timestamp: Date.now(),
		});

		// AL6 v2 (T6 / WARNING-A): Tier-2 reject — the turn did not return.
		// Pass "not_returned" to endSession so BOTH the persisted sessions.outcome
		// row and the session_ended bus event carry the correct outcome (not the
		// hardcoded "completed" that v1 emitted). This is the AC1 teeth at the
		// persistence layer: a not-returned turn is never recorded as "completed".
		// ── Hook B: capture-back before not_returned teardown (AO2 §9).
		if (deps.mounter && mountedFilesystems.length > 0) {
			await captureMountedFilesystems(sessionId, sandboxPath, mountedFilesystems, deps.mounter);
		}
		await endSession(db, eventBus, sessionContext, totalCostCents, 0, undefined, "not_returned");
		if (params.taskId) {
			await accumulateSessionTokensOnBet(db, params.taskId, accumulatedTokens);
		}
		await workspace.destroy(sandboxHandle);
		const notReturnedForceCount = computeForceReturnCount();
		enforcementRegistry.unregister(sessionId);
		return {
			sessionId,
			outcome: "not_returned",
			totalCostCents,
			taskId: params.taskId,
			returnVerdict,
			forceReturnCount: notReturnedForceCount,
			...(metrics ? { metrics } : {}),
		};
	}

	// ── Hook B: capture-back before normal teardown (AO2 §9).
	if (deps.mounter && mountedFilesystems.length > 0) {
		await captureMountedFilesystems(sessionId, sandboxPath, mountedFilesystems, deps.mounter);
	}
	await endSession(db, eventBus, sessionContext, totalCostCents, 0);
	if (params.taskId) {
		await accumulateSessionTokensOnBet(db, params.taskId, accumulatedTokens);
	}
	// Also destroy the workspace via the adapter to keep its internal map
	// consistent. `rm({ force: true })` is a no-op on the already-removed
	// directory, so no additional error handling is needed.
	await workspace.destroy(sandboxHandle);
	enforcementRegistry.unregister(sessionId);

	if (beforeHarnessStartError) {
		throw beforeHarnessStartError;
	}

	return {
		sessionId,
		outcome: "completed",
		totalCostCents,
		taskId: params.taskId,
		returnVerdict,
		forceReturnCount: computeForceReturnCount(),
		...(metrics ? { metrics } : {}),
		// AR4a: thread the captured reply text + tool calls onto the completed return ONLY.
		// Absent (undefined) for task/routine sessions (isConversational=false →
		// conversationalReplyText stays ""). Absent for crashed/budget/not_returned
		// (those fall through the other return sites above; callers map them to notices).
		...(isConversational ? { conversationalReply: conversationalReplyText } : {}),
		...(isConversational && conversationalToolCallsCapture
			? { conversationalToolCalls: conversationalToolCallsCapture }
			: {}),
	};
}

/**
 * AF7 §2 — Admit a session synchronously and DETACH its run.
 *
 * `POST /api/sessions` calls this: it awaits `admitSession` (phases 1-7, all
 * admission errors throw pre-insert) and then fires the long-running `runSession`
 * (phases 8-11) WITHOUT awaiting it, so the HTTP caller is not blocked for the
 * full agent run. Resolves with `{ sessionId, taskId }` as soon as the session
 * row is committed and `session_started` emitted.
 *
 * @lore AF7 §2: admission errors (CostCapExceeded/ConcurrencyLimit/
 * MissingCredential) propagate from `admitSession` to the caller and map to HTTP
 * status — they are NOT swallowed by the detached tail. The detached tail's
 * `.catch → crashSession` only handles genuine RUNTIME failures (harness errors
 * mid-stream), which legitimately become state=crashed, not HTTP errors. The
 * `.catch` is defensive: `runSession` already funnels its own exits through
 * end/crashSession, so a throw escaping it is unexpected.
 */
export async function startSessionProvision(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
): Promise<{ sessionId: string; taskId: string }> {
	// AF7 §2: HTTP path — enforce the resolvedModel guard so a missing credential
	// (local mode, builtin, resolvedModel absent) maps to a 500 + no row.
	const admitted = await admitSession(deps, params, true);

	// AF7 §2: await the harness-started signal so the POST returns AFTER
	// harness.startSession (the observable "session is running") but BEFORE the
	// long event-stream drain. The detached run continues independently.
	let signalStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		signalStarted = resolve;
	});

	// Detach the run — do NOT await its completion. A throw escaping runSession is
	// unexpected (it tears itself down internally); crashSession is the last-resort
	// funnel. We still resolve `started` on a pre-start throw so the caller never
	// hangs.
	void runSession(deps, params, admitted, signalStarted)
		.catch(async (err) => {
			try {
				await crashSession(deps.db, deps.eventBus, admitted.sessionContext, 0, 0);
			} catch (teardownErr) {
				// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
				console.error(
					`[session-provisioning] detached runSession crash teardown failed for ${admitted.sessionId}:`,
					teardownErr,
				);
			}
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.error(
				`[session-provisioning] detached runSession threw for ${admitted.sessionId}:`,
				err,
			);
		})
		.finally(() => {
			// Defensive: if runSession settled without ever firing onHarnessStarted
			// (e.g. an early throw before harness start), unblock the caller.
			signalStarted();
		});

	await started;

	if (!admitted.sessionContext.taskId) {
		throw new Error("startSessionProvision requires a task-backed session");
	}
	return { sessionId: admitted.sessionId, taskId: admitted.sessionContext.taskId };
}

/**
 * Provision an end-to-end agent session, awaiting the full run.
 *
 * AF7 §2: retained as a thin wrapper over `admitSession` + `runSession` for the
 * dispatcher (which is already off the request path in a fire-and-forget drain)
 * and for tests that assert on the final outcome. The phase logic lives in
 * `admitSession`/`runSession` — no duplication.
 */
export async function provisionSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
): Promise<ProvisionSessionResult> {
	const admitted = await admitSession(deps, params);
	return runSession(deps, params, admitted, deps.onHarnessStarted);
}
