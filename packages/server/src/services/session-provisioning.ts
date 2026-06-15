import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { bets, type HyperIdleDb, routines, sessions, tasks, users } from "@hyperidle/db";
import {
	assembleContext,
	assemblePrompt,
	assembleRoutinePrompt,
	buildRoutineSessionContextData,
	buildSessionContextData,
	checkCostCap,
	type FileWatcher,
	type FileWatcherConfig,
	recordCostAndCheck,
	startWatcher,
	type ToolSummary,
	writeSandboxAgentsMd,
} from "@hyperidle/fabric";
import {
	ConcurrencyLimitError,
	CostCapExceededError,
	type EventBus,
	type HarnessAdapter,
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
import type { SandboxAdapter, SandboxHandle } from "../harness/sandbox-adapter.js";
import { createMcpBridge } from "../mcp/mcp-bridge.js";
import type { McpBridgeRegistry } from "../mcp/mcp-bridge-registry.js";
import { buildToolRegistry, type ToolContext, toolsForRole } from "../tools/tool-registry.js";
import { summarizeToolArgs } from "./observability/dispatcher.js";
import { crashSession, endSession, type SessionContext } from "./session-lifecycle.js";
import { sessionRunRegistry } from "./session-run-registry.js";
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
	readonly watcher: FileWatcher;
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
	const selectRequirements = {
		harnessType: agent.harnessType ?? undefined,
		...(agent.modelProvider ? { modelProviders: [agent.modelProvider] as readonly string[] } : {}),
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
	let watcher: FileWatcher;
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

		// ── Phase 6: assemble context into the sandbox.
		await assembleContext(db, {
			sandboxPath,
			sessionId,
			taskId: params.taskId,
			agentId: params.agentId,
			agentRole,
			productId: params.productId,
		});

		// ── Phase 7: start the file watcher.
		const manifestPath = path.join(sandboxPath, ".fabric/manifest.json");
		const watcherConfig: FileWatcherConfig = {
			db,
			sandboxPath,
			sessionId,
			manifestPath,
		};
		watcher = startWatcher(watcherConfig);
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
		watcher,
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
		watcher,
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
		watcher,
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
	const toolContext: ToolContext = {
		db,
		eventBus,
		agentId: params.agentId,
		sessionId,
		taskId: params.taskId,
		teamId,
		sandboxPath,
		watcher,
	};
	const registry = buildToolRegistry(toolContext, { role: agentRole });

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

	// ── Phase 9: start the harness session.
	let harnessHandle: SessionHandle | null = null;
	let totalCostCents = 0;
	let crashed = false;
	/** AA3: set to true when per-run cost cap is hit; breaks the event loop gracefully. */
	let budgetExhausted = false;
	/** L17: accumulated tokens by tier for the session's tokensJson column. */
	const accumulatedTokens: Partial<Record<ModelTier, TierTokenCount>> = {};

	try {
		// Role-based tool authorization: facilitator-only tools are stripped
		// from builder/growth/brand_voice sessions. See G1 AC6 and
		// `ALL_TOOL_DEFINITIONS` in tool-registry.ts. Registry-internal
		// invoke() still sees every definition so cross-role handoffs and
		// ctx-scoped tests work — the authorization boundary is the harness
		// tool list, not the registry.
		const allowedToolNames = toolsForRole(agentRole).map((d) => d.name);
		harnessHandle = await harness.startSession({
			// AF7 §3: pass the provisioning-assigned sessionId so the builtin adapter
			// binds the registry pre-registered under this exact id (no map-scan
			// reconcile). Matches the setSessionToolRegistry(sessionId, ...) call above.
			sessionId,
			sandboxPath,
			systemPromptPath: "", // @deprecated X3: system prompt assembled from inline DB text
			assembledPrompt,
			modelTier,
			tools: allowedToolNames,
			// X4: Pass resolved model from gateway so adapter uses correct provider/model/key.
			resolvedModel: params.resolvedModel,
			// X6: Pass resolved fast-tier model for builtin harness summarization.
			resolvedFastModel: params.resolvedFastModel,
			// X5: MCP connection info when bridge was created successfully.
			// Adapters that support MCP use this to configure their harness's MCP client.
			mcpConnectionInfo: mcpBridgeToken
				? { url: `${mcpBaseUrl}/api/mcp/${mcpBridgeToken}`, token: mcpBridgeToken }
				: undefined,
		});
	} catch {
		// startSession failed — treat as crash; nothing to stop.
		crashed = true;
		adapterPool.release(adapterId);
	}

	if (harnessHandle !== null) {
		// AF7 §4/§5: register this live session so a PATCH or handoff can
		// cooperatively abort it. signalAbort() flips the local `aborted` flag the
		// event loop checks (secondary, non-builtin); the registry's abort() also
		// calls stopSession (primary — halts builtin's internal loop).
		const liveHandle = harnessHandle;
		sessionRunRegistry.register(sessionId, {
			signalAbort: () => {
				aborted = true;
			},
			handle: liveHandle,
			adapter: harness,
		});
	}

	// AF7 §2: the harness has now started (or failed to start). Signal the
	// detached caller so the HTTP POST can return 202 — AFTER startSession, BEFORE
	// the long event-stream drain below. Fired exactly once on every path.
	onHarnessStarted?.();

	if (harnessHandle !== null) {
		// ── Phase 10: drain the event stream.
		//
		// X5: Determine whether to intercept tool_call events from the stream.
		// When the adapter supports MCP AND the bridge is active, tool calls
		// already happened via MCP before the event was emitted — intercepting
		// here would double-invoke them. Fall back to event-stream interception
		// when MCP is not available (no bridge token or adapter lacks mcpSupport).
		//
		// @lore X5: Both conditions must be true to skip interception. If the
		// adapter claims mcpSupport but the bridge failed (mcpBridgeToken=undefined),
		// the CLI tool will receive ECONNREFUSED on MCP calls and its events will
		// error — but we must still intercept here as the fallback path.
		const adapterCapabilities = harness.getCapabilities();
		const interceptToolCalls = !(adapterCapabilities.mcpSupport && mcpBridgeToken);

		try {
			for await (const event of harness.streamEvents(harnessHandle)) {
				// AF7 §5 (secondary abort): on abort, break the provisioning loop so
				// non-builtin adapters stop routing tools through registry.invoke.
				// Builtin tool execution is halted by stopSession (primary), not here.
				// Break with crashed=false so teardown calls endSession (normal branch);
				// with the §4.3 CAS guard a handoff-ended row (already 'done') affects
				// zero rows and emits no spurious session_ended.
				if (aborted) {
					break;
				}
				if (event.type === "cost_update") {
					// Defensive clamp: never let a harness-reported deltaCost
					// decrement the running total. A negative delta would
					// silently suppress cap breaches downstream.
					const delta = Math.max(0, event.deltaCost);
					// L17: use scaleForCurrency to convert harness-reported dollars to
					// minor units. Claude SDK reports in USD (2 decimal places = 100 units
					// per dollar). scaleForCurrency ensures correct conversion if the
					// currency ever changes (e.g. JPY has 0 decimal places = 1:1).
					const currency = event.currency ?? "USD";
					const scale = 10 ** scaleForCurrency(currency);
					// @lore AF10: deltaMinor is the PER-EVENT delta in minor units.
					// recordCostAndCheck does costActual += costMinor (cost-cap.ts:247).
					// Passing totalCostCents here caused Z8-002 quadratic inflation
					// (events 10,5,5 → 45 not 20). totalCostCents is kept ONLY for the
					// per-run cap check and teardown plumbing — NOT for the boundary call.
					const deltaMinor = Math.round(delta * scale);
					totalCostCents += deltaMinor;
					// AA3: Per-run cap enforcement for routine sessions.
					// Checked after each cost accumulation. A single large delta may overshoot
					// the cap — that is acceptable; the cap is a guardrail, not a billing truncation.
					if (routinePerRunCap != null && totalCostCents >= routinePerRunCap) {
						budgetExhausted = true;
						break;
					}
					// Forward to C7: updates agents/teams.costActual and emits
					// cost_cap_warning / cost_cap_breached when thresholds cross.
					// R5: taskId is passed so bet cost accumulates per-event.
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
					// L17: accumulate tokens by tier for tokensJson written at session end.
					const tier: ModelTier = event.tier ?? modelTier;
					const existing = accumulatedTokens[tier];
					accumulatedTokens[tier] = {
						prompt: (existing?.prompt ?? 0) + event.inputTokens,
						completion: (existing?.completion ?? 0) + event.outputTokens,
					};
				} else if (event.type === "tool_call") {
					// Always emit to the bus for observability — even when MCP handles
					// the actual invocation. The tool_call event from the stream is
					// informational (it already happened via MCP).
					// `summarizeToolArgs` scrubs secrets + truncates to 512 chars.
					eventBus.emit({
						type: "tool_call_recorded",
						streamId: sessionId,
						sessionId,
						toolName: event.toolName,
						argsSummary: summarizeToolArgs(event.args),
						timestamp: Date.now(),
					});

					// X5: Only invoke the tool registry when the adapter does NOT
					// handle tool calls via MCP. When mcpSupport=true and bridge is
					// active, the invocation already happened via MCP.
					// X6: Also skip for the built-in harness — it executes tools
					// internally via the injected registry. Re-invoking here would
					// cause double execution.
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

		// Release harness resources. On normal completion we let a stopSession
		// error propagate — silently swallowing hides runaway subprocesses. On
		// the crash path we log and continue so the crash teardown completes.
		// Always release the adapter pool slot after the session ends.
		if (crashed) {
			try {
				await harness.stopSession(harnessHandle);
			} catch (stopErr) {
				// Observability adapter not yet available; `console.warn` is an
				// acceptable placeholder. Swallowing-silently on the crash path
				// is intentional: we are already tearing down due to a prior
				// error, and the stopSession failure is secondary.
				// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
				console.warn(
					`[session-provisioning] stopSession failed during crash teardown for ${sessionId}:`,
					stopErr,
				);
			} finally {
				adapterPool.release(adapterId);
			}
		} else {
			try {
				await harness.stopSession(harnessHandle);
			} finally {
				adapterPool.release(adapterId);
			}
		}
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

	if (crashed) {
		await crashSession(db, eventBus, sessionContext, totalCostCents, 0);
		await accumulateSessionTokensOnBet(db, params.taskId, accumulatedTokens);
		return {
			sessionId,
			outcome: "crashed",
			totalCostCents,
			taskId: params.taskId,
		};
	}

	// AA3: Per-run cap hit — end the session gracefully and record budget_exhausted outcome.
	// Pass "budget_exhausted" directly to endSession so updateRoutineRunOnSessionEnd
	// writes the correct outcome in a single write (avoids write-then-overwrite window).
	if (budgetExhausted) {
		await endSession(db, eventBus, sessionContext, totalCostCents, 0, "budget_exhausted");
		await accumulateSessionTokensOnBet(db, params.taskId, accumulatedTokens);
		await workspace.destroy(sandboxHandle);
		return {
			sessionId,
			outcome: "budget_exhausted",
			totalCostCents,
			taskId: params.taskId,
		};
	}

	await endSession(db, eventBus, sessionContext, totalCostCents, 0);
	await accumulateSessionTokensOnBet(db, params.taskId, accumulatedTokens);
	// Also destroy the workspace via the adapter to keep its internal map
	// consistent. `rm({ force: true })` is a no-op on the already-removed
	// directory, so no additional error handling is needed.
	await workspace.destroy(sandboxHandle);

	return {
		sessionId,
		outcome: "completed",
		totalCostCents,
		taskId: params.taskId,
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
