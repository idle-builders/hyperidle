/** Reactive lifecycle propagation with durable retry logging. */

import { type HyperIdleDb, type NewPropagationLogRow, propagationLog } from "@hyperidle/db";
import {
	type BetStateChangedEvent,
	type BetStatus,
	canTransitionTaskState,
	type EventBus,
	type PropagationAppliedEvent,
	type PropagationFailedEvent,
	type PropagationLevel,
	type SessionEndedEvent,
	InvalidTransitionError as SharedInvalidTransitionError,
	TaskInvalidTransitionError,
	type TaskState,
	type TaskStateChangedEvent,
} from "@hyperidle/shared";
import { and, eq, inArray, lt } from "drizzle-orm";
import type { PolicyDeps } from "./ports.js";

type LifecyclePropagationDeps = Pick<
	PolicyDeps,
	"work" | "conversation" | "users" | "notifications"
>;

interface RevisionLogEntry {
	timestamp: string;
	field: string;
	// biome-ignore lint/style/useNamingConvention: serialized JSON format uses snake_case
	old_value: unknown;
	// biome-ignore lint/style/useNamingConvention: serialized JSON format uses snake_case
	new_value: unknown;
	reason: string;
	actor?: string;
}

async function transitionTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	toState: TaskState,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	const transitioned = await db.transaction(
		async (tx): Promise<{ fromState: TaskState } | null> => {
			// Re-read INSIDE the tx so the audit read and the CAS write serialize together.
			// @lore AU13 addendum §A6: MUST stay `tx` (not pooled `db`) — inside
			// propagation's CAS tx.
			const task = await deps.work.getTaskById(tx, taskId);
			if (!task) {
				throw new Error(`Task not found: ${taskId}`);
			}

			const fromState = task.state as TaskState;
			if (!canTransitionTaskState(fromState, toState)) {
				throw new TaskInvalidTransitionError(taskId, fromState, toState);
			}

			// Build audit trail
			const existingAudit: Array<{ from: string; to: string; timestamp: string }> = task.auditTrail
				? (JSON.parse(task.auditTrail) as Array<{ from: string; to: string; timestamp: string }>)
				: [];
			existingAudit.push({
				from: fromState,
				to: toState,
				timestamp: new Date().toISOString(),
			});

			const { applied } = await deps.work.transitionTaskState(tx, {
				taskId,
				fromState,
				patch: {
					state: toState,
					auditTrail: JSON.stringify(existingAudit),
					updatedAt: new Date().toISOString(),
				},
			});

			if (!applied) {
				throw new TaskInvalidTransitionError(taskId, fromState, toState);
			}

			return { fromState };
		},
	);

	if (!transitioned) return;

	eventBus.emit({
		type: "task_state_changed",
		streamId: taskId,
		taskId,
		fromState: transitioned.fromState,
		toState,
		timestamp: Date.now(),
	});
}

/** Type guard: check if an error is an InvalidTransitionError from either source. */
function isInvalidTransitionError(err: unknown): err is Error & { name: "InvalidTransitionError" } {
	return err instanceof Error && err.name === "InvalidTransitionError";
}

/**
 * Valid bet states that can transition to 'review' via propagation.
 * @lore U1: simplified from {in_progress,behind,blocked,paused} to {active}.
 */
const PROPAGATABLE_BET_STATES: ReadonlySet<BetStatus> = new Set(["active"]);

/**
 * Synchronously transition a bet to 'completed' for propagation purposes.
 *
 * @lore L20: We cannot call transitionBet() (which is async) from a
 * synchronous EventBus handler without losing synchronous execution semantics.
 * transitionBet() has no real async work (uses synchronous better-sqlite3),
 * but its async signature means .then() executes in the microtask queue —
 * after tests assert results. This synchronous version duplicates the minimal
 * bet-to-completed transition logic. See architecture trade-off §12.1.
 *
 * @lore U1: Status simplified. `active` → `completed` (formerly active → review).
 * `bet.productId` → `bet.teamId`.
 */
async function transitionBetToCompletedAsync(
	db: HyperIdleDb,
	eventBus: EventBus,
	betId: string,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	const bet = await deps.work.getBetById(db, betId);
	if (!bet) throw new Error(`Bet '${betId}' not found`);

	const fromState = bet.status as BetStatus;

	if (!PROPAGATABLE_BET_STATES.has(fromState)) {
		throw new SharedInvalidTransitionError(fromState, "completed");
	}

	// Build revision log entry
	const existingLog: RevisionLogEntry[] = bet.revisionLog
		? (JSON.parse(bet.revisionLog) as RevisionLogEntry[])
		: [];

	const entry: RevisionLogEntry = {
		timestamp: new Date().toISOString(),
		field: "status",
		old_value: fromState,
		new_value: "completed",
		reason: "All tasks completed — system propagation",
		actor: SYSTEM_PROPAGATION_AGENT_ID,
	};
	const updatedLog = JSON.stringify([...existingLog, entry]);

	// CAS update — only if still in fromState
	const { applied } = await deps.work.transitionBetStatus(db, {
		betId,
		fromStatus: fromState,
		patch: { status: "completed", revisionLog: updatedLog },
	});

	if (!applied) {
		throw new SharedInvalidTransitionError(fromState, "completed");
	}

	// Emit bet_state_changed (same as transitionBet does)
	// @lore U1: streamId is now bet.teamId (formerly bet.productId).
	eventBus.emit({
		type: "bet_state_changed",
		streamId: bet.teamId,
		betId,
		fromState,
		toState: "completed",
		timestamp: Date.now(),
	});
}

/** Maximum retry attempts before a propagation is marked failed. */
const MAX_RETRY_ATTEMPTS = 3;

/** ID of the system agent that authors propagation review threads. */
const SYSTEM_PROPAGATION_AGENT_ID = "system:propagation";

/** Terminal task states — tasks in these states are "done" for bet completion purposes. */
const TERMINAL_TASK_STATES = new Set(["done", "killed"]);

// ─── propagation_log accessors ───────────────────────────────────────────────

export interface LogPropagationEntry {
	sourceLevel: string;
	sourceId: string;
	sourceEvent: string;
	targetLevel: string;
	targetId: string;
	targetTransition: string | null;
	status: string;
	failureReason?: string;
	attempts?: number;
}

/**
 * Write one propagation hop. `policy` owns `propagation_log`, so this is the
 * only door onto it — for this module's own hops and for the bet-kill cascade,
 * which reaches it through a port.
 *
 * @lore The cascade used to hand-maintain its own row builder and say so: its
 * comment read "mirrors fabric's `logPropagation` field-for-field". A duplicate
 * that has to be kept identical by reading is a duplicate that drifts, and the
 * two only agreed because the cascade's inputs happened to hit the same
 * branches. There is one builder now.
 */
export async function recordPropagationHop(
	db: HyperIdleDb,
	entry: LogPropagationEntry,
): Promise<void> {
	const now = new Date().toISOString();
	const row: NewPropagationLogRow = {
		id: crypto.randomUUID(),
		sourceLevel: entry.sourceLevel,
		sourceId: entry.sourceId,
		sourceEvent: entry.sourceEvent,
		targetLevel: entry.targetLevel,
		targetId: entry.targetId,
		targetTransition: entry.targetTransition ?? null,
		status: entry.status,
		failureReason: entry.failureReason ?? null,
		attempts: entry.attempts ?? 1,
		createdAt: now,
		appliedAt: entry.status === "applied" ? now : null,
	};
	await db.insert(propagationLog).values(row);
}

/**
 * Delete settled propagation rows older than `termCutoff` — the retention
 * sweep's predicate. `applied` and `skipped` are the settled statuses;
 * `pending_retry` rows are still live work and survive the sweep regardless of
 * age.
 */
export async function reapTerminalPropagationLog(
	db: HyperIdleDb,
	termCutoff: string,
): Promise<void> {
	await db
		.delete(propagationLog)
		.where(
			and(
				lt(propagationLog.createdAt, termCutoff),
				inArray(propagationLog.status, ["applied", "skipped"]),
			),
		);
}

// ─── Session -> Task propagation ─────────────────────────────────────────────

type PropagationStatus = "applied" | "skipped" | "pending_retry";

type LogSink = (status: PropagationStatus, reason?: string) => Promise<void>;

async function propagateSessionToTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	sessionId: string,
	taskId: string,
	outcome: string,
	deps: LifecyclePropagationDeps,
	onResolve?: LogSink,
): Promise<void> {
	const log = async (entry: {
		status: PropagationStatus;
		targetTransition: string | null;
		failureReason?: string;
	}): Promise<void> => {
		if (onResolve) {
			await onResolve(entry.status, entry.failureReason);
			return;
		}
		await recordPropagationHop(db, {
			sourceLevel: "session",
			sourceId: sessionId,
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: taskId,
			targetTransition: entry.targetTransition,
			status: entry.status,
			failureReason: entry.failureReason,
		});
	};
	// F2: Only propagate on completed outcome. crashed and stopped do not trigger transitions.
	if (outcome !== "completed") {
		await log({
			status: "skipped",
			targetTransition: null,
			failureReason: `outcome=${outcome} does not trigger propagation`,
		});
		return;
	}

	// Check task exists and is in_progress
	const task = await deps.work.getTaskById(db, taskId);
	if (!task) {
		await log({
			status: "skipped",
			targetTransition: null,
			failureReason: `task ${taskId} not found`,
		});
		return;
	}

	if (task.state !== "in_progress") {
		await log({
			status: "skipped",
			targetTransition: null,
			failureReason: `task state is '${task.state}', not 'in_progress'`,
		});
		return;
	}

	// @lore AU26 J2: the "is another run still active on this task" guard is
	// DELETED, and with it core-api's last policy-side read of `sessions` (an
	// `agent-orchestration` table).
	//
	// What it defended against is NOT unreachable, and the earlier version of
	// this note claiming "a state no normal path produces" was wrong — the
	// work package's own analysis (`.pipeline/work/AU26/policy-sibling-guard.md`)
	// names two reachable paths, both confirmed in code:
	//   1. `POST /api/sessions` twice on the same task. The route checks that
	//      the task exists and the agent is runnable and nothing else
	//      (`core-api/src/routes/sessions-routes.ts`,
	//      `work/src/session-start-resolver.ts`); `concurrency.ts` caps runs per
	//      AGENT, not per task, and no DB constraint says one active run per
	//      task. No screen calls this — it is an API-only path.
	//   2. `accepted -> hold -> accepted` while the first run request is still
	//      queued (`shared/src/task-transition.ts` allows both edges). The
	//      queued request is not re-checked at drain, so a second attempt mints
	//      a second run.
	// What is genuinely absent is the ORDINARY path: a run request is only
	// created when a task enters `accepted` (`work/src/task-state-machine.ts`),
	// there is no `in_progress -> accepted` edge, and a handoff closes the old
	// run and opens the new one in ONE transaction (`handoff-protocol.ts:121`),
	// so the abandoned run is already `done` and never reaches this code
	// (`endRunForHandoff` takes no event bus, and the later `endSession` is
	// conditional on the row still being `active`).
	//
	// The residue, stated plainly: when two runs ARE live on one task, the
	// first to finish flips the task `in_progress -> review` while the second is
	// still working. The second run's end then sees a task that is no longer
	// `in_progress` and quietly does nothing. That is recoverable —
	// `review -> in_progress` is a legal move anyone can make — and under
	// ETHOS.md a preemptive wall against a state only a hand-made API call
	// reaches is not worth a cross-Layer read. Founder-ruled. No replacement
	// event, no counter, no downward call.

	// Transition task to review
	try {
		await transitionTask(db, eventBus, taskId, "review", deps);
		await log({
			status: "applied",
			targetTransition: "in_progress -> review",
		});

		// Emit propagation_applied event
		const appliedEvent: PropagationAppliedEvent = {
			type: "propagation_applied",
			streamId: taskId,
			sourceLevel: "session" as PropagationLevel,
			sourceId: sessionId,
			targetLevel: "task" as PropagationLevel,
			targetId: taskId,
			targetTransition: "in_progress -> review",
			timestamp: Date.now(),
		};
		eventBus.emit(appliedEvent);
	} catch (err) {
		// F1: InvalidTransitionError from a race condition is logged as skipped, not failed.
		if (isInvalidTransitionError(err)) {
			await log({
				status: "skipped",
				targetTransition: null,
				failureReason: `InvalidTransitionError (race): ${err.message}`,
			});
			return;
		}
		// Unexpected error — log as pending_retry for the heartbeat to handle
		await log({
			status: "pending_retry",
			targetTransition: null,
			failureReason: err instanceof Error ? err.message : String(err),
		});
	}
}

// ─── Task -> Bet propagation ──────────────────────────────────────────────────

/**
 * @lore L20: propagateTaskToBet is async — transitionBetToReview is genuinely
 * async after the PGlite migration. Callers (EventBus handlers) must wrap in
 * void (async () => { ... })() to satisfy the sync handler contract.
 */
async function propagateTaskToBet(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	deps: LifecyclePropagationDeps,
	onResolve?: LogSink,
): Promise<void> {
	// AF7 §7: on the retry path, resolve the original row in place (no new row).
	const log = async (entry: {
		status: PropagationStatus;
		targetId: string;
		targetTransition: string | null;
		failureReason?: string;
	}): Promise<void> => {
		if (onResolve) {
			await onResolve(entry.status, entry.failureReason);
			return;
		}
		await recordPropagationHop(db, {
			sourceLevel: "task",
			sourceId: taskId,
			sourceEvent: "task_state_changed",
			targetLevel: "bet",
			targetId: entry.targetId,
			targetTransition: entry.targetTransition,
			status: entry.status,
			failureReason: entry.failureReason,
		});
	};

	// Look up the task to get its betId
	const task = await deps.work.getTaskById(db, taskId);
	if (!task) return;

	const betId = task.betId;

	// Look up the bet — only propagate if bet is in an active state
	const bet = await deps.work.getBetById(db, betId);
	if (!bet) return;

	// @lore U1: statuses simplified: "shipped" → "completed", "review" dropped.
	const TERMINAL_BET_STATES = new Set(["completed", "killed"]);
	if (TERMINAL_BET_STATES.has(bet.status)) {
		// Bet is already terminal or in review — nothing to do
		await log({
			status: "skipped",
			targetId: betId,
			targetTransition: null,
			failureReason: `bet status is '${bet.status}', not propagatable`,
		});
		return;
	}

	// Query all tasks on this bet
	const allBetTasks = await deps.work.listTasks(db, { betId });

	if (allBetTasks.length === 0) return;

	// Check: are ALL tasks in terminal state?
	const allTerminal = allBetTasks.every((t) => TERMINAL_TASK_STATES.has(t.state));
	if (!allTerminal) {
		// Some tasks still open — no bet transition. Log skipped for observability and test synchronization.
		await log({
			status: "skipped",
			targetId: betId,
			targetTransition: null,
			failureReason: "Not all tasks are terminal",
		});
		return;
	}

	// All tasks are terminal — transition bet to review.
	const fromStatus = bet.status;

	try {
		// @lore U1: `active` → `completed` (formerly active → review).
		await transitionBetToCompletedAsync(db, eventBus, betId, deps);

		await log({
			status: "applied",
			targetId: betId,
			targetTransition: `${fromStatus} -> completed`,
		});

		// Create ship-confirmation review thread
		await createShipConfirmationThread(db, eventBus, betId, allBetTasks, deps);
	} catch (err) {
		if (isInvalidTransitionError(err)) {
			// F4: Race condition — bet was already moved by human. Log as skipped.
			await log({
				status: "skipped",
				targetId: betId,
				targetTransition: null,
				failureReason: `InvalidTransitionError (race): ${err instanceof Error ? err.message : String(err)}`,
			});
			return;
		}
		await log({
			status: "pending_retry",
			targetId: betId,
			targetTransition: null,
			failureReason: err instanceof Error ? err.message : String(err),
		});
	}
}

// ─── Ship-confirmation review thread ─────────────────────────────────────────

async function createShipConfirmationThread(
	db: HyperIdleDb,
	eventBus: EventBus,
	betId: string,
	allBetTasks: Array<{ state: string }>,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	const now = new Date().toISOString();
	const threadId = crypto.randomUUID();

	// P2: Read founder from users table (kind = 'human') instead of factorySettings.
	// @lore P2: fallback to "u-founder" for unseeded DBs — same sentinel as auth middleware.
	const humanUser = await deps.users.getFirstUserByKind(db, "human");
	const founderId = humanUser?.id ?? "u-founder";

	const doneCount = allBetTasks.filter((t) => t.state === "done").length;
	const killedCount = allBetTasks.filter((t) => t.state === "killed").length;
	const totalCount = allBetTasks.length;

	await deps.conversation.insertThread(db, {
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: SYSTEM_PROPAGATION_AGENT_ID,
		participants: JSON.stringify([SYSTEM_PROPAGATION_AGENT_ID, founderId]),
		lastActiveAt: now,
		createdAt: now,
	});

	const messageId = crypto.randomUUID();
	await deps.conversation.insertMessage(db, {
		id: messageId,
		senderId: SYSTEM_PROPAGATION_AGENT_ID,
		threadId,
		type: "review",
		payload: JSON.stringify({
			kind: "ship_confirmation",
			betId,
			taskSummary: { done: doneCount, killed: killedCount, total: totalCount },
			message: "All tasks on this bet are complete. Confirm shipping?",
		}),
		clientKey: `propagation-ship-${betId}-${Date.now()}`,
		createdAt: now,
	});

	eventBus.emit({
		type: "thread_created",
		streamId: threadId,
		threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: SYSTEM_PROPAGATION_AGENT_ID,
		timestamp: Date.now(),
	});
}

// ─── Bet -> Team propagation ──────────────────────────────────────────────────

/**
 * @lore U1: Renamed from logBetToProductPropagation. `"product"` level → `"team"`.
 * `bet.productId` → `bet.teamId`. Team status is derived on read — no write needed.
 */
async function logBetToTeamPropagation(
	db: HyperIdleDb,
	eventBus: EventBus,
	betId: string,
	newStatus: string,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	// Look up the bet to find its teamId
	const bet = await deps.work.getBetById(db, betId);
	// @lore U1: `teamId` replaces `productId`.
	const teamId = bet?.teamId ?? betId; // fallback to betId if bet not found (shouldn't happen)

	// Team status is derived on read — no write-time propagation needed.
	// We log the event for audit and emit propagation_applied.
	await recordPropagationHop(db, {
		sourceLevel: "bet",
		sourceId: betId,
		sourceEvent: "bet_state_changed",
		targetLevel: "team",
		targetId: teamId,
		targetTransition: null, // team status is derived, no explicit transition
		status: "applied",
	});

	const appliedEvent: PropagationAppliedEvent = {
		type: "propagation_applied",
		streamId: teamId,
		sourceLevel: "bet" as PropagationLevel,
		sourceId: betId,
		targetLevel: "team" as PropagationLevel,
		targetId: teamId,
		targetTransition: `bet -> ${newStatus}`,
		timestamp: Date.now(),
	};
	eventBus.emit(appliedEvent);
}

// ─── Retry mechanism ──────────────────────────────────────────────────────────

/**
 * Process pending_retry rows from propagation_log. Called periodically by
 * the heartbeat interval set up in registerLifecyclePropagation.
 *
 * For each pending retry, re-executes the propagation. On exhaustion
 * (attempts >= MAX_RETRY_ATTEMPTS), marks the row failed and creates a
 * notification queue entry.
 */
async function retryFailedPropagations(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	const pendingRows = await db
		.select()
		.from(propagationLog)
		.where(eq(propagationLog.status, "pending_retry"));

	for (const row of pendingRows) {
		if (row.attempts >= MAX_RETRY_ATTEMPTS) {
			// AF7 §7: CAS-guarded terminal fail. Mark failed ONLY when the row is
			// still pending_retry — so a row a prior/concurrent pass already resolved
			// to applied is NEVER flipped to failed (the "succeeded-retry-marked-
			// failed" bug). Gate the notification + propagation_failed event on the
			// CAS actually affecting a row, preventing a double-notify.
			const failedRows = await db
				.update(propagationLog)
				.set({ status: "failed", failureReason: "Max retries exceeded" })
				.where(and(eq(propagationLog.id, row.id), eq(propagationLog.status, "pending_retry")))
				.returning({ id: propagationLog.id });

			if (failedRows.length === 0) {
				// Already resolved by another pass — no notify, no event.
				continue;
			}

			// Create notification queue entry
			const now = new Date().toISOString();
			await deps.notifications.insert(db, {
				id: crypto.randomUUID(),
				eventType: "propagation_exhausted",
				subjectId: row.id,
				severity: "warning",
				title: `Propagation failed after ${MAX_RETRY_ATTEMPTS} attempts`,
				body: `Source: ${row.sourceLevel}/${row.sourceId} -> ${row.targetLevel}/${row.targetId}. Reason: ${row.failureReason ?? "unknown"}`,
				reason: "lifecycle-propagation",
				status: "pending",
				createdAt: now,
			});

			// Emit propagation_failed event
			const failedEvent: PropagationFailedEvent = {
				type: "propagation_failed",
				streamId: row.targetId,
				sourceLevel: row.sourceLevel as PropagationLevel,
				sourceId: row.sourceId,
				targetLevel: row.targetLevel as PropagationLevel,
				targetId: row.targetId,
				failureReason: row.failureReason ?? "Max retries exceeded",
				attempts: row.attempts,
				timestamp: Date.now(),
			};
			eventBus.emit(failedEvent);
			continue;
		}

		// Increment attempts and retry
		await db
			.update(propagationLog)
			.set({ attempts: row.attempts + 1 })
			.where(eq(propagationLog.id, row.id));

		// AF7 §7: resolve the ORIGINAL row in place by the retry outcome — never
		// append a parallel row (no double-log). applied/skipped → close the queue
		// entry; still-failing → keep pending_retry (attempts already bumped) so the
		// next heartbeat retries. This is the only way the heartbeat can ever drain.
		const resolveInPlace: LogSink = async (status, reason) => {
			if (status === "pending_retry") {
				// Keep the row pending; just refresh the failure reason for visibility.
				await db
					.update(propagationLog)
					.set({ failureReason: reason ?? row.failureReason ?? null })
					.where(eq(propagationLog.id, row.id));
				return;
			}
			await db
				.update(propagationLog)
				.set({
					status,
					failureReason: reason ?? null,
					appliedAt: status === "applied" ? new Date().toISOString() : null,
				})
				.where(eq(propagationLog.id, row.id));
		};

		// Re-execute the propagation based on source level, resolving in place.
		if (row.sourceLevel === "session" && row.sourceEvent === "session_ended") {
			await propagateSessionToTask(
				db,
				eventBus,
				row.sourceId,
				row.targetId,
				"completed",
				deps,
				resolveInPlace,
			);
		} else if (row.sourceLevel === "task" && row.sourceEvent === "task_state_changed") {
			await propagateTaskToBet(db, eventBus, row.sourceId, deps, resolveInPlace);
		} else if (row.sourceLevel === "bet" && row.sourceEvent === "bet_state_changed") {
			await logBetToTeamPropagation(db, eventBus, row.sourceId, "completed", deps);
			await resolveInPlace("applied");
		}
	}
}

// ─── Public registration function ─────────────────────────────────────────────

/**
 * Register lifecycle propagation event handlers on the EventBus.
 *
 * Returns an unsubscribe function that tears down all subscriptions and
 * the retry heartbeat interval.
 */
function registerLifecyclePropagation(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: LifecyclePropagationDeps,
): () => void {
	// Handler 1: session_ended -> evaluate task transition
	// @lore AF3 C9b: async handlers fail the EventHandler<T> overload (Promise<void>
	// vs void). Use sync wrapper with void async IIFE to satisfy the overload.
	// Explicit event type annotation ensures the on<T> overload resolves correctly.
	const unsubSessionEnded = eventBus.on("session_ended", (event: SessionEndedEvent) => {
		void (async () => {
			if (!event.taskId) return;
			await propagateSessionToTask(
				db,
				eventBus,
				event.sessionId,
				event.taskId,
				event.outcome,
				deps,
			);
		})().catch(async (error: unknown) => {
			await recordPropagationHop(db, {
				sourceLevel: "session",
				sourceId: event.sessionId,
				sourceEvent: "session_ended",
				targetLevel: "task",
				targetId: event.taskId ?? "unknown",
				targetTransition: null,
				status: "pending_retry",
				failureReason: error instanceof Error ? error.message : String(error),
			});
		});
	});

	// Handler 2: task_state_changed -> evaluate bet transition
	const unsubTaskChanged = eventBus.on("task_state_changed", (event: TaskStateChangedEvent) => {
		if (event.toState === "done" || event.toState === "killed") {
			void (async () => {
				await propagateTaskToBet(db, eventBus, event.taskId, deps);
			})().catch(async (error: unknown) => {
				await recordPropagationHop(db, {
					sourceLevel: "task",
					sourceId: event.taskId,
					sourceEvent: "task_state_changed",
					targetLevel: "bet",
					targetId: "unknown",
					targetTransition: null,
					status: "pending_retry",
					failureReason: error instanceof Error ? error.message : String(error),
				});
			});
		}
	});

	// Handler 3: bet_state_changed -> log bet->team propagation (derived on read)
	// @lore U1: "shipped" → "completed"; logBetToProductPropagation → logBetToTeamPropagation.
	const unsubBetChanged = eventBus.on("bet_state_changed", (event: BetStateChangedEvent) => {
		if (event.toState === "completed" || event.toState === "killed") {
			void logBetToTeamPropagation(db, eventBus, event.betId, event.toState, deps).catch(
				async (error: unknown) => {
					await recordPropagationHop(db, {
						sourceLevel: "bet",
						sourceId: event.betId,
						sourceEvent: "bet_state_changed",
						targetLevel: "team",
						targetId: event.streamId,
						targetTransition: null,
						status: "pending_retry",
						failureReason: error instanceof Error ? error.message : String(error),
					});
				},
			);
		}
	});

	// Heartbeat: retry failed propagations every 30 seconds
	const retryInterval = setInterval(() => {
		void (async () => {
			await retryFailedPropagations(db, eventBus, deps);
		})().catch(() => {
			// Failed retry rows remain eligible for the next heartbeat.
		});
	}, 30_000);

	return () => {
		unsubSessionEnded();
		unsubTaskChanged();
		unsubBetChanged();
		clearInterval(retryInterval);
	};
}

export { registerLifecyclePropagation, retryFailedPropagations };
