/**
 * L20 — Lifecycle Propagation Engine.
 *
 * Registers event handlers on the EventBus that propagate state changes
 * upward through the five-level hierarchy:
 *   session -> task -> bet -> product (derived on read)
 *
 * All propagation attempts are logged to propagation_log for auditability
 * and retry. Transient failures are stored with status=pending_retry and
 * re-attempted by a periodic heartbeat.
 *
 * @lore L20: Product and portfolio status are DERIVED on read — no write-time
 * propagation needed. The bet->product hop just logs the event for audit.
 *
 * @lore L20: messages.senderId has an FK constraint to agents.id. The
 * review thread created when a bet enters review uses "system:propagation"
 * as senderId. Production must ensure this agent row exists (seed or
 * migration). Tests seed it explicitly in beforeEach (F6 from arch review).
 *
 * @lore L20: propagation_log has no retention policy — rows accumulate
 * indefinitely. At current expected volumes (~10 propagations/day) a year's
 * worth is ~3,650 rows — negligible. A follow-up story should add a TTL
 * sweep after volumes are better understood. See F5 from arch review.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import {
	bets,
	factorySettings,
	messages,
	type NewPropagationLogRow,
	notificationQueue,
	propagationLog,
	sessions,
	tasks,
	threads,
} from "@hyperidle/db";
import {
	type BetStatus,
	type EventBus,
	type PropagationAppliedEvent,
	type PropagationFailedEvent,
	type PropagationLevel,
	InvalidTransitionError as SharedInvalidTransitionError,
} from "@hyperidle/shared";
import { and, eq, ne } from "drizzle-orm";
import type { RevisionLogEntry } from "./bet-state-machine.js";
import { transitionTask } from "./task-state-machine.js";

/** Type guard: check if an error is an InvalidTransitionError from either source. */
function isInvalidTransitionError(err: unknown): boolean {
	return err instanceof Error && err.name === "InvalidTransitionError";
}

/** Valid bet states that can transition to 'review' via propagation. */
const PROPAGATABLE_BET_STATES: ReadonlySet<BetStatus> = new Set([
	"in_progress",
	"behind",
	"blocked",
	"paused",
]);

/**
 * Synchronously transition a bet to 'review' for propagation purposes.
 *
 * @lore L20: We cannot call transitionBet() (which is async) from a
 * synchronous EventBus handler without losing synchronous execution semantics.
 * transitionBet() has no real async work (uses synchronous better-sqlite3),
 * but its async signature means .then() executes in the microtask queue —
 * after tests assert results. This synchronous version duplicates the minimal
 * bet-to-review transition logic. See architecture trade-off §12.1.
 *
 * We handle the compare-and-set (CAS) pattern the same way transitionBet does:
 * WHERE status = fromState — if 0 rows updated, throw InvalidTransitionError.
 */
function transitionBetToReviewSync(db: HyperIdleDb, eventBus: EventBus, betId: string): void {
	const bet = db.select().from(bets).where(eq(bets.id, betId)).get();
	if (!bet) throw new Error(`Bet '${betId}' not found`);

	const fromState = bet.status as BetStatus;

	if (!PROPAGATABLE_BET_STATES.has(fromState)) {
		throw new SharedInvalidTransitionError(fromState, "review");
	}

	// Build revision log entry
	const existingLog: RevisionLogEntry[] = bet.revisionLog
		? (JSON.parse(bet.revisionLog) as RevisionLogEntry[])
		: [];

	const entry: RevisionLogEntry = {
		timestamp: new Date().toISOString(),
		field: "status",
		old_value: fromState,
		new_value: "review",
		reason: "All tasks completed — system propagation",
		actor: SYSTEM_PROPAGATION_AGENT_ID,
	};
	const updatedLog = JSON.stringify([...existingLog, entry]);

	// CAS update — only if still in fromState
	const result = db
		.update(bets)
		.set({ status: "review", revisionLog: updatedLog } as Record<string, string>)
		.where(and(eq(bets.id, betId), eq(bets.status, fromState)))
		.run();

	if (result.changes === 0) {
		throw new SharedInvalidTransitionError(fromState, "review");
	}

	// Emit bet_state_changed (same as transitionBet does)
	eventBus.emit({
		type: "bet_state_changed",
		streamId: bet.productId,
		betId,
		fromState,
		toState: "review",
		timestamp: Date.now(),
	});
}

/** Maximum retry attempts before a propagation is marked failed. */
const MAX_RETRY_ATTEMPTS = 3;

/** ID of the system agent that authors propagation review threads. */
const SYSTEM_PROPAGATION_AGENT_ID = "system:propagation";

/** Terminal task states — tasks in these states are "done" for bet completion purposes. */
const TERMINAL_TASK_STATES = new Set(["done", "killed"]);

// ─── logPropagation helper ─────────────────────────────────────────────────────

interface LogPropagationEntry {
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

function logPropagation(db: HyperIdleDb, entry: LogPropagationEntry): void {
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
	db.insert(propagationLog).values(row).run();
}

// ─── Session -> Task propagation ─────────────────────────────────────────────

function propagateSessionToTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	sessionId: string,
	taskId: string,
	outcome: string,
): void {
	// F2: Only propagate on completed outcome. crashed and stopped do not trigger transitions.
	if (outcome !== "completed") {
		logPropagation(db, {
			sourceLevel: "session",
			sourceId: sessionId,
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: taskId,
			targetTransition: null,
			status: "skipped",
			failureReason: `outcome=${outcome} does not trigger propagation`,
		});
		return;
	}

	// Check task exists and is in_progress
	const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
	if (!task) {
		logPropagation(db, {
			sourceLevel: "session",
			sourceId: sessionId,
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: taskId,
			targetTransition: null,
			status: "skipped",
			failureReason: `task ${taskId} not found`,
		});
		return;
	}

	if (task.state !== "in_progress") {
		logPropagation(db, {
			sourceLevel: "session",
			sourceId: sessionId,
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: taskId,
			targetTransition: null,
			status: "skipped",
			failureReason: `task state is '${task.state}', not 'in_progress'`,
		});
		return;
	}

	// Check for other active sessions on this task (exclude the current session)
	const otherActiveSessions = db
		.select()
		.from(sessions)
		.where(
			and(eq(sessions.taskId, taskId), eq(sessions.state, "active"), ne(sessions.id, sessionId)),
		)
		.all();

	if (otherActiveSessions.length > 0) {
		logPropagation(db, {
			sourceLevel: "session",
			sourceId: sessionId,
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: taskId,
			targetTransition: null,
			status: "skipped",
			failureReason: `${otherActiveSessions.length} other active session(s) still running`,
		});
		return;
	}

	// Transition task to review
	try {
		transitionTask(db, eventBus, taskId, "review");
		logPropagation(db, {
			sourceLevel: "session",
			sourceId: sessionId,
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: taskId,
			targetTransition: "in_progress -> review",
			status: "applied",
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
			logPropagation(db, {
				sourceLevel: "session",
				sourceId: sessionId,
				sourceEvent: "session_ended",
				targetLevel: "task",
				targetId: taskId,
				targetTransition: null,
				status: "skipped",
				failureReason: `InvalidTransitionError (race): ${err.message}`,
			});
			return;
		}
		// Unexpected error — log as pending_retry for the heartbeat to handle
		logPropagation(db, {
			sourceLevel: "session",
			sourceId: sessionId,
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: taskId,
			targetTransition: null,
			status: "pending_retry",
			failureReason: err instanceof Error ? err.message : String(err),
		});
	}
}

// ─── Task -> Bet propagation ──────────────────────────────────────────────────

/**
 * @lore L20: propagateTaskToBet is intentionally synchronous despite
 * transitionBet being declared async. transitionBet uses only synchronous
 * better-sqlite3 operations (db.transaction is sync). We call it with
 * .then/.catch instead of await to stay synchronous in the EventBus handler
 * context. If transitionBet is ever genuinely async in the future, this
 * function must be updated to be async and callers must await it.
 */
function propagateTaskToBet(db: HyperIdleDb, eventBus: EventBus, taskId: string): void {
	// Look up the task to get its betId
	const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
	if (!task) return;

	const betId = task.betId;

	// Look up the bet — only propagate if bet is in an active state
	const bet = db.select().from(bets).where(eq(bets.id, betId)).get();
	if (!bet) return;

	const TERMINAL_BET_STATES = new Set(["shipped", "killed", "review"]);
	if (TERMINAL_BET_STATES.has(bet.status)) {
		// Bet is already terminal or in review — nothing to do
		logPropagation(db, {
			sourceLevel: "task",
			sourceId: taskId,
			sourceEvent: "task_state_changed",
			targetLevel: "bet",
			targetId: betId,
			targetTransition: null,
			status: "skipped",
			failureReason: `bet status is '${bet.status}', not propagatable`,
		});
		return;
	}

	// Query all tasks on this bet
	const allBetTasks = db.select().from(tasks).where(eq(tasks.betId, betId)).all();

	if (allBetTasks.length === 0) return;

	// Check: are ALL tasks in terminal state?
	const allTerminal = allBetTasks.every((t) => TERMINAL_TASK_STATES.has(t.state));
	if (!allTerminal) {
		// Some tasks still open — no bet transition
		return;
	}

	// All tasks are terminal — transition bet to review (synchronously).
	const fromStatus = bet.status;

	try {
		transitionBetToReviewSync(db, eventBus, betId);

		logPropagation(db, {
			sourceLevel: "task",
			sourceId: taskId,
			sourceEvent: "task_state_changed",
			targetLevel: "bet",
			targetId: betId,
			targetTransition: `${fromStatus} -> review`,
			status: "applied",
		});

		// Create ship-confirmation review thread
		createShipConfirmationThread(db, eventBus, betId, allBetTasks);
	} catch (err) {
		if (isInvalidTransitionError(err)) {
			// F4: Race condition — bet was already moved by human. Log as skipped.
			logPropagation(db, {
				sourceLevel: "task",
				sourceId: taskId,
				sourceEvent: "task_state_changed",
				targetLevel: "bet",
				targetId: betId,
				targetTransition: null,
				status: "skipped",
				failureReason: `InvalidTransitionError (race): ${err instanceof Error ? err.message : String(err)}`,
			});
			return;
		}
		logPropagation(db, {
			sourceLevel: "task",
			sourceId: taskId,
			sourceEvent: "task_state_changed",
			targetLevel: "bet",
			targetId: betId,
			targetTransition: null,
			status: "pending_retry",
			failureReason: err instanceof Error ? err.message : String(err),
		});
	}
}

// ─── Ship-confirmation review thread ─────────────────────────────────────────

function createShipConfirmationThread(
	db: HyperIdleDb,
	eventBus: EventBus,
	betId: string,
	allBetTasks: Array<{ state: string }>,
): void {
	const now = new Date().toISOString();
	const threadId = crypto.randomUUID();

	// Read founder_id from factorySettings so the thread participants list
	// reflects the configured founder rather than a hardcoded literal.
	const founderRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "founder_id"))
		.get();
	const founderId = founderRow?.value ?? "u-founder";

	const doneCount = allBetTasks.filter((t) => t.state === "done").length;
	const killedCount = allBetTasks.filter((t) => t.state === "killed").length;
	const totalCount = allBetTasks.length;

	db.insert(threads)
		.values({
			id: threadId,
			hostKind: "bet",
			hostId: betId,
			initiatorId: SYSTEM_PROPAGATION_AGENT_ID,
			participants: JSON.stringify([SYSTEM_PROPAGATION_AGENT_ID, founderId]),
			lastActiveAt: now,
			createdAt: now,
		})
		.run();

	const messageId = crypto.randomUUID();
	db.insert(messages)
		.values({
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
		})
		.run();

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

// ─── Bet -> Product propagation ───────────────────────────────────────────────

function logBetToProductPropagation(
	db: HyperIdleDb,
	eventBus: EventBus,
	betId: string,
	newStatus: string,
): void {
	// Look up the bet to find its productId
	const bet = db.select().from(bets).where(eq(bets.id, betId)).get();
	const productId = bet?.productId ?? betId; // fallback to betId if bet not found (shouldn't happen)

	// Product status is derived on read — no write-time propagation needed.
	// We log the event for audit and emit propagation_applied.
	logPropagation(db, {
		sourceLevel: "bet",
		sourceId: betId,
		sourceEvent: "bet_state_changed",
		targetLevel: "product",
		targetId: productId,
		targetTransition: null, // product status is derived, no explicit transition
		status: "applied",
	});

	const appliedEvent: PropagationAppliedEvent = {
		type: "propagation_applied",
		streamId: productId,
		sourceLevel: "bet" as PropagationLevel,
		sourceId: betId,
		targetLevel: "product" as PropagationLevel,
		targetId: productId,
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
export function retryFailedPropagations(db: HyperIdleDb, eventBus: EventBus): void {
	const pendingRows = db
		.select()
		.from(propagationLog)
		.where(eq(propagationLog.status, "pending_retry"))
		.all();

	for (const row of pendingRows) {
		if (row.attempts >= MAX_RETRY_ATTEMPTS) {
			// Exhausted retries — mark as failed and notify
			db.update(propagationLog)
				.set({ status: "failed", failureReason: "Max retries exceeded" })
				.where(eq(propagationLog.id, row.id))
				.run();

			// Create notification queue entry
			const now = new Date().toISOString();
			db.insert(notificationQueue)
				.values({
					id: crypto.randomUUID(),
					eventType: "propagation_exhausted",
					subjectId: row.id,
					severity: "warning",
					title: `Propagation failed after ${MAX_RETRY_ATTEMPTS} attempts`,
					body: `Source: ${row.sourceLevel}/${row.sourceId} -> ${row.targetLevel}/${row.targetId}. Reason: ${row.failureReason ?? "unknown"}`,
					reason: "lifecycle-propagation",
					status: "pending",
					createdAt: now,
				})
				.run();

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
		db.update(propagationLog)
			.set({ attempts: row.attempts + 1 })
			.where(eq(propagationLog.id, row.id))
			.run();

		// Re-execute the propagation based on source level
		if (row.sourceLevel === "session" && row.sourceEvent === "session_ended") {
			propagateSessionToTask(db, eventBus, row.sourceId, row.targetId, "completed");
		} else if (row.sourceLevel === "task" && row.sourceEvent === "task_state_changed") {
			propagateTaskToBet(db, eventBus, row.sourceId);
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
export function registerLifecyclePropagation(db: HyperIdleDb, eventBus: EventBus): () => void {
	// Handler 1: session_ended -> evaluate task transition
	const unsubSessionEnded = eventBus.on("session_ended", (event) => {
		propagateSessionToTask(db, eventBus, event.sessionId, event.taskId, event.outcome);
	});

	// Handler 2: task_state_changed -> evaluate bet transition
	const unsubTaskChanged = eventBus.on("task_state_changed", (event) => {
		if (event.toState === "done" || event.toState === "killed") {
			propagateTaskToBet(db, eventBus, event.taskId);
		}
	});

	// Handler 3: bet_state_changed -> log bet->product propagation (derived on read)
	const unsubBetChanged = eventBus.on("bet_state_changed", (event) => {
		if (event.toState === "shipped" || event.toState === "killed") {
			logBetToProductPropagation(db, eventBus, event.betId, event.toState);
		}
	});

	// Heartbeat: retry failed propagations every 30 seconds
	const retryInterval = setInterval(() => {
		retryFailedPropagations(db, eventBus);
	}, 30_000);

	return () => {
		unsubSessionEnded();
		unsubTaskChanged();
		unsubBetChanged();
		clearInterval(retryInterval);
	};
}
