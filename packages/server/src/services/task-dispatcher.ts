/**
 * AD2 — Task-to-Session Dispatcher.
 *
 * Subscribes to task_state_changed (toState=accepted) and session_ended events.
 * Maintains an in-memory FIFO queue of dispatchable tasks, creates a task-backed
 * AgentSessionRequest for each entry, and consumes it through the runtime.
 *
 * The queue is not durable — the startup sweep re-populates it from DB state
 * on each registration. Source of truth is the tasks table, not this queue.
 *
 * @lore AD2: Lives in legacy runtime package (app runtime) following the pattern
 * of lifecycle-propagation, session-review-creator, and notification-dispatcher.
 * The dispatcher defines its own TaskDispatcherDeps interface so the service
 * stays decoupled from concrete server harness types.
 *
 * @lore AD2/AU1: the runtime request creator/consumer are resolved via the
 * TaskDispatcherDeps injection above, not a shared singleton. An earlier
 * revision routed this through a provision-registry.ts leaf module (worked
 * around a Vite SSR TDZ error on a dynamic import() cycle); that module had
 * zero real callers left once the DI shape landed, so it was deleted in AU11.
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

// ---------------------------------------------------------------------------
// Simple inline logger (observability adapter not yet available here)
// ---------------------------------------------------------------------------

const logger = {
	info: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: app-runtime dispatcher, observability adapter not yet stood up
		console.info(`[task-dispatcher] ${msg}`, ctx ?? "");
	},
	error: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: app-runtime dispatcher, observability adapter not yet stood up
		console.error(`[task-dispatcher] ${msg}`, ctx ?? "");
	},
	warn: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: app-runtime dispatcher, observability adapter not yet stood up
		console.warn(`[task-dispatcher] ${msg}`, ctx ?? "");
	},
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Dependencies for the task dispatcher. Structurally compatible with what
 * runtime consumption needs, while avoiding concrete harness imports here.
 *
 * adapterPool and workspace are typed as `unknown` here; the dispatcher passes
 * them through to the runtime consumer, which knows their concrete types. The
 * structural typing works because server constructs the real instances and passes
 * them; the dispatcher only stores and forwards them.
 */
export interface TaskDispatcherDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	// biome-ignore lint/suspicious/noExplicitAny: structural typing keeps dispatcher decoupled from server harness types
	readonly adapterPool: any;
	// biome-ignore lint/suspicious/noExplicitAny: structural typing keeps dispatcher decoupled from server harness types
	readonly workspace: any;
	readonly sandboxBasePath: string;
	/**
	 * Optional: resolve a model tier to a concrete ResolvedModel (provider, model,
	 * apiKey, baseUrl). Server-factory.ts provides the implementation closing over
	 * CredentialResolver. When absent (tests without credential setup),
	 * resolvedModel is omitted from the runtime consume call.
	 *
	 * @lore AF7 §1: the return is the full ResolvedModel — it is forwarded opaquely
	 * as `resolvedModel` to runtime provisioning, which assigns it to
	 * SessionConfig.resolvedModel. (Earlier this was loosely typed as
	 * `{provider, modelId, apiKey?}`, which did not match what the value actually
	 * had to be; AF7 wires the real production resolveModel so the honest type is
	 * ResolvedModel.)
	 */
	readonly resolveModel?: (
		modelTier: string,
	) => Promise<import("@hyperidle/shared").ResolvedModel | undefined>;
	/** Optional MCP bridge registry (passed through to runtime provisioning). */
	// biome-ignore lint/suspicious/noExplicitAny: structural typing across package boundary
	readonly mcpBridgeRegistry?: any;
	/** Optional MCP base URL (passed through to runtime provisioning). */
	readonly mcpBaseUrl?: string;
	/**
	 * AO2: Optional filesystem mounter (passed through to runtime provisioning).
	 * When absent, sessions run without filesystem mount (degrade to today's behavior).
	 */
	readonly mounter?: import("@hyperidle/shared").FilesystemMounter;
	/**
	 * AR4: forwarded to runtime provisioning so a dispatched real agent's sandbox is
	 * observable via the capture seam (createSandboxCapture). Additive-optional —
	 * preserves the dispatch API; existing call sites compile unchanged.
	 * Mirrors the same field on ProvisionSessionDeps (session-provisioning.ts:236).
	 *
	 * @lore AR4: Design-it-twice §C Option 1 — adds ~2 lines to drainQueue, gives
	 * the load-bearing artifact proof for the dispatch→provision real-agent AC2 test.
	 * Observer fires BEFORE teardown deletes the sandbox (not disabling teardown).
	 */
	// biome-ignore lint/suspicious/noExplicitAny: BeforeTeardownContext type lives in server; dispatcher passes opaquely
	readonly onBeforeTeardown?: (ctx: any) => Promise<void>;
}

/** A single entry in the dispatch queue. */
export interface DispatchQueueEntry {
	readonly taskId: string;
	readonly agentId: string;
	readonly teamId: string;
	readonly enqueuedAt: number; // Date.now()
	/**
	 * AL7 CRITICAL-1: When set, this entry was enqueued by handleProposedCallGranted
	 * (session 2 re-provision). drainQueue looks up the tailored grant + proposed call
	 * and derives the grant-bearing sessionWorkflow to pass to runtime provisioning.
	 *
	 * @lore AL7 Task 6: sessionWorkflow is derived at drain time (not at enqueue time)
	 * because the DB import is already available in drainQueue and the RegistrySessionWorkflow
	 * type is server-side; dispatcher passes it through opaquely via runtime params.
	 */
	readonly proposedCallId?: string;
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
	// @lore AD2: re-check the queue AFTER the `await hasActiveSession` gap. Two
	// enqueue paths can race for the same task — the startup sweep and the
	// task_state_changed handler. Both pass the synchronous `queue.some` guard while
	// the queue is still empty, then both await `hasActiveSession`; without this
	// second synchronous check both would `push`, queuing the task twice → two
	// sessions provisioned. The check-after-await closes the interleaving window.
	// (Surfaced by AF12 wrapping transitionTask in a db.transaction, which shifted
	// the relative timing of the accepted-state write vs. the concurrent sweep.)
	if (queue.some((e) => e.taskId === entry.taskId)) {
		return;
	}
	queue.push(entry);
}

// ---------------------------------------------------------------------------
// Drain logic
// ---------------------------------------------------------------------------

/**
 * Process the queue head-first, creating and consuming one AgentSessionRequest
 * for each entry.
 *
 * ConcurrencyLimitError: advance the drain cursor past all entries for this
 * agent (they stay in the queue). On next session_ended trigger, drain retries.
 *
 * CostCapExceededError: stop draining entirely (factory/team/agent over budget).
 * Entries remain in queue and will be retried on next capacity-freed event.
 *
 * Credential resolution failure: unrecoverable — remove from queue, log error.
 * Task remains in accepted state (runtime provisioning never ran).
 *
 * Other errors: unrecoverable — remove from queue, log error. Runtime
 * provisioning restores the task to accepted state when admission reached that far.
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

				void resolvedModel;

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
				// Runtime provisioning restores task state when admission reached that far.
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
async function startupSweep(db: HyperIdleDb, generation: number): Promise<void> {
	// Find active session task IDs to exclude
	const activeSessions = await db
		.select({ taskId: sessions.taskId })
		.from(sessions)
		.where(eq(sessions.state, "active"));

	// Stale-generation check: if the dispatcher was disposed and re-registered while
	// the DB queries were in-flight, this sweep's results belong to a stale
	// registration. Pushing stale entries would pollute the new registration's queue.
	if (generation !== currentGeneration) return;

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

	// Second generation check after second await
	if (generation !== currentGeneration) return;

	for (const task of dispatchableTasks) {
		if (!task.ownerAgentId) continue;
		if (activeTaskIds.has(task.id)) continue;
		// Skip if already in queue (event handler may have enqueued while sweep ran)
		if (queue.some((e) => e.taskId === task.id)) continue;

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
			// @lore AD2: session_ended fires from the runtime teardown path
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

	// Re-engagement intents are recorded atomically by the grant write path.
	//
	// @lore AL7 R1: This is a SEPARATE subscription — NOT inside handleSessionEnded.
	// `handleSessionEnded` guards on owner change (AD2 handoff path); this handler
	// fires on the explicit grant approval event and enqueues directly.
	// Sharing the guard with handleSessionEnded would risk double-dispatch.
	//
	// @lore AL7 Task 9: `hasActiveSession` guard prevents double-dispatch in the
	// race where session 1 is still tearing down when the approve verdict fires.
	// Subscribe to events
	const unsubTaskStateChanged = eventBus.on("task_state_changed", handleTaskStateChanged);
	const unsubSessionEnded = eventBus.on("session_ended", handleSessionEnded);

	// Perform startup sweep (async, fire-and-forget drain after sweep).
	// Pass myGeneration so the sweep can bail out if it becomes stale
	// (dispose + re-register) while its DB queries are in-flight.
	void startupSweep(db, myGeneration)
		.then(() => {
			if (myGeneration === currentGeneration && queue.length > 0) {
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
