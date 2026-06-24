import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { bets, type HyperIdleDb, routines, sessions, tasks, users } from "@hyperidle/db";
import {
	assemblePrompt,
	assembleRoutinePrompt,
	buildRoutineSessionContextData,
	buildSessionContextData,
	checkCostCap,
	recordCostAndCheck,
	type ToolSummary,
	writeSandboxAgentsMd,
} from "@hyperidle/fabric";
import {
	AL6_MAX_FORCE_RETURNS,
	ConcurrencyLimitError,
	CostCapExceededError,
	type EventBus,
	type HarnessAdapter,
	type IngestionHandle,
	isInternalExtractionDrain,
	MissingCredentialError,
	MODEL_TIERS,
	type ModelTier,
	NoEligibleHarnessError,
	type SessionHandle,
	type SessionOutcome,
	scaleForCurrency,
	type TaskState,
	type TierTokenCount,
	type UserRole,
} from "@hyperidle/shared";
import { and, eq, sql } from "drizzle-orm";
import type { AdapterPool, SelectedEntry } from "../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../harness/builtin-harness-adapter.js";
import { provisionReturnHook } from "../harness/provision-return-hook.js";
import { enforcementRegistry } from "../harness/return-enforcement-registry.js";
// v4-final: re-engage.ts (rewriteSandboxForcing) deleted — no Layer-B loop.
import { createReturnGate, evaluateReturn } from "../harness/return-gate.js";
import type { SandboxAdapter, SandboxHandle } from "../harness/sandbox-adapter.js";
import { createMcpBridge } from "../mcp/mcp-bridge.js";
import type { McpBridgeRegistry } from "../mcp/mcp-bridge-registry.js";
import { returnStatusTool } from "../tools/return-status-tool.js";
import { buildToolRegistry, type ToolContext, toolsForRole } from "../tools/tool-registry.js";
import { summarizeToolArgs } from "./observability/dispatcher.js";
import { readServerConfig } from "./server-config.js";
import { crashSession, endSession, type SessionContext } from "./session-lifecycle.js";
import { sessionRunRegistry } from "./session-run-registry.js";
import { getActiveStrategy } from "./strategy-registry.js";
import type { StateTransitionAuditEntry, TaskAuditEntry } from "./task-audit.js";
import { transitionTask } from "./task-state-machine.js";

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
	const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
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

	await db
		.update(tasks)
		.set({
			state: toState,
			auditTrail: JSON.stringify([...existingAudit, entry]),
			updatedAt: new Date().toISOString(),
		})
		.where(eq(tasks.id, taskId));

	eventBus.emit({
		type: "task_state_changed",
		streamId: taskId,
		taskId,
		fromState,
		toState,
		timestamp: Date.now(),
	});
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

	const [task] = await db
		.select({ betId: tasks.betId })
		.from(tasks)
		.where(eq(tasks.id, taskId))
		.limit(1);
	if (!task?.betId) return;

	const [bet] = await db
		.select({ tokensActualJson: bets.tokensActualJson })
		.from(bets)
		.where(eq(bets.id, task.betId))
		.limit(1);

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

	await db
		.update(bets)
		.set({ tokensActualJson: JSON.stringify({ byTier: merged }) })
		.where(eq(bets.id, task.betId));
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
}

export interface ProvisionSessionParams {
	readonly taskId: string;
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
	/**
	 * AA2: When set, this session is a routine session. The provisioning orchestrator
	 * will use routine context (buildRoutineSessionContextData + composeRoutinePrompt)
	 * instead of task/bet context, and will populate sessions.routineId.
	 *
	 * @lore AA2: routineId is optional — normal task sessions omit it. When present,
	 * context assembly switches to the routine path which reads from the routines
	 * table rather than tasks/bets. The stub taskId is still required to satisfy
	 * the sessions.taskId NOT NULL FK.
	 */
	readonly routineId?: string;
}

export interface ProvisionSessionResult {
	readonly sessionId: string;
	/** AA3: widened to include "budget_exhausted" for per-run cap enforcement. */
	readonly outcome: SessionOutcome | "budget_exhausted";
	readonly totalCostCents: number;
	readonly taskId: string;
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
	const [agent] = await db.select().from(users).where(eq(users.id, params.agentId)).limit(1);
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

	const [activeCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(sessions)
		.where(and(eq(sessions.agentId, params.agentId), eq(sessions.state, "active")))
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
	const [taskForTransition] = await db
		.select({ state: tasks.state })
		.from(tasks)
		.where(eq(tasks.id, params.taskId))
		.limit(1);
	if (taskForTransition && taskForTransition.state !== "in_progress") {
		await transitionTask(db, eventBus, params.taskId, "in_progress");
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
	try {
		// ── Phase 4: spawn sandbox via adapter.
		sandboxHandle = await workspace.spawn(params.sandboxBasePath);
		sandboxPath = sandboxHandle.path;

		// ── Phase 5: insert session row.
		sessionId = randomUUID();
		const startedAt = new Date().toISOString();
		await db.insert(sessions).values({
			id: sessionId,
			taskId: params.taskId,
			agentId: params.agentId,
			modelTier,
			startedAt,
			state: "active",
			sandboxSnapshot: sandboxPath,
			// AA2: populate routineId when this is a routine session.
			...(params.routineId ? { routineId: params.routineId } : {}),
		});

		// ── Phase 6: assemble context into the sandbox (via Strategy Port).
		// @lore AK2 §5a: was `assembleContext(db, {...})` hard-imported from
		// @hyperidle/fabric. Now routed through the Strategy Port so the Kernel
		// is decoupled from any concrete Strategy. The try/catch revert behaviour
		// is preserved exactly — assembleContext may throw; revertTaskToAccepted
		// runs and the error propagates.
		const strategy = getActiveStrategy();
		await strategy.assembleContext({
			db,
			sandboxPath,
			sessionId,
			taskId: params.taskId,
			agentId: params.agentId,
			agentRole,
			teamId: params.productId,
			isRoutine: !!params.routineId,
		});

		// ── Phase 7: begin learning ingestion (via Strategy Port).
		// @lore AK2 §5a: was `startWatcher(watcherConfig)` returning FileWatcher.
		// Now calls beginLearningIngestion → IngestionHandle. The handle's dispose()
		// replaces watcher.stop() at every teardown site. The Fabric adapter's
		// beginLearningIngestion delegates to startWatcher byte-identically (AC3).
		const manifestPath = path.join(sandboxPath, ".fabric/manifest.json");
		ingestion = strategy.beginLearningIngestion({
			db,
			sandboxPath,
			sessionId,
			manifestPath,
		});
	} catch (err) {
		const reason = `provisioning failed: ${err instanceof Error ? err.message : String(err)}`;
		await revertTaskToAccepted(db, eventBus, params.taskId, reason);
		throw err;
	}

	// Emit session_started now that the workspace is ready.
	eventBus.emit({
		type: "session_started",
		streamId: sessionId,
		sessionId,
		agentId: params.agentId,
		taskId: params.taskId,
		timestamp: Date.now(),
	});

	const sessionContext: SessionContext = {
		sessionId,
		agentId: params.agentId,
		taskId: params.taskId,
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
		const [routineRow] = await db
			.select({ costCapPerRunMinor: routines.costCapPerRunMinor })
			.from(routines)
			.where(eq(routines.id, params.routineId))
			.limit(1);
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
	const { db, eventBus, adapterPool, workspace, mcpBridgeRegistry, mcpBaseUrl } = deps;
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
	const toolContext: ToolContext = {
		db,
		eventBus,
		agentId: params.agentId,
		sessionId,
		taskId: params.taskId,
		teamId,
		sandboxPath,
		ingestion,
	};
	const registry = buildToolRegistry(toolContext, {
		role: agentRole,
		// AL6 v4-final: inject hyperidle_return_status as a per-session tool.
		// The tool reads ctx.sessionId → enforcementRegistry → { returned, exempt, forceCount, budgetLeft, forceMessage }.
		extraTools: [returnStatusTool.forRegistry(enforcementRegistry)],
	});

	// ── Phase 8.5a: inject registry into builtin harness before startSession.
	//
	// @lore X6: The builtin harness executes tools internally (inside the agent
	// loop) rather than emitting tool_call events for the provisioning orchestrator
	// to invoke. setSessionToolRegistry() pre-registers the session-scoped registry
	// so the harness can call it when the loop starts. This call is guarded by
	// meta.type === "builtin" — external harnesses (ClaudeAgentSdkAdapter) receive
	// the registry indirectly via MCP bridge (X2), not via this method.
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
	// context. The stub taskId satisfies the FK but is NOT used for context.

	const toolSummaries: ToolSummary[] = toolsForRole(agentRole).map((d) => ({
		name: d.name,
		description: d.description,
	}));

	let assembledPrompt: string;
	if (params.routineId) {
		// Routine session: read routine + agent + team context (no task/bet).
		const routineContextData = await buildRoutineSessionContextData(db, {
			sessionId,
			routineId: params.routineId,
			agentId: params.agentId,
			agentRole,
			teamId: params.productId,
		});
		({ assembledPrompt } = await assembleRoutinePrompt({
			systemPromptText,
			context: routineContextData,
			tools: toolSummaries,
			sandboxPath,
		}));
	} else {
		// Normal task session: read task + bet + agent + team context.
		const sessionContextData = await buildSessionContextData(db, {
			sessionId,
			taskId: params.taskId,
			agentId: params.agentId,
			agentRole,
			productId: params.productId,
		});
		({ assembledPrompt } = await assemblePrompt({
			systemPromptText,
			context: sessionContextData,
			tools: toolSummaries,
			sandboxPath,
		}));
	}

	writeSandboxAgentsMd(sandboxPath, assembledPrompt);

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
	let mcpBridgeToken: string | undefined;
	if (mcpBridgeRegistry && mcpBaseUrl) {
		try {
			const bridge = await createMcpBridge({ sessionId, registry });
			mcpBridgeRegistry.register(bridge);
			mcpBridgeToken = bridge.token;
			// Write .mcp.json to sandbox for harness auto-discovery.
			const mcpJsonPath = path.join(sandboxPath, ".mcp.json");
			const mcpConfig = {
				mcpServers: {
					hyperidle: {
						type: "http",
						url: `${mcpBaseUrl}/api/mcp/${bridge.token}`,
					},
				},
			};
			fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), "utf-8");
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
	const adapterCapabilities = harness.getCapabilities();
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
	// Exempt = internal-extraction drain (empty tools list → structurally cannot return).
	const exempt = isInternalExtractionDrain({ tools: toolsForRole(agentRole).map((d) => d.name) });
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
	};

	// X5: Determine whether to intercept tool_call events from the stream.
	// Computed once — same across all loop runs (adapter capabilities are static).
	// adapterCapabilities already retrieved above for provisionReturnHook.
	const interceptToolCalls = !(adapterCapabilities.mcpSupport && mcpBridgeToken);

	let harnessHandle: SessionHandle | null = null;

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
		try {
			// Role-based tool authorization: facilitator-only tools are stripped
			// from builder/growth/brand_voice sessions. See G1 AC6.
			harnessHandle = await harness.startSession(sessionStartConfig);
		} catch {
			// startSession failed — treat as crash.
			crashed = true;
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
							taskId: params.taskId,
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
					await harness.stopSession(harnessHandle);
				} catch (stopErr) {
					// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
					console.warn(
						`[session-provisioning] stopSession failed during crash teardown for ${sessionId}:`,
						stopErr,
					);
				}
			} else {
				await harness.stopSession(harnessHandle);
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

	if (crashed) {
		await crashSession(db, eventBus, sessionContext, totalCostCents, 0);
		await accumulateSessionTokensOnBet(db, params.taskId, accumulatedTokens);
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
		};
	}

	// AA3: Per-run cap hit — end the session gracefully and record budget_exhausted outcome.
	// Pass "budget_exhausted" directly to endSession so updateRoutineRunOnSessionEnd
	// writes the correct outcome in a single write (avoids write-then-overwrite window).
	if (budgetExhausted) {
		await endSession(db, eventBus, sessionContext, totalCostCents, 0, "budget_exhausted");
		await accumulateSessionTokensOnBet(db, params.taskId, accumulatedTokens);
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
		};
	}

	// AL6: Evaluate the return gate at normal turn completion.
	//
	// @lore AL6: `aborted` maps to "stopped" — the aborted flag causes a `break`
	// into the SAME teardown path as normal completion; there is NO separate
	// teardown branch for abort. We must check `aborted` here to correctly map
	// an intentional handoff-abort to the "stopped" (exempt) end-reason and avoid
	// spuriously flagging a handoff-abort as `not_returned`.
	const returnEndReason = aborted ? "stopped" : "completed";
	const returnVerdict = evaluateReturn(returnGate, returnEndReason);

	if (returnVerdict === "not_returned") {
		// AC3: never silently complete a not-returned turn — surface the escape.
		eventBus.emit({
			type: "session_not_returned",
			streamId: sessionId,
			sessionId,
			agentId: params.agentId,
			taskId: params.taskId,
			timestamp: Date.now(),
		});

		// AL6 v2 (T6 / WARNING-A): Tier-2 reject — the turn did not return.
		// Pass "not_returned" to endSession so BOTH the persisted sessions.outcome
		// row and the session_ended bus event carry the correct outcome (not the
		// hardcoded "completed" that v1 emitted). This is the AC1 teeth at the
		// persistence layer: a not-returned turn is never recorded as "completed".
		await endSession(db, eventBus, sessionContext, totalCostCents, 0, undefined, "not_returned");
		await accumulateSessionTokensOnBet(db, params.taskId, accumulatedTokens);
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
		};
	}

	await endSession(db, eventBus, sessionContext, totalCostCents, 0);
	await accumulateSessionTokensOnBet(db, params.taskId, accumulatedTokens);
	// Also destroy the workspace via the adapter to keep its internal map
	// consistent. `rm({ force: true })` is a no-op on the already-removed
	// directory, so no additional error handling is needed.
	await workspace.destroy(sandboxHandle);
	enforcementRegistry.unregister(sessionId);

	return {
		sessionId,
		outcome: "completed",
		totalCostCents,
		taskId: params.taskId,
		returnVerdict,
		forceReturnCount: computeForceReturnCount(),
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
	return runSession(deps, params, admitted);
}
