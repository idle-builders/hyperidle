import { randomUUID } from "node:crypto";
import * as path from "node:path";
import { type HyperIdleDb, agents, sessions, tasks } from "@hyperidle/db";
import {
	type FileWatcher,
	type FileWatcherConfig,
	materialize,
	startWatcher,
} from "@hyperidle/fabric";
import {
	type AgentRole,
	ConcurrencyLimitError,
	CostCapExceededError,
	type EventBus,
	type HarnessAdapter,
	type ModelTier,
	type SessionHandle,
	type SessionOutcome,
	type TaskState,
} from "@hyperidle/shared";
import { and, eq, sql } from "drizzle-orm";
import type { WorkspaceAdapter, WorkspaceHandle } from "../harness/workspace-adapter.js";
import { type ToolContext, buildToolRegistry, toolsForRole } from "../skill-tools/tool-registry.js";
import { checkCostCap, recordCostAndCheck } from "./cost-cap.js";
import { summarizeToolArgs } from "./observability/dispatcher.js";
import { type SessionContext, crashSession, endSession } from "./session-lifecycle.js";
import { transitionTask } from "./task-state-machine.js";

/**
 * The directory under which all `soul_prompt_path` values must resolve. We
 * anchor relative paths to `process.cwd()`; absolute paths must still lie
 * within this prefix after resolution.
 *
 * @lore Path traversal guard on `soul_prompt_path`: the column is populated
 * from seeds and DB writes, both of which are trusted today, but the value
 * flows unfiltered to the harness. Without this guard, an attacker with any
 * write on `agents.soul_prompt_path` could escape the docs/souls directory
 * (`../../../etc/passwd`) and have the harness read arbitrary files. The
 * validation runs before `harness.startSession` so a bad value fails
 * provisioning rather than leaking system files into the agent's context.
 */
const SOUL_PROMPT_DIR_RELATIVE = "docs/souls";

function validateSoulPromptPath(rawPath: string): string {
	// Empty path = "no soul prompt"; the harness adapter decides what to do
	// with it (current adapter treats empty as no-op). This matches legacy
	// behavior for builder agents that don't yet carry a soul prompt.
	if (rawPath.length === 0) {
		return "";
	}
	const baseDir = path.resolve(process.cwd(), SOUL_PROMPT_DIR_RELATIVE);
	const resolved = path.resolve(process.cwd(), rawPath);
	// `path.relative` gives us a normalized form; if it starts with `..` or is
	// absolute, the resolved path escapes `baseDir`.
	const rel = path.relative(baseDir, resolved);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new Error(
			`soul_prompt_path escapes ${SOUL_PROMPT_DIR_RELATIVE}: ${rawPath} (resolved to ${resolved})`,
		);
	}
	return resolved;
}

/**
 * Revert a task that we transitioned to `in_progress` back to `accepted` when
 * provisioning fails AFTER the state transition but BEFORE the session row is
 * committed. We bypass `transitionTask` because the state machine does not
 * include a valid `in_progress -> accepted` transition — this is intentionally
 * a repair path, not a normal workflow transition. We still append an audit
 * entry (carrying the failure reason) and emit a `task_state_changed` event so
 * the revert is observable downstream.
 */
function revertTaskToAccepted(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	reason: string,
): void {
	const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
	if (!task) return;
	const fromState = task.state as TaskState;
	const toState: TaskState = "accepted";

	const existingAudit: Array<{
		from: string;
		to: string;
		timestamp: string;
		reason?: string;
	}> = task.notes ? JSON.parse(task.notes) : [];
	existingAudit.push({
		from: fromState,
		to: toState,
		timestamp: new Date().toISOString(),
		reason,
	});

	db.update(tasks)
		.set({
			state: toState,
			notes: JSON.stringify(existingAudit),
			updatedAt: new Date().toISOString(),
		})
		.where(eq(tasks.id, taskId))
		.run();

	eventBus.emit({
		type: "task_state_changed",
		streamId: taskId,
		taskId,
		fromState,
		toState,
		timestamp: Date.now(),
	});
}

export interface ProvisionSessionDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly harness: HarnessAdapter;
	readonly workspace: WorkspaceAdapter;
}

export interface ProvisionSessionParams {
	readonly taskId: string;
	readonly agentId: string;
	readonly productId: string;
	readonly workspaceBasePath: string;
	readonly factoryCap?: number;
	readonly factorySpend?: number;
	readonly reviewThreadId?: string;
	readonly modelTier?: ModelTier;
}

export interface ProvisionSessionResult {
	readonly sessionId: string;
	readonly outcome: SessionOutcome;
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
 * See docs/work-packages/plans/D5-plan.md for the full phase breakdown.
 */
export async function provisionSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
): Promise<ProvisionSessionResult> {
	const { db, eventBus, harness, workspace } = deps;

	// ── Phase 1: load agent
	const agent = db.select().from(agents).where(eq(agents.id, params.agentId)).get();
	if (!agent) {
		throw new Error(`Agent not found: ${params.agentId}`);
	}
	const agentRole = agent.role as AgentRole;
	const teamId = agent.teamId ?? undefined;
	const modelTier: ModelTier = params.modelTier ?? "workhorse";
	// Validate/resolve the soul prompt path up front. Invalid values (empty,
	// escaping docs/souls) fail provisioning BEFORE any DB writes or task
	// state transitions — the agent never starts and no cleanup is needed.
	const rawSoulPromptPath = agent.soulPromptPath ?? "";
	const soulPromptPath = validateSoulPromptPath(rawSoulPromptPath);

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

	// ── Phase 3: concurrency check + task transition. Both BEFORE workspace spawn.
	const activeCount = db
		.select({ count: sql<number>`count(*)` })
		.from(sessions)
		.where(and(eq(sessions.agentId, params.agentId), eq(sessions.state, "active")))
		.get();
	if ((activeCount?.count ?? 0) >= agent.maxConcurrentSessions) {
		throw new ConcurrencyLimitError(params.agentId, agent.maxConcurrentSessions);
	}

	transitionTask(db, eventBus, params.taskId, "in_progress");

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
		db.insert(sessions)
			.values({
				id: sessionId,
				taskId: params.taskId,
				agentId: params.agentId,
				modelTier,
				startedAt,
				state: "active",
				workspaceSnapshot: workspacePath,
				cost: 0,
			})
			.run();

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
		revertTaskToAccepted(db, eventBus, params.taskId, reason);
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
	};

	// ── Phase 8: build tool registry bound to this context.
	const toolContext: ToolContext = {
		db,
		eventBus,
		agentId: params.agentId,
		sessionId,
		taskId: params.taskId,
		workspacePath,
		watcher,
	};
	const registry = buildToolRegistry(toolContext);

	// ── Phase 9: start the harness session.
	let harnessHandle: SessionHandle | null = null;
	let totalCostCents = 0;
	let crashed = false;

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
			soulPromptPath,
			modelTier,
			tools: allowedToolNames,
		});
	} catch {
		// startSession failed — treat as crash; nothing to stop.
		crashed = true;
	}

	if (harnessHandle !== null) {
		// ── Phase 10: drain the event stream.
		try {
			for await (const event of harness.streamEvents(harnessHandle)) {
				if (event.type === "cost_update") {
					// Defensive clamp: never let a harness-reported deltaCost
					// decrement the running total. A negative delta would
					// silently suppress cap breaches downstream.
					const delta = Math.max(0, event.deltaCost);
					totalCostCents += Math.round(delta * 100);
					// Forward to C7: persists running total on sessions.cost and emits
					// cost_cap_warning / cost_cap_breached when thresholds cross.
					await recordCostAndCheck(db, eventBus, {
						sessionId,
						cost: totalCostCents,
						agentId: params.agentId,
						teamId,
						factoryCap: params.factoryCap,
						factorySpend: params.factorySpend,
						reviewThreadId: params.reviewThreadId,
					});
				} else if (event.type === "tool_call") {
					// Emit to the bus for observability before invoking the tool
					// so a failure inside the registry doesn't drop the record.
					// `summarizeToolArgs` scrubs secrets + truncates to 512 chars —
					// the resulting string is safe to ship to Langfuse.
					eventBus.emit({
						type: "tool_call_recorded",
						streamId: sessionId,
						sessionId,
						toolName: event.toolName,
						argsSummary: summarizeToolArgs(event.args),
						timestamp: Date.now(),
					});
					await registry.invoke(event.toolName, event.args);
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
			}
		} else {
			await harness.stopSession(harnessHandle);
		}
	}

	// ── Phase 11: teardown. Baseline cost is 0 for a freshly-provisioned
	// session — pass it explicitly so costDelta reflects the full session spend
	// even though `recordCostAndCheck` has already persisted the running total
	// onto `sessions.cost`.
	if (crashed) {
		await crashSession(db, eventBus, sessionContext, totalCostCents, 0);
		return {
			sessionId,
			outcome: "crashed",
			totalCostCents,
			taskId: params.taskId,
		};
	}

	await endSession(db, eventBus, sessionContext, totalCostCents, 0);
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
