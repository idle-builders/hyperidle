/**
 * AD2 — Task-to-Session Dispatcher.
 *
 * Subscribes to task_state_changed (toState=accepted) and session_ended events.
 * Maintains an in-memory FIFO queue of dispatchable tasks and calls
 * provisionSession for each entry in order.
 *
 * The queue is not durable — the startup sweep re-populates it from DB state
 * on each registration. Source of truth is the tasks table, not this queue.
 *
 * @lore AD2: Lives in @hyperidle/fabric (strategy layer) following the pattern
 * of lifecycle-propagation, session-review-creator, and notification-dispatcher.
 * The dispatcher defines its own TaskDispatcherDeps interface so fabric does not
 * statically import from @hyperidle/server (which would create a circular dep
 * since server depends on fabric).
 *
 * @lore AD2: provisionSession is resolved via the provision-registry.ts leaf
 * module (a dependency-free singleton). The dynamic import() approach was tried
 * first but fails in Vite SSR tests with a TDZ error due to the circular dep
 * server→fabric→server. The registry pattern breaks the cycle: both server and
 * the test file can import the leaf module and register the function before
 * any dispatch runs. See provision-registry.ts for the full explanation.
 *
 * @lore AD2: getDispatchQueueSnapshot() is module-level (not instance-scoped)
 * because production runs a single dispatcher. Tests that re-register the
 * dispatcher start fresh because registerTaskDispatcher resets the queue.
 * This is an accepted v1 limitation — see architecture-critique Finding 3.
 */

import { type HyperIdleDb, sessions, tasks } from "@hyperidle/db";
import {
	ConcurrencyLimitError,
	CostCapExceededError,
	type EventBus,
	type SessionEndedEvent,
	type TaskStateChangedEvent,
} from "@hyperidle/shared";
import { and, eq, isNotNull } from "drizzle-orm";
import { getProvisionSessionFn } from "./provision-registry.js";

// ---------------------------------------------------------------------------
// Simple inline logger (observability adapter not yet available in fabric)
// ---------------------------------------------------------------------------

const logger = {
	info: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: strategy-layer dispatcher, observability adapter not yet stood up
		console.info(`[task-dispatcher] ${msg}`, ctx ?? "");
	},
	error: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: strategy-layer dispatcher, observability adapter not yet stood up
		console.error(`[task-dispatcher] ${msg}`, ctx ?? "");
	},
	warn: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: strategy-layer dispatcher, observability adapter not yet stood up
		console.warn(`[task-dispatcher] ${msg}`, ctx ?? "");
	},
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Dependencies for the task dispatcher. Structurally compatible with what
 * provisionSession needs, but defined here so fabric does not statically
 * import from @hyperidle/server.
 *
 * adapterPool and workspace are typed as `unknown` here; the dispatcher passes
 * them through to provisionSession which knows their concrete types. The
 * structural typing works because server constructs the real instances and passes
 * them; fabric only stores and forwards them.
 */
export interface TaskDispatcherDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	// biome-ignore lint/suspicious/noExplicitAny: structural typing across package boundary — fabric cannot statically depend on server types
	readonly adapterPool: any;
	// biome-ignore lint/suspicious/noExplicitAny: structural typing across package boundary — fabric cannot statically depend on server types
	readonly workspace: any;
	readonly workspaceBasePath: string;
	/**
	 * Optional: resolve a model tier to a concrete ResolvedModel (provider, model,
	 * apiKey, baseUrl). Server-factory.ts provides the implementation closing over
	 * CredentialResolver. When absent (tests without credential setup),
	 * resolvedModel is omitted from the provisionSession call.
	 *
	 * @lore AF7 §1: the return is the full ResolvedModel — it is forwarded opaquely
	 * as `resolvedModel` to provisionSession, which assigns it to
	 * SessionConfig.resolvedModel. (Earlier this was loosely typed as
	 * `{provider, modelId, apiKey?}`, which did not match what the value actually
	 * had to be; AF7 wires the real production resolveModel so the honest type is
	 * ResolvedModel.)
	 */
	readonly resolveModel?: (
		modelTier: string,
	) => Promise<import("@hyperidle/shared").ResolvedModel | undefined>;
	/** Optional MCP bridge registry (passed through to provisionSession). */
	// biome-ignore lint/suspicious/noExplicitAny: structural typing across package boundary
	readonly mcpBridgeRegistry?: any;
	/** Optional MCP base URL (passed through to provisionSession). */
	readonly mcpBaseUrl?: string;
}

/** A single entry in the dispatch queue. */
export interface DispatchQueueEntry {
	readonly taskId: string;
	readonly agentId: string;
	readonly teamId: string;
	readonly enqueuedAt: number; // Date.now()
}

/** Snapshot of the current dispatch queue state. */
export interface DispatchQueueSnapshot {
	readonly entries: readonly DispatchQueueEntry[];
	readonly draining: boolean;
}

// ---------------------------------------------------------------------------
// Module-level queue state (single process, single dispatcher instance)
// ---------------------------------------------------------------------------

/** FIFO queue of tasks waiting to be dispatched. */
let queue: DispatchQueueEntry[] = [];
/** True while drainQueue() is executing — prevents re-entrant drains. */
let draining = false;
/**
 * Monotonically increasing registration generation counter.
 * Each registerTaskDispatcher call bumps this. Background async operations
 * (startup sweeps, concurrent drains) check their captured generation against
 * the current one — if mismatched, they are from a stale registration and must
 * not modify the current queue.
 *
 * @lore AD2: Without this guard, a disposed test's background drain (using a
 * closed DB) can throw a ReferenceError, which the "unrecoverable" catch block
 * treats as a splice-worthy error, removing the NEXT test's queue entry.
 * The generation counter is the simplest correct fix.
 */
let currentGeneration = 0;

// ---------------------------------------------------------------------------
// provisionSession resolution
// ---------------------------------------------------------------------------

/**
 * Resolve provisionSession from the registry.
 *
 * @lore AD2: The original approach used `await import("@hyperidle/server/...")`.
 * This fails in Vite SSR test mode because the dynamic import triggers Vite's
 * module transform pipeline, which creates a TDZ circular reference when
 * session-provisioning imports @hyperidle/fabric back. The registry pattern
 * (provision-registry.ts) breaks the cycle: task-dispatcher imports a leaf
 * module; the server and test files register the real function before dispatch
 * runs. See provision-registry.ts for the full explanation.
 */
// biome-ignore lint/suspicious/noExplicitAny: provisionSession type from server not importable here (circular dep)
function resolveProvisionSession(): (...args: any[]) => Promise<any> {
	const fn = getProvisionSessionFn();
	if (!fn) {
		throw new Error(
			"[task-dispatcher] provisionSession not registered. " +
				"Call setProvisionSessionFn(provisionSession) during server bootstrap " +
				"(or in tests before registerTaskDispatcher).",
		);
	}
	return fn;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a task already has an active session (idempotency guard).
 */
async function hasActiveSession(db: HyperIdleDb, taskId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: sessions.id })
		.from(sessions)
		.where(and(eq(sessions.taskId, taskId), eq(sessions.state, "active")))
		.limit(1);
	return row !== undefined;
}

/**
 * Enqueue a task for dispatch. Skips if already in queue (deduplication) or
 * if the task already has an active session (idempotency).
 */
async function enqueue(db: HyperIdleDb, entry: DispatchQueueEntry): Promise<void> {
	// Deduplication: skip if already in queue
	if (queue.some((e) => e.taskId === entry.taskId)) {
		return;
	}
	// Idempotency: skip if already dispatched (active session exists)
	if (await hasActiveSession(db, entry.taskId)) {
		return;
	}
	queue.push(entry);
}

// ---------------------------------------------------------------------------
// Drain logic
// ---------------------------------------------------------------------------

/**
 * Process the queue head-first, calling provisionSession for each entry.
 *
 * ConcurrencyLimitError: advance the drain cursor past all entries for this
 * agent (they stay in the queue). On next session_ended trigger, drain retries.
 *
 * CostCapExceededError: stop draining entirely (factory/team/agent over budget).
 * Entries remain in queue and will be retried on next capacity-freed event.
 *
 * Credential resolution failure: unrecoverable — remove from queue, log error.
 * Task remains in accepted state (provisionSession never ran).
 *
 * Other errors: unrecoverable — remove from queue, log error. provisionSession's
 * own revertTaskToAccepted restores the task to accepted state.
 *
 * @lore AD2: Fire-and-forget pattern (void drainQueue().catch()) matches
 * routine-scheduler.ts. The drain-in-progress guard prevents thundering herd
 * when multiple session_ended events arrive in a burst.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: drain logic must handle concurrency errors, cost cap errors, idempotency guards, and generation staleness in a single sequential pass — decomposing further would obscure the control flow
async function drainQueue(deps: TaskDispatcherDeps, generation: number): Promise<void> {
	if (draining) return;
	// Stale registration guard: if this drain was scheduled before a dispose+re-register,
	// the generation counter will have advanced. Bail out to avoid corrupting the new queue.
	if (generation !== currentGeneration) return;

	draining = true;

	try {
		const provisionSession = resolveProvisionSession();

		// Track agents blocked by ConcurrencyLimitError in this drain pass
		const concurrencyBlockedAgents = new Set<string>();

		let i = 0;
		while (i < queue.length) {
			// Stale-generation check inside loop — re-register disposes this drain
			if (generation !== currentGeneration) break;

			const entry = queue[i];
			if (!entry) {
				i++;
				continue;
			}

			// Skip agents blocked by ConcurrencyLimitError in this pass
			if (concurrencyBlockedAgents.has(entry.agentId)) {
				i++;
				continue;
			}

			// Check idempotency before attempting (state may have changed since enqueue)
			if (await hasActiveSession(deps.db, entry.taskId)) {
				if (generation !== currentGeneration) break;
				queue.splice(i, 1);
				continue;
			}

			if (generation !== currentGeneration) break;

			try {
				// Resolve model tier if resolver is available
				// biome-ignore lint/suspicious/noExplicitAny: resolvedModel type from server not importable here
				let resolvedModel: any;
				if (deps.resolveModel) {
					try {
						resolvedModel = await deps.resolveModel("workhorse");
					} catch (credErr) {
						if (generation !== currentGeneration) break;
						// Credential resolution failure — unrecoverable for this task
						logger.error("credential resolution failed; removing task from queue", {
							taskId: entry.taskId,
							error: credErr instanceof Error ? credErr.message : String(credErr),
						});
						queue.splice(i, 1);
						continue;
					}
				}

				await provisionSession(
					{
						db: deps.db,
						eventBus: deps.eventBus,
						adapterPool: deps.adapterPool,
						workspace: deps.workspace,
						mcpBridgeRegistry: deps.mcpBridgeRegistry,
						mcpBaseUrl: deps.mcpBaseUrl,
					},
					{
						taskId: entry.taskId,
						agentId: entry.agentId,
						productId: entry.teamId,
						workspaceBasePath: deps.workspaceBasePath,
						resolvedModel,
					},
				);

				if (generation !== currentGeneration) break;

				// Success: remove from queue
				queue.splice(i, 1);
				// Don't increment i — next entry is now at position i
			} catch (err) {
				if (generation !== currentGeneration) break;

				if (err instanceof ConcurrencyLimitError) {
					// This agent is at capacity — skip all entries for this agent in this pass
					// They remain in queue for the next session_ended trigger
					concurrencyBlockedAgents.add(entry.agentId);
					i++;
					continue;
				}

				if (err instanceof CostCapExceededError) {
					// Over budget — stop draining entirely; entries remain in queue
					// @lore AF3 C13: after instanceof narrowing, err is CostCapExceededError.
					const costErr: CostCapExceededError = err;
					logger.warn("cost cap exceeded; pausing queue drain", {
						taskId: entry.taskId,
						entityId: costErr.entityId,
					});
					break;
				}

				// Unrecoverable error (adapter unavailable, task not found, etc.)
				// provisionSession's own revertTaskToAccepted restores task state
				logger.error("dispatch failed (unrecoverable); removing task from queue", {
					taskId: entry.taskId,
					error: err instanceof Error ? err.message : String(err),
				});
				queue.splice(i, 1);
				// Don't increment i
			}
		}
	} finally {
		// Always reset draining — generation checks inside the loop prevent wrong queue
		// modifications; the flag itself must be freed unconditionally so the next
		// scheduleDrain() can proceed regardless of whether this drain went stale.
		draining = false;
	}
}

// ---------------------------------------------------------------------------
// Startup sweep
// ---------------------------------------------------------------------------

/**
 * Query the DB for tasks that should be dispatched on startup:
 * state=accepted, ownerAgentId IS NOT NULL, no active session.
 *
 * @lore AD2: Only accepted tasks are swept — in_progress tasks that lost their
 * session are handled by the session_ended event handler (handoff re-dispatch
 * via ownerAgentId mismatch check). Including in_progress here caused the
 * idempotency test to create a second session: after the first registration
 * dispatched a task and the session completed (with the task still in_progress
 * because lifecycle-propagation is not wired in tests), re-registering would
 * find the in_progress task with no active session and dispatch again.
 */
async function startupSweep(db: HyperIdleDb): Promise<void> {
	// Find active session task IDs to exclude
	const activeSessions = await db
		.select({ taskId: sessions.taskId })
		.from(sessions)
		.where(eq(sessions.state, "active"));
	const activeTaskIds = new Set(activeSessions.map((s) => s.taskId));

	// Find dispatchable tasks (accepted state only)
	const dispatchableTasks = await db
		.select({
			id: tasks.id,
			ownerAgentId: tasks.ownerAgentId,
			teamId: tasks.teamId,
			state: tasks.state,
		})
		.from(tasks)
		.where(and(isNotNull(tasks.ownerAgentId), eq(tasks.state, "accepted")));

	for (const task of dispatchableTasks) {
		if (!task.ownerAgentId) continue;
		if (activeTaskIds.has(task.id)) continue;

		queue.push({
			taskId: task.id,
			agentId: task.ownerAgentId,
			teamId: task.teamId ?? task.id,
			enqueuedAt: Date.now(),
		});
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the task dispatcher. Returns a disposer that unsubscribes from
 * events and resets queue state.
 *
 * Performs a startup sweep immediately on registration.
 * Subscribes to:
 *   - task_state_changed (toState=accepted) — enqueue if ownerAgentId set
 *   - session_ended — re-dispatch for handoff + free capacity drain
 */
export function registerTaskDispatcher(deps: TaskDispatcherDeps): () => void {
	// Bump generation to invalidate any in-flight async operations from previous registration
	currentGeneration++;
	const myGeneration = currentGeneration;

	// Reset module-level state for this registration
	queue = [];
	draining = false;

	const { db, eventBus } = deps;

	/**
	 * Schedule an async drain without blocking the calling event handler.
	 * Fire-and-forget pattern matching routine-scheduler.ts.
	 * Captures myGeneration so stale drains (from disposed registrations) are no-ops.
	 */
	function scheduleDrain(): void {
		void drainQueue(deps, myGeneration).catch((err) => {
			logger.error("drainQueue threw unexpectedly", {
				error: err instanceof Error ? err.message : String(err),
			});
		});
	}

	// ── Event handler: task accepted with ownerAgentId set
	const handleTaskStateChanged = (event: TaskStateChangedEvent): void => {
		if (event.toState !== "accepted") return;

		void (async () => {
			const [task] = await db
				.select({
					ownerAgentId: tasks.ownerAgentId,
					teamId: tasks.teamId,
				})
				.from(tasks)
				.where(eq(tasks.id, event.taskId))
				.limit(1);

			if (!task?.ownerAgentId) return; // No agent assigned — skip

			await enqueue(db, {
				taskId: event.taskId,
				agentId: task.ownerAgentId,
				teamId: task.teamId ?? event.taskId,
				enqueuedAt: Date.now(),
			});

			scheduleDrain();
		})();
	};

	// ── Event handler: session ended (handoff re-dispatch + capacity freed)
	const handleSessionEnded = (event: SessionEndedEvent): void => {
		void (async () => {
			// Case 1: Handoff re-dispatch — task is in_progress but ownerAgentId changed
			// @lore AD2: session_ended fires from provisionSession's teardown path
			// (endSession/crashSession), NOT from handoff-protocol directly. The handoff
			// commits ownerAgentId=agentB to the DB before the harness stream ends, so
			// by the time session_ended fires, ownerAgentId is already agentB. Safe.
			if (event.taskId) {
				const [task] = await db
					.select({
						ownerAgentId: tasks.ownerAgentId,
						teamId: tasks.teamId,
						state: tasks.state,
					})
					.from(tasks)
					.where(eq(tasks.id, event.taskId))
					.limit(1);

				if (
					task?.state === "in_progress" &&
					task.ownerAgentId &&
					task.ownerAgentId !== event.agentId
				) {
					// New owner — dispatch if no active session exists
					if (!(await hasActiveSession(db, event.taskId))) {
						await enqueue(db, {
							taskId: event.taskId,
							agentId: task.ownerAgentId,
							teamId: task.teamId ?? event.taskId,
							enqueuedAt: Date.now(),
						});
					}
				}
			}

			// Case 2: Capacity freed — try draining the existing queue
			scheduleDrain();
		})();
	};

	// Subscribe to events
	const unsubTaskStateChanged = eventBus.on("task_state_changed", handleTaskStateChanged);
	const unsubSessionEnded = eventBus.on("session_ended", handleSessionEnded);

	// Perform startup sweep (async, fire-and-forget drain after sweep)
	void startupSweep(db)
		.then(() => {
			if (queue.length > 0) {
				scheduleDrain();
			}
		})
		.catch((err) => {
			logger.error("startup sweep failed", {
				error: err instanceof Error ? err.message : String(err),
			});
		});

	// Return disposer
	return (): void => {
		unsubTaskStateChanged();
		unsubSessionEnded();
		// Bump generation to invalidate any in-flight drains from this registration.
		// In-flight drains check `generation !== currentGeneration` and become no-ops.
		// The next registerTaskDispatcher will bump again, creating a new valid generation.
		currentGeneration++;
		queue = [];
		draining = false;
	};
}

/**
 * Get a snapshot of the current dispatch queue state.
 * Called by GET /api/dispatch-queue for observability.
 */
export function getDispatchQueueSnapshot(): DispatchQueueSnapshot {
	return {
		entries: [...queue],
		draining,
	};
}
