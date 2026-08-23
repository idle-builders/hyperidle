/** Reactive lifecycle propagation. */

import type { HyperIdleDb } from "@hyperidle/db";
import {
	type BetStateChangedEvent,
	type BetStatus,
	canTransitionTaskState,
	type PropagationAppliedEvent,
	type PropagationFailedEvent,
	type PropagationLevel,
	type SessionEndedEvent,
	InvalidTransitionError as SharedInvalidTransitionError,
	TaskInvalidTransitionError,
	type TaskState,
	type TaskStateChangedEvent,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { PolicyDeps } from "./ports.js";

type LifecyclePropagationDeps = Pick<PolicyDeps, "work" | "conversation" | "users">;

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

/** ID of the system agent that authors propagation review threads. */
const SYSTEM_PROPAGATION_AGENT_ID = "system:propagation";

/** Terminal task states — tasks in these states are "done" for bet completion purposes. */
const TERMINAL_TASK_STATES = new Set(["done", "killed"]);

// ─── Session -> Task propagation ─────────────────────────────────────────────

async function propagateSessionToTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	sessionId: string,
	taskId: string,
	outcome: string,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	// F2: Only propagate on completed outcome. crashed and stopped do not trigger transitions.
	if (outcome !== "completed") return;

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

	// DB reads and transition inside the catch so any read error is reported via
	// propagation_failed (not an unhandled rejection).
	try {
		// Check task exists and is in_progress
		const task = await deps.work.getTaskById(db, taskId);
		if (!task) return;
		if (task.state !== "in_progress") return;

		await transitionTask(db, eventBus, taskId, "review", deps);

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
		// F1: InvalidTransitionError from a race condition — silently skip.
		if (isInvalidTransitionError(err)) return;
		// Unexpected error — emit propagation_failed for extension subscribers.
		// @lore AU44 batch6: the retry/log apparatus is gone (propagation_log
		// drop, Ruling 2). A failed hop is announced on the bus and stops; the
		// `propagation_failed` event is the extension point for any team that
		// wants a notification or retry.
		const failedEvent: PropagationFailedEvent = {
			type: "propagation_failed",
			streamId: taskId,
			sourceLevel: "session" as PropagationLevel,
			sourceId: sessionId,
			targetLevel: "task" as PropagationLevel,
			targetId: taskId,
			failureReason: err instanceof Error ? err.message : String(err),
			timestamp: Date.now(),
		};
		eventBus.emit(failedEvent);
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
): Promise<void> {
	// All DB reads and the transition are inside the try so that read failures
	// are reported via propagation_failed (not left as unhandled rejections).
	let betId: string | undefined;
	try {
		// Look up the task to get its betId
		const task = await deps.work.getTaskById(db, taskId);
		if (!task) return;

		betId = task.betId;

		// Look up the bet — only propagate if bet is in an active state
		const bet = await deps.work.getBetById(db, betId);
		if (!bet) return;

		// @lore U1: statuses simplified: "shipped" → "completed", "review" dropped.
		const TERMINAL_BET_STATES = new Set(["completed", "killed"]);
		if (TERMINAL_BET_STATES.has(bet.status)) return;

		// Query all tasks on this bet
		const allBetTasks = await deps.work.listTasks(db, { betId });
		if (allBetTasks.length === 0) return;

		// Check: are ALL tasks in terminal state?
		const allTerminal = allBetTasks.every((t) => TERMINAL_TASK_STATES.has(t.state));
		if (!allTerminal) return;

		// @lore U1: `active` → `completed` (formerly active → review).
		const fromStatus = bet.status;
		await transitionBetToCompletedAsync(db, eventBus, betId, deps);

		// Create ship-confirmation review thread
		await createShipConfirmationThread(db, eventBus, betId, allBetTasks, deps);

		// Emit propagation_applied for the task -> bet hop (observability).
		const appliedEvent: PropagationAppliedEvent = {
			type: "propagation_applied",
			streamId: betId,
			sourceLevel: "task" as PropagationLevel,
			sourceId: taskId,
			targetLevel: "bet" as PropagationLevel,
			targetId: betId,
			targetTransition: `${fromStatus} -> completed`,
			timestamp: Date.now(),
		};
		eventBus.emit(appliedEvent);
	} catch (err) {
		if (isInvalidTransitionError(err)) {
			// F4: Race condition — bet was already moved by human. Silently skip.
			return;
		}
		// Unexpected error — emit propagation_failed for extension subscribers.
		const failedEvent: PropagationFailedEvent = {
			type: "propagation_failed",
			streamId: betId ?? taskId,
			sourceLevel: "task" as PropagationLevel,
			sourceId: taskId,
			targetLevel: "bet" as PropagationLevel,
			targetId: betId ?? taskId,
			failureReason: err instanceof Error ? err.message : String(err),
			timestamp: Date.now(),
		};
		eventBus.emit(failedEvent);
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
async function emitBetToTeamPropagation(
	db: HyperIdleDb,
	eventBus: EventBus,
	betId: string,
	newStatus: string,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	// DB read inside try so a read failure is reported via propagation_failed.
	try {
		// Look up the bet to find its teamId
		const bet = await deps.work.getBetById(db, betId);
		// @lore U1: `teamId` replaces `productId`.
		const teamId = bet?.teamId ?? betId; // fallback to betId if bet not found (shouldn't happen)

		// Team status is derived on read — no write-time propagation needed.
		// Emit propagation_applied for observability.
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
	} catch (err) {
		const failedEvent: PropagationFailedEvent = {
			type: "propagation_failed",
			streamId: betId,
			sourceLevel: "bet" as PropagationLevel,
			sourceId: betId,
			targetLevel: "team" as PropagationLevel,
			targetId: betId,
			failureReason: err instanceof Error ? err.message : String(err),
			timestamp: Date.now(),
		};
		eventBus.emit(failedEvent);
	}
}

// ─── Public registration function ─────────────────────────────────────────────

/**
 * Register lifecycle propagation event handlers on the EventBus.
 *
 * Returns an unsubscribe function that tears down all subscriptions.
 *
 * @lore AU44 batch6: propagation_log table dropped (AU20 Ruling 2 affirmed
 * by founder). The retry heartbeat, `recordPropagationHop`, `retryFailedPropagations`,
 * and `LogSink` are all deleted. A failed hop emits `propagation_failed` on the
 * bus (the extension surface for plugins) and stops; manual repair is one legal
 * click.
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
		})();
	});

	// Handler 2: task_state_changed -> evaluate bet transition
	const unsubTaskChanged = eventBus.on("task_state_changed", (event: TaskStateChangedEvent) => {
		if (event.toState === "done" || event.toState === "killed") {
			void (async () => {
				await propagateTaskToBet(db, eventBus, event.taskId, deps);
			})();
		}
	});

	// Handler 3: bet_state_changed -> emit bet->team propagation (derived on read)
	// @lore U1: "shipped" → "completed"; logBetToProductPropagation → emitBetToTeamPropagation.
	const unsubBetChanged = eventBus.on("bet_state_changed", (event: BetStateChangedEvent) => {
		if (event.toState === "completed" || event.toState === "killed") {
			void emitBetToTeamPropagation(db, eventBus, event.betId, event.toState, deps);
		}
	});

	return () => {
		unsubSessionEnded();
		unsubTaskChanged();
		unsubBetChanged();
	};
}

export { registerLifecyclePropagation };
