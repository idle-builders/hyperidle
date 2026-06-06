import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { bets, type HyperIdleDb, routines, sessions, tasks, users } from "@hyperidle/db";
import {
	buildRoutineSessionContextData,
	buildSessionContextData,
	checkCostCap,
	composePrompt,
	composeRoutinePrompt,
	type FileWatcher,
	type FileWatcherConfig,
	materialize,
	recordCostAndCheck,
	startWatcher,
	type ToolSummary,
	writeWorkspaceCLAUDEmd,
} from "@hyperidle/fabric";
import {
	ConcurrencyLimitError,
	CostCapExceededError,
	type EventBus,
	MODEL_TIERS,
	type ModelTier,
	type SessionHandle,
	type SessionOutcome,
	scaleForCurrency,
	type TaskState,
	type TierTokenCount,
} from "@hyperidle/shared";
import { and, eq, sql } from "drizzle-orm";
import type { AdapterPool } from "../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../harness/builtin-harness-adapter.js";
import type { WorkspaceAdapter, WorkspaceHandle } from "../harness/workspace-adapter.js";
import { createMcpBridge } from "../mcp/mcp-bridge.js";
import type { McpBridgeRegistry } from "../mcp/mcp-bridge-registry.js";
import { buildToolRegistry, type ToolContext, toolsForRole } from "../skill-tools/tool-registry.js";
import { summarizeToolArgs } from "./observability/dispatcher.js";
import { crashSession, endSession, type SessionContext } from "./session-lifecycle.js";
import type { StateTransitionAuditEntry, TaskAuditEntry } from "./task-audit.js";
import { transitionTask } from "./task-state-machine.js";

// @lore X3: validateSoulPromptPath and SOUL_PROMPT_DIR_RELATIVE removed.
// The path traversal attack surface is eliminated by X3 — soul prompts are now
// stored inline in the DB (agent.soulPrompt) rather than as file paths. No file
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
	readonly workspace: WorkspaceAdapter;
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
	readonly workspaceBasePath: string;
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
 * Provision an end-to-end agent session.
 *
 * Orchestrates the 11 phases spanning pre-flight validation, workspace setup,
 * harness start, event stream consumption, and teardown. Normal completion
 * calls `endSession`; any thrown error triggers `crashSession`. The workspace
 * is destroyed on normal completion and preserved on crash so that any
 * pre-crash writes remain available for post-mortem inspection.
 *
 * See plans/work-packages/D5-plan.md for the full phase breakdown.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: session provisioning coordinates multi-phase lifecycle with error handling
export async function provisionSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
): Promise<ProvisionSessionResult> {
	const { db, eventBus, adapterPool, workspace, mcpBridgeRegistry, mcpBaseUrl } = deps;

	// ── Phase 1: load agent
	const [agent] = await db.select().from(users).where(eq(users.id, params.agentId)).limit(1);
	if (!agent) {
		throw new Error(`Agent not found: ${params.agentId}`);
	}
	const agentRole = agent.role;
	const teamId = agent.teamId ?? undefined;

	// X3: Read soul prompt inline from DB column. No file read required.
	const soulPromptText = agent.soulPrompt ?? "";

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
	const selectedAdapter = adapterPool.select({
		harnessType: agent.harnessType ?? undefined,
	});
	if (!selectedAdapter) {
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

	await transitionTask(db, eventBus, params.taskId, "in_progress");

	// ── Phases 4-7 (wrapped): spawn workspace → insert session row →
	// materialize → start watcher. If any step throws before the session row
	// is committed AND before the harness starts, we revert the task back to
	// `accepted` so a transient failure (disk full, path collision, EMFILE)
	// does not permanently strand the task in `in_progress`.
	let sessionId: string;
	let workspaceHandle: WorkspaceHandle;
	let workspacePath: string;
	let watcher: FileWatcher;
	try {
		// ── Phase 4: spawn workspace via adapter.
		workspaceHandle = await workspace.spawn(params.workspaceBasePath);
		workspacePath = workspaceHandle.path;

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
			workspaceSnapshot: workspacePath,
			// AA2: populate routineId when this is a routine session.
			...(params.routineId ? { routineId: params.routineId } : {}),
		});

		// ── Phase 6: materialize knowledge into the workspace.
		await materialize(db, {
			workspacePath,
			sessionId,
			taskId: params.taskId,
			agentId: params.agentId,
			agentRole,
			productId: params.productId,
		});

		// ── Phase 7: start the file watcher.
		const manifestPath = path.join(workspacePath, ".fabric/manifest.json");
		const watcherConfig: FileWatcherConfig = {
			db,
			workspacePath,
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
		workspacePath,
		watcher,
		// AA2: pass routineId so endSession/crashSession can update routine_runs.
		...(params.routineId ? { routineId: params.routineId } : {}),
	};

	// ── Phase 8: build tool registry bound to this context.
	const toolContext: ToolContext = {
		db,
		eventBus,
		agentId: params.agentId,
		sessionId,
		taskId: params.taskId,
		teamId,
		workspacePath,
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
	// @lore X1: spec says "written during Phase 6 (materialization)" but we
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

	let composedPrompt: string;
	if (params.routineId) {
		// Routine session: read routine + agent + team context (no task/bet).
		const routineContextData = await buildRoutineSessionContextData(db, {
			sessionId,
			routineId: params.routineId,
			agentId: params.agentId,
			agentRole,
			teamId: params.productId,
		});
		({ composedPrompt } = await composeRoutinePrompt({
			soulPromptText,
			context: routineContextData,
			tools: toolSummaries,
			workspacePath,
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
		({ composedPrompt } = await composePrompt({
			soulPromptText,
			context: sessionContextData,
			tools: toolSummaries,
			workspacePath,
		}));
	}

	writeWorkspaceCLAUDEmd(workspacePath, composedPrompt);

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
			// Write .mcp.json to workspace for harness auto-discovery.
			const mcpJsonPath = path.join(workspacePath, ".mcp.json");
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

	// AA3: Read per-run cost cap once at provisioning time for routine sessions.
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

	try {
		// Role-based tool authorization: facilitator-only tools are stripped
		// from builder/growth/brand_voice sessions. See G1 AC6 and
		// `ALL_TOOL_DEFINITIONS` in tool-registry.ts. Registry-internal
		// invoke() still sees every definition so cross-role handoffs and
		// ctx-scoped tests work — the authorization boundary is the harness
		// tool list, not the registry.
		const allowedToolNames = toolsForRole(agentRole).map((d) => d.name);
		harnessHandle = await harness.startSession({
			workspacePath,
			soulPromptPath: "", // @deprecated X3: soul prompt now composed from inline text (soulPromptText)
			composedPrompt,
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
					totalCostCents += Math.round(delta * scale);
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
						costMinor: totalCostCents,
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
		await workspace.destroy(workspaceHandle);
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
	await workspace.destroy(workspaceHandle);

	return {
		sessionId,
		outcome: "completed",
		totalCostCents,
		taskId: params.taskId,
	};
}
