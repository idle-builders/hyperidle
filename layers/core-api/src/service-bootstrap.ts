/**
 * `core-api`'s Layer-level service registration.
 *
 * @lore AU26 B1b: this file used to be `server-factory.ts` and used to also hold
 * `createServer`, the whole Application composition root. That moved to
 * `applications/remote-server/src/create-server.ts` (§D-C) — a `core-api` file must
 * not mount `agent-orchestration`'s app. What is left is the two registration
 * functions an Application calls through `AppOptions.serviceBootstrap`, plus the
 * retention reapers they schedule.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { EventBus } from "@hyperidle/event-bus";
import type { PolicyDeps } from "@hyperidle/policy";
import { registerLifecyclePropagation } from "@hyperidle/policy";
import * as taskDb from "@hyperidle/task";
import { listMessages } from "@hyperidle/thread";
import { registerAgentHealthSessionEndReactions } from "./services/agent-health-session-end-reactions.js";
import { registerAgentRunAdmissionReactions } from "./services/agent-run-admission-reactions.js";
// @lore AU21 Increment 14a: cost sentinel + `costOps`/`cost-bindings.ts` are
// HARD-DELETED along with the rest of the cost feature — no replacement.
import { reapInbox } from "./services/inbox-reaper.js";
import { registerSessionNotReturnedNotice } from "./services/session-not-returned-notice.js";
import { registerWorkSessionEndReactions } from "./services/work-session-end-reactions.js";
import { registerWorkSessionStartedReactions } from "./services/work-session-started-reactions.js";

/**
 * @lore AU21 §9 Increment 9 (forensic-triage wave, second pass): the bundle
 * of provisioning-related values `registerCoreDomainServices`/
 * `registerAgentLayerServices` thread through — kept as a named type only so
 * `Boolean(ctx.dispatcherDeps)` still has a stable "is provisioning
 * configured" presence signal (`canProvision`'s default, below).
 */
interface TaskDispatcherDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	// @lore structural typing (`unknown` rather than `any` — strict): the real
	// call site (below) passes a concrete `AdapterPool`/`SandboxAdapter`; test
	// call sites pass inert fakes to exercise disposer bookkeeping only, never
	// this shape's actual runtime behavior.
	readonly adapterPool: unknown;
	readonly workspace: unknown;
	readonly sandboxBasePath: string;
	readonly mcpBridgeRegistry?: unknown;
	readonly mcpBaseUrl?: string;
	readonly mounter?: unknown;
}

const serviceBootstrapLog = createLogger({ pkg: "server.server-factory" });

function identifyBootstrapOwner(
	dispose: () => void,
	owner: string,
	cleanupEffect: string,
	constituents: readonly string[],
): () => void {
	return Object.assign(dispose, { owner, cleanupEffect, constituents });
}

/** Default staleness bound for the subscription-session reaper (1h). */
export const DEFAULT_REAPER_STALE_AFTER_MS = 60 * 60 * 1000;
/**
 * @lore AU20 C1: retention package dissolved — these constants move here
 * alongside the composition-root scheduler that calls the owning-service
 * reapers. No behavior change vs. the former @hyperidle/retention exports.
 * TERMINAL_LOG_TTL_MS is exported so the integration test can import the
 * canonical value and stay in sync if it ever changes.
 */
const RETENTION_REAPER_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const TERMINAL_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/**
 * @lore AU21 §9 Increment 10 (Decision H1): matches
 * `session-requests`'s own former `defaultRetentionBatchSize` for the same
 * terminal-row GC job, now relocated here.
 */
const TASK_DISPATCH_ATTEMPT_REAP_BATCH_SIZE = 500;

/**
 * @lore AU21 §9 Increment 10 (Decision H1): reaps terminal
 * `task_dispatch_attempts` rows older than `termCutoff`, relocated OUT of
 * `session-requests`'s `reapExpired` single atomic transaction (a harmless
 * atomicity split — pure terminal-row GC, no cross-table invariant depends on
 * it sharing that transaction) and INTO this composition root's generic
 * retention reaper, alongside `reapAccessLog`/`reapExpiredCredentials`. Calls `taskDispatchAttemptStore.reapTerminal`
 * directly — `work` owns this table, so a direct same-layer call (not a
 * cross-layer write) is how the sweep reaches every table it settles.
 * Exported so the predicate is directly testable without waiting on the real
 * 6h `setInterval`.
 */
export async function reapTerminalTaskDispatchAttempts(
	db: HyperIdleDb,
	termCutoff: string,
	batchSize: number,
): Promise<number> {
	return taskDb.taskDispatchAttemptStore.reapTerminal(db, termCutoff, batchSize);
}

/**
 * @lore AU19 Increment 2a: `@hyperidle/policy`'s DI ports (Mechanism C),
 * wired here at the `packages/server` composition point — `work`/
 * `conversation`/`users`/`org` are all real, already-migrated packages.
 * `PolicyDeps.silence` closes over `notificationsSilenceDeps` (built
 * above) so `policy` itself only ever sees the boolean-returning
 * `isSilenced` predicate, never `notifications`' own deps shape.
 *
 * @lore AU20 Am1: merged `policyEngineDeps` + `lifecyclePropagationDeps`
 * into one `PolicyDeps` aggregate. `registerPolicy` constructs the sub-shapes
 * internally; the composition root sees a single wiring point.
 */
/**
 * §6 rows 4/5: `transitionTaskState` is gone — `lifecycle-propagation.ts`
 * writes through `edit_task` now, injected as a plain function (Mechanism C,
 * `policy` may not import `@hyperidle/task` directly). `policyDeps` is
 * therefore built per-call, closing over the composed `edit_task.run` that
 * only exists once the actions list is built (`app.ts`).
 *
 * @lore code-review finding, BC3: `sendMessage` (`send_message.run`, same
 * composed-actions closure as `editTask`) replaces the raw
 * `conversation.insertMessage` binding — `lifecycle-propagation.ts`'s
 * ship-confirmation review now posts through the action, never the table.
 */
function buildPolicyDeps(
	editTask: PolicyDeps["editTask"],
	sendMessage: PolicyDeps["sendMessage"],
): PolicyDeps {
	return {
		work: {
			getTaskById: (exec: WriteExecutor, id: string) => taskDb.get(exec, "task", id),
			listChildTasks: (exec: WriteExecutor, parentTaskId: string) =>
				taskDb.list(exec, "task", { parentTaskId }),
			listAncestorIds: (exec: WriteExecutor, taskId: string) =>
				taskDb.listAncestorIds(exec, taskId),
		},
		conversation: {
			listInitiatedVerdictMessages: (db, initiatorId, windowStart) =>
				listMessages(db, {
					threadInitiatorId: initiatorId,
					types: ["verdict"],
					since: windowStart,
				}),
		},
		editTask,
		sendMessage,
	};
}

/**
 * Registers CORE-owned application services against the event bus —
 * document (relevance listener, FTS), policy engine, review routing,
 * lifecycle propagation and retention.
 *
 * Split from the former `app-runtime` shell's `bootstrapAppRuntime` —
 * together with `registerAgentLayerServices` this replicates the exact
 * same disposer set; only the grouping changed, not registration order
 * within each group (behavior-preserving).
 *
 * @lore BC5 T7b: no scheduler lives here — the subscription clock (cron/
 * due-eval) is wired in `app.ts` (§ its own `@lore`).
 */
export function registerCoreDomainServices(ctx: {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/**
	 * The seam's one port for this composition, required (not
	 * optional): every reaction that used to reach `@hyperidle/session-requests`
	 * directly now goes through it, handed in as a value by the caller
	 * (`app.ts`'s `serviceBootstrap` invocation) — never an ambient global.
	 */
	readonly agentOrchestration: AgentOrchestrationPort;
	/**
	 * `edit_task`'s own bound `run`, threaded from `app.ts`'s composed
	 * actions list. See `PolicyDeps.editTask` and
	 * `registerWorkSessionStartedReactions`.
	 */
	readonly editTask: PolicyDeps["editTask"];
	/**
	 * `send_message`'s own bound `run`, threaded from `app.ts`'s composed
	 * actions list — the never-silent-net reaction posts through it instead
	 * of a raw `insertMessage`.
	 */
	readonly sendMessage: import("./services/session-not-returned-notice.js").SendMessageRunFn;
	/**
	 * `edit_user`'s own bound `run`, threaded the same way — the
	 * crashed-session health reaction writes the agent's `health`
	 * through it instead of a notification-queue row.
	 */
	readonly editUser: import("./services/agent-health-session-end-reactions.js").EditUserRunFn;
	/** Scope (iii): when true, generic (taskId) subscriptions auto-fire. */
	readonly canProvision?: boolean;
	/** Subscription-session reaper staleness bound (ms). Default 1h. */
	readonly reaperStaleAfterMs?: number;
	/** In-process periodic reaper cadence (ms). 0 = every poll (tests). */
	readonly reaperCadenceMs?: number;
	/**
	 * Provisioning deps threaded into the subscription clock's fire-time
	 * session creation. Omitted from the type here to avoid a core-module
	 * dependency on server harness types — passed through as-is.
	 */
	readonly dispatcherDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
}): Array<() => void> {
	const { db, eventBus, editTask, sendMessage, editUser } = ctx;
	const disposers: Array<() => void> = [];

	disposers.push(
		identifyBootstrapOwner(
			registerAgentRunAdmissionReactions(db, eventBus, { sendMessage }),
			"agent-run-admission reactions",
			"unsubscribe",
			["agent_run_admission_failed subscription"],
		),
	);

	// The routine-run session-end reaction doesn't exist — a subscription's
	// wake carries no run row to finalize.

	// The degraded-agent notification, event-driven. Replaces
	// `routes/teams-routes.ts`'s deleted `maybeNotifyAgentError` — a notification
	// that only fired when a human opened the team page, via a GET that wrote.
	// Removing it closed core-api's last read of `agent-orchestration`'s
	// `sessions` table.
	disposers.push(
		identifyBootstrapOwner(
			registerAgentHealthSessionEndReactions(db, eventBus, editUser),
			"agent-health session-end reactions",
			"unsubscribe",
			["session_ended subscription"],
		),
	);

	// The task's post-session writebacks — finalizes `taskDispatchAttempts` off
	// `agent_run_lifecycle_changed` and merges accumulated per-tier tokens
	// onto the owning bet off `session_ended`, replacing
	// `run-orchestration/provisioner.ts`'s deleted direct
	// `ports.work.updateBetById` write.
	disposers.push(
		identifyBootstrapOwner(
			registerWorkSessionEndReactions(db, eventBus, editTask),
			"work session-end reactions",
			"unsubscribe",
			["agent_run_lifecycle_changed subscription", "session_ended subscription"],
		),
	);

	// A task's `in_progress`
	// transition at session launch — replaces `run-orchestration/
	// provisioner.ts`'s deleted direct `ports.work.transitionTask` write.
	disposers.push(
		identifyBootstrapOwner(
			registerWorkSessionStartedReactions(db, eventBus, editTask),
			"work session-started reactions",
			"unsubscribe",
			["session_started subscription"],
		),
	);

	// @lore BC3 architecture.md §5 B5: the assistant-thread pin reaction and
	// the B‴ coherence re-bake trigger are DELETED — no coherence re-bake
	// (architecture.md §7): a thread turn may answer a transcript one message
	// behind; accepted, because the agent reads the thread with `open_thread`
	// anyway. The wake rule (`@hyperidle/thread`'s `agentsToWake`) replaces
	// the structural `ast-` recognition both reactions depended on.

	// The never-silent net — a reaction to the
	// existing `session_not_returned` event (today only observed by the
	// observability dispatcher), posting one plain notice into the session's
	// calling thread when the force budget is spent without a return,
	// posting through the composed `send_message` action.
	disposers.push(
		identifyBootstrapOwner(
			registerSessionNotReturnedNotice(db, eventBus, sendMessage),
			"session-not-returned notice",
			"unsubscribe",
			["session_not_returned subscription"],
		),
	);

	// @lore AU21 Increment 14a: the session-cost recorder (agent-orchestration's
	// OWN `session_ended` reaction, Increment 6's per-session cost door) is
	// deleted along with the rest of the cost feature — no replacement.

	// @lore BC3 architecture.md §5 R2: the policy engine is deleted — one
	// registration (lifecycle propagation) is no longer worth collapsing.
	disposers.push(
		identifyBootstrapOwner(
			registerLifecyclePropagation(db, eventBus, buildPolicyDeps(editTask, sendMessage)),
			"lifecycle propagation registration",
			"unsubscribe",
			// @lore AU44 batch6: "retry interval" removed — the 30s heartbeat
			// (retryFailedPropagations) is deleted with propagation_log (AU20 Ruling 2).
			["lifecycle propagation"],
		),
	);
	// @lore BC3 architecture.md §5 B7: the notifications inbox listener
	// (`installNotifications`) is deleted — its only trigger was the policy
	// engine's "attention" event, deleted with `items` (R2). Nothing left to
	// register.
	// AF16 T17: in-process 6h TTL retention reaper. Runs unconditionally.
	// @lore AU20 C1: retention package dissolved — sweep logic and scheduler
	// live here at the composition root; per-table deletes delegate to their
	// owning services.
	// No behavior change: same predicates, same TTLs, same cadence.
	const runRetentionSweep = async (): Promise<void> => {
		const nowMs = Date.now();
		const termCutoff = new Date(nowMs - TERMINAL_LOG_TTL_MS).toISOString();
		// A person's inbox (owned by `user`): a read row older than the cutoff
		// is deleted.
		await reapInbox(db, termCutoff);
		// task_dispatch_attempts (owned by `work`), reaped here rather
		// than in session-requests's reapExpired.
		await reapTerminalTaskDispatchAttempts(db, termCutoff, TASK_DISPATCH_ATTEMPT_REAP_BATCH_SIZE);
	};
	const retentionHandle = setInterval(() => {
		void runRetentionSweep().catch((err) => {
			serviceBootstrapLog.error("retention sweep failed", { err });
		});
	}, RETENTION_REAPER_INTERVAL_MS);
	disposers.push(
		identifyBootstrapOwner(
			() => clearInterval(retentionHandle),
			"retention reaper",
			"interval cleared",
			["retention interval"],
		),
	);

	return disposers;
}

/**
 * Registers AGENT-owned services (the cost-cap
 * dedup release + cost sentinel this used to also register are deleted, no
 * replacement). Split from the former `bootstrapAppRuntime` shell alongside
 * `registerCoreDomainServices` (see that function's doc-comment for the
 * behavior-preservation invariant).
 *
 * @lore BC5 T7b: no scheduler lives here — a subscription's fire and clock
 * (`registerSubscriptionFire`/`startSubscriptionClock`) are wired in
 * `app.ts` alongside the dependency watcher, not here (they need the
 * composed action bags this composition root is deliberately built
 * without). The assistant runs through the SAME durable poller
 * (`startRuntime`, wired by the Application's composition root) as every
 * other kind — no second lifecycle to boot here.
 */
export function registerAgentLayerServices(ctx: {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/** Required, same shape as `registerCoreDomainServices`'s ctx. */
	readonly agentOrchestration: AgentOrchestrationPort;
	readonly dispatcherDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
	readonly reaperStaleAfterMs?: number;
	/** Scope (iii): when true, generic (taskId) subscriptions auto-fire. */
	readonly canProvision?: boolean;
	/** In-process periodic reaper cadence (ms). 0 = every poll (tests). */
	readonly reaperCadenceMs?: number;
}): Array<() => void> {
	const disposers: Array<() => void> = [];
	const reaperStaleAfterMs = ctx.reaperStaleAfterMs ?? DEFAULT_REAPER_STALE_AFTER_MS;

	// @lore AU21 Increment 14a: the cost sentinel (15-minute scheduled job) is
	// deleted along with the rest of the cost feature — no replacement.

	// TTL workspace reaper — the durable poller (`startRuntime`, wired
	// by the Application's composition root) is the sole trigger for every kind.
	void reaperStaleAfterMs;

	return disposers;
}
