/**
 * AU26 B1b — `core-api`'s Layer-level service registration.
 *
 * @lore AU26 B1b: this file used to be `server-factory.ts` and used to also hold
 * `createServer`, the whole Application composition root. That moved to
 * `packages/remote-server/src/create-server.ts` (§D-C) — a `core-api` file must
 * not mount `agent-orchestration`'s app. What is left is the two registration
 * functions an Application calls through `AppOptions.serviceBootstrap`, plus the
 * retention reapers they schedule.
 */

import {
	findThread,
	insertMessage,
	insertThread,
	listMessages,
	registerAssistantThreadPinReaction,
	registerSessionNotReturnedNotice,
	updateMessage,
	updateThread,
} from "@hyperidle/conversation";
import { deleteCredential, readCredentials, writeCredential } from "@hyperidle/credentials";
import type { WriteExecutor } from "@hyperidle/db";
import { type HyperIdleDb, propagationLog } from "@hyperidle/db";
import { resolveInjectedFilesystemsForAgent } from "@hyperidle/filesystems";
import { assembleSessionKnowledge, reapAccessLog } from "@hyperidle/knowledge";
import {
	enqueue,
	installNotifications,
	isSilenced,
	type NotificationsDeps,
	reap,
} from "@hyperidle/notifications";
import { getTeam, getTeamMembers, resolveReviewRecipients } from "@hyperidle/org";
import type { PolicyDeps } from "@hyperidle/policy";
import { registerPolicy } from "@hyperidle/policy";
import { registerReviewSubscriptions } from "@hyperidle/review";
import { enqueueWorkIntent, startLifecycleProjectionDrain } from "@hyperidle/session-requests";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import { createLogger, type EventBus, type ResolvedModel } from "@hyperidle/shared";
import { decryptCredentialValue, encryptCredentialValue } from "@hyperidle/shared/crypto";
import {
	findUser,
	listUsers,
	reapExpiredCredentials,
	requireRunnableAgent,
} from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { getTaskRiskTierByTaskId } from "@hyperidle/work";
import { and, inArray, lt } from "drizzle-orm";
import { attachRelevanceListener } from "../knowledge/src/relevance-listener.js";
import { registerAgentRunAdmissionReactions } from "./services/agent-run-admission-reactions.js";
import { registerAssistantTurnCoherenceTrigger } from "./services/assistant-turn-coherence-trigger.js";
import { resolveOrCreateCallingThread } from "./services/calling-thread-bindings.js";
// @lore AU21 Increment 14a: cost sentinel + `costOps`/`cost-bindings.ts` are
// HARD-DELETED along with the rest of the cost feature — no replacement.
import { queueDeps } from "./services/durable-agent-queue.js";
import { registerRoutineRunSessionEndReactions } from "./services/routine-run-session-end-reactions.js";
import {
	registerBuiltinRoutineReactions,
	startRoutineScheduler,
} from "./services/routine-scheduler-bindings.js";
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
	readonly resolveModel?: (modelTier: string) => Promise<ResolvedModel | undefined>;
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

/** Production default poll cadence for the routine scheduler. */
const DEFAULT_ROUTINE_POLL_INTERVAL_MS = 30_000;
/** Default staleness bound for the routine-session reaper (1h). */
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
const CONSUMED_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day audit window
/**
 * @lore AU21 §9 Increment 10 (Decision H1): matches
 * `session-requests`'s own former `defaultRetentionBatchSize` for the same
 * terminal-row GC job, now relocated here.
 */
const TASK_DISPATCH_ATTEMPT_REAP_BATCH_SIZE = 500;

/**
 * Reaps terminal propagation_log rows older than `termCutoff`.
 *
 * Extracted from the composition-root `runRetentionSweep` closure so the
 * predicate is directly testable: the `propagation_log` table is
 * UNOWNED_SHARED_TABLES, so a direct `@hyperidle/db` delete is sanctioned
 * both here and in the integration test.
 *
 * @lore AU20 C1: exported for test coverage — previously the predicate was
 * exercised via `reapRetentionOnce`; dissolving the retention package silently
 * dropped that coverage. Exporting the function restores it without changing
 * the predicate or the calling contract.
 */
export async function reapPropagationLog(db: HyperIdleDb, termCutoff: string): Promise<void> {
	await db
		.delete(propagationLog)
		.where(
			and(
				lt(propagationLog.createdAt, termCutoff),
				inArray(propagationLog.status, ["applied", "skipped"]),
			),
		);
}

/**
 * @lore AU21 §9 Increment 10 (Decision H1): reaps terminal
 * `task_dispatch_attempts` rows older than `termCutoff`, relocated OUT of
 * `session-requests`'s `reapExpired` single atomic transaction (a harmless
 * atomicity split — pure terminal-row GC, no cross-table invariant depends on
 * it sharing that transaction) and INTO this composition root's generic
 * retention reaper, alongside `reapPropagationLog`/`reapAccessLog`/
 * `reapExpiredCredentials` above. Calls `taskDispatchAttemptStore.reapTerminal`
 * directly — `work` owns this table, so a direct same-layer call (not a
 * cross-layer write) is sanctioned, same precedent as `reapPropagationLog`'s
 * own doc comment. Exported for the same reason: directly testable without
 * waiting on the real 6h `setInterval`.
 */
export async function reapTerminalTaskDispatchAttempts(
	db: HyperIdleDb,
	termCutoff: string,
	batchSize: number,
): Promise<number> {
	return work.taskDispatchAttemptStore.reapTerminal(db, termCutoff, batchSize);
}

/**
 * @lore AU19 Increment 1g/1h: `notifications`' DI ports (Mechanism C), wired
 * here at the `packages/server` composition point — all five targets
 * (`settings`, `users`, `org`, `work`, `connections`) are now real,
 * already-migrated packages. `connections` closed in Increment 1h:
 * `notificationsCredentialCipher`/`notificationsCredentialStore` wire
 * directly to `@hyperidle/connections`' real exports (no more interim
 * raw-table indirection).
 */
const notificationsServerConfigPort = { read: readServerConfig, update: updateServerConfig };

/**
 * @lore AU20 Ag6b: collapsed from 5 separate port objects into one
 * `NotificationsDeps` bag. `installNotifications` internally extracts
 * the sub-deps it needs; the composition root sees a single wiring point.
 */
const notificationsDeps: NotificationsDeps = {
	serverConfig: notificationsServerConfigPort,
	credentialCipher: { encryptCredentialValue, decryptCredentialValue },
	credentialStore: {
		findByName: async (db, name) => (await readCredentials(db, { name }))[0],
		upsert: async (db, values) =>
			writeCredential(db, values.name, {
				encryptedValue: values.encryptedValue,
				validationState: values.validationState,
				lastValidatedAt: values.lastValidatedAt,
				updatedAt: values.updatedAt,
			}),
		deleteByName: (db, name) => deleteCredential(db, name),
	},
	users: { getUserById: (db, id) => findUser(db, { id }) },
	teams: { getTeamMembersById: (db, id) => getTeamMembers(db, { id }) },
	work: {
		listQueuedItemsSince: (exec: WriteExecutor, cutoff: string) =>
			work.list(exec, "item", { queued: true, createdSince: cutoff }),
		getItemById: (exec: WriteExecutor, id: string) => work.get(exec, "item", id),
	},
};

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
const policyDeps: PolicyDeps = {
	work: {
		getItemById: (exec: WriteExecutor, id: string) => work.get(exec, "item", id),
		updateItemById: (exec: WriteExecutor, id: string, patch) =>
			work.update(exec, "item", id, patch),
		listItemIdsBySourceAgent: async (exec: WriteExecutor, agentId: string) => {
			const rows = await work.list(exec, "item", { sourceAgentId: agentId });
			return rows.map((r) => r.id);
		},
		getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
		getBetById: (exec: WriteExecutor, id: string) => work.get(exec, "bet", id),
		transitionBetStatus: (exec, { betId, fromStatus, patch }) =>
			work.transition(exec, "bet", {
				id: betId,
				guard: { field: "status", equals: fromStatus },
				patch,
			}),
		transitionTaskState: (exec, { taskId, fromState, patch }) =>
			work.transition(exec, "task", {
				id: taskId,
				guard: { field: "state", equals: fromState },
				patch,
			}),
		listTasks: (exec: WriteExecutor, opts?: { betId?: string }) =>
			work.list(exec, "task", { betId: opts?.betId }),
	},
	conversation: {
		insertMessage,
		listMessagesByThread: (db, threadId, opts) =>
			listMessages(db, {
				threadId,
				types: opts?.type ? [opts.type] : undefined,
				order: opts?.order,
				dir: opts?.dir,
				limit: opts?.limit,
			}),
		updateMessage,
		updateThread,
		insertThread,
		listInitiatedVerdictMessages: (db, initiatorId, windowStart) =>
			listMessages(db, {
				threadInitiatorId: initiatorId,
				types: ["verdict"],
				since: windowStart,
				noLegacyItem: true,
			}),
		listVerdictMessagesByItemIds: (db, itemIds, windowStart) =>
			listMessages(db, { legacyItemIds: itemIds, types: ["verdict"], since: windowStart }),
	},
	users: { getFirstUserByKind: (db, kind) => findUser(db, { kind }) },
	silence: {
		isSilenced: (db, item, now) => isSilenced(db, item, now, notificationsDeps),
	},
	notifications: {
		insert: async (db, row) => {
			await enqueue(db, row);
		},
	},
};

/**
 * AU11: registers CORE-owned application services against the event bus —
 * knowledge (relevance listener, FTS), notifications, policy engine,
 * review routing, lifecycle propagation, retention, and the
 * routine scheduler (cron/due-eval + `enqueueWorkIntent`).
 *
 * Split from the former `app-runtime` shell's `bootstrapAppRuntime` —
 * together with `registerAgentLayerServices` this replicates the exact
 * same disposer set; only the grouping changed, not registration order
 * within each group (behavior-preserving, AU11 import-path-only invariant).
 *
 * @lore AU15: routine-scheduler.ts stays Core (cron/due-eval is a core
 * domain concern); the residual Core→Agent edge AU11 recorded here (its
 * former fire-time agent-selection call is CLOSED — owner-WIP evaluation and
 * delegate resolution moved to drain-time in
 * `agent-work-intent-worker.ts`'s `resolveAuthoritativeInput` (`routine_run`
 * branch). routine-scheduler.ts no longer imports agent-selection.ts at all.
 */
export function registerCoreDomainServices(ctx: {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/**
	 * Inject alert preferences reader for the notification dispatcher.
	 * Uses an inline structural type so `AlertPreferences` (delivery-chain
	 * internal) stays out of the public server-factory surface.
	 * @lore AU20 Ag6b: AlertPreferences removed from barrel; inline type here.
	 */
	readonly readAlertPreferences?: () => Promise<{
		blockerAlerts: boolean;
		reviewAlerts: boolean;
		quietHoursEnabled: boolean;
		quietHoursStart: string;
		quietHoursEnd: string;
	}>;
	/** AF6 §1: routine scheduler poll cadence (ms). Optional; defaults to 30s. */
	readonly routinePollIntervalMs?: number;
	/** AF6 scope (iii): when true, generic (taskId) routines auto-fire. */
	readonly canProvision?: boolean;
	/** AF6 §4: routine-session reaper staleness bound (ms). Default 1h. */
	readonly reaperStaleAfterMs?: number;
	/** AF6 §4: in-process periodic reaper cadence (ms). 0 = every poll (tests). */
	readonly reaperCadenceMs?: number;
	/**
	 * AD2: provisioning deps threaded into the routine scheduler's fire-time
	 * session creation. Omitted from the type here to avoid a core-module
	 * dependency on server harness types — passed through as-is.
	 */
	readonly dispatcherDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
}): Array<() => void> {
	const { db, eventBus } = ctx;
	const disposers: Array<() => void> = [];
	disposers.push(
		identifyBootstrapOwner(
			startLifecycleProjectionDrain(queueDeps(db)),
			"lifecycle-projection drain",
			"stops drain",
			["drain interval"],
		),
	);

	disposers.push(
		identifyBootstrapOwner(
			registerAgentRunAdmissionReactions(db, eventBus),
			"agent-run-admission reactions",
			"unsubscribe",
			["agent_run_admission_failed subscription"],
		),
	);

	disposers.push(
		identifyBootstrapOwner(
			registerRoutineRunSessionEndReactions(db, eventBus),
			"routine-run session-end reactions",
			"unsubscribe",
			["session_ended subscription", "agent_run_lifecycle_changed subscription"],
		),
	);

	// AU21 §9 Increment 10 (Decision H1)/Increment 12 (Decision H3) Wave D:
	// task's post-session writebacks — finalizes `taskDispatchAttempts` off
	// `agent_run_lifecycle_changed` and merges accumulated per-tier tokens
	// onto the owning bet off `session_ended`, replacing
	// `run-orchestration/provisioner.ts`'s deleted direct
	// `ports.work.updateBetById` write.
	disposers.push(
		identifyBootstrapOwner(
			registerWorkSessionEndReactions(db, eventBus),
			"work session-end reactions",
			"unsubscribe",
			["agent_run_lifecycle_changed subscription", "session_ended subscription"],
		),
	);

	// AU21 §9 Increment 12 (Decision H3) Wave D: a task's `in_progress`
	// transition at session launch — replaces `run-orchestration/
	// provisioner.ts`'s deleted direct `ports.work.transitionTask` write.
	disposers.push(
		identifyBootstrapOwner(
			registerWorkSessionStartedReactions(db, eventBus),
			"work session-started reactions",
			"unsubscribe",
			["session_started subscription"],
		),
	);

	// AU21 §9 Increment 11 (Decision H2/F4): "pin the assistant thread after
	// its first AI reply" — a `@hyperidle/conversation`-owned reaction to its
	// OWN `thread_message_appended` event.
	disposers.push(
		identifyBootstrapOwner(
			registerAssistantThreadPinReaction(db, eventBus, {
				findUserById: (execDb: HyperIdleDb, id: string) => findUser(execDb, { id }),
			}),
			"assistant thread pin reaction",
			"unsubscribe",
			["thread_message_appended subscription"],
		),
	);

	// AU21 §9 Increment 11 (Decision H2 "Coherence — reconciled via Decision
	// B‴"): the new supersede-trigger wiring — a thread reply landing while a
	// same-thread `assistant_turn` intent is still pending re-bakes it with
	// the now-current transcript, reusing the Increment 3 supersede machinery.
	disposers.push(
		identifyBootstrapOwner(
			registerAssistantTurnCoherenceTrigger(db, eventBus),
			"assistant-turn B‴ coherence trigger",
			"unsubscribe",
			["thread_message_appended subscription"],
		),
	);

	// AU27 Increment 5 (Decision 5): the never-silent net — a
	// `@hyperidle/conversation`-owned reaction to the existing
	// `session_not_returned` event (today only observed by the observability
	// dispatcher), posting one plain notice into the session's calling
	// thread when the force budget is spent without a return.
	disposers.push(
		identifyBootstrapOwner(
			registerSessionNotReturnedNotice(db, eventBus),
			"session-not-returned notice",
			"unsubscribe",
			["session_not_returned subscription"],
		),
	);

	// @lore AU21 Increment 14a: the session-cost recorder (agent-orchestration's
	// OWN `session_ended` reaction, Increment 6's per-session cost door) is
	// deleted along with the rest of the cost feature — no replacement.

	disposers.push(
		identifyBootstrapOwner(
			attachRelevanceListener(db, eventBus),
			"relevance listener",
			"unsubscribes",
			["knowledge-access subscription"],
		),
	);

	disposers.push(
		identifyBootstrapOwner(
			registerReviewSubscriptions(db, eventBus, {
				work: {
					getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
					updateTaskById: (exec: WriteExecutor, id: string, patch) =>
						work.update(exec, "task", id, patch),
					createItem: (exec: WriteExecutor, values) => work.create(exec, "item", values),
					getRiskTierByTaskId: getTaskRiskTierByTaskId,
				},
				conversation: {
					insertThread,
					getThreadById: (db, id) => findThread(db, { id }),
					updateThread,
				},
				users: {
					getUserById: (db, id) => findUser(db, { id }),
					listUsersByKind: (db, kind) => listUsers(db, { kind }),
				},
				org: { resolveReviewRecipients },
				intentRecorder: { record: enqueueWorkIntent },
				requireRunnableAgent,
				// AU21 §9 Increment 12 (Decision H3): the liveness-net reengagement
				// re-provision (`applyLivenessRetry`) also bakes a contextBundle now.
				// `getTaskById` is already forwarded from `ports.work.getTaskById`
				// inside `session-review-creator.ts`'s liveness handler — only
				// `getBetById`/`getTeamById`/`assembleSessionKnowledge` are new.
				getBetById: (exec: WriteExecutor, id: string) => work.get(exec, "bet", id),
				getTeamById: (db: HyperIdleDb, id: string) => getTeam(db, { id }),
				assembleSessionKnowledge,
				readServerConfig,
				// AU21 §9 Increment 12 follow-up (F2 gap closure): also bake
				// injectedFilesystems.
				resolveInjectedFilesystemsForAgent,
				// AU27 Increment 1 (Decision 0): also bake callingThreadId for the
				// liveness-net re-provision.
				resolveOrCreateCallingThread,
			}),
			"review subscriptions",
			"unsubscribe",
			["review creation subscription", "review liveness subscription"],
		),
	);
	disposers.push(
		identifyBootstrapOwner(
			registerPolicy(db, eventBus, policyDeps),
			"policy registration",
			"unsubscribe",
			["policy engine", "lifecycle propagation", "retry interval"],
		),
	);
	// @lore AU20 Ag6b: three separate worker registrations (dispatcher + listener
	// + drain) collapsed into one `installNotifications` call. The delivery chain
	// is fully internal to @hyperidle/notifications; server-factory sees one boot
	// entry and one disposer.
	disposers.push(
		identifyBootstrapOwner(
			installNotifications(db, eventBus, notificationsDeps, {
				readAlertPreferences: ctx.readAlertPreferences,
			}),
			"notifications installation",
			"dispatcher/listener/drain all stop",
			["dispatcher", "listener", "drain"],
		),
	);

	// AF16 T17: in-process 6h TTL retention reaper. Runs unconditionally.
	// @lore AU20 C1: retention package dissolved — sweep logic and scheduler
	// live here at the composition root; per-table deletes delegate to their
	// owning services (users/notifications/knowledge). propagation_log is
	// UNOWNED_SHARED_TABLES so its delete stays a direct @hyperidle/db call.
	// No behavior change: same predicates, same TTLs, same cadence.
	const runRetentionSweep = async (): Promise<void> => {
		const nowMs = Date.now();
		const expiredCutoff = new Date(nowMs).toISOString();
		const termCutoff = new Date(nowMs - TERMINAL_LOG_TTL_MS).toISOString();
		const consumedCutoff = new Date(nowMs - CONSUMED_INVITE_TTL_MS).toISOString();
		// login_sessions + invite_codes (owned by `users`)
		await reapExpiredCredentials(db, {
			sessionCutoff: expiredCutoff,
			inviteExpiredCutoff: expiredCutoff,
			inviteConsumedCutoff: consumedCutoff,
		});
		// notification_queue (owned by `notifications`)
		await reap(db, termCutoff, ["sent", "failed", "dropped"]);
		// knowledge_access_log (owned by `knowledge`)
		await reapAccessLog(db, termCutoff);
		// propagation_log — UNOWNED_SHARED_TABLES; delegate to the exported
		// reapPropagationLog so the predicate is covered by integration tests.
		await reapPropagationLog(db, termCutoff);
		// task_dispatch_attempts (owned by `work`) — AU21 §9 Increment 10
		// (Decision H1): relocated out of session-requests's reapExpired.
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
 * AU11: registers AGENT-owned services — builtin routine handlers, the task
 * dispatcher, and the sandbox/routine-session reapers (AU21 Increment 14a:
 * the cost-cap dedup release + cost sentinel this used to also register are
 * deleted, no replacement). Split from the former `bootstrapAppRuntime`
 * shell alongside `registerCoreDomainServices` (see that function's
 * doc-comment for the behavior-preservation invariant).
 *
 * The assistant runs through the SAME durable poller (`startRuntime`, wired
 * by the Application's composition root) as every other kind — no second
 * lifecycle to boot here.
 */
export function registerAgentLayerServices(ctx: {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly dispatcherDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
	readonly reaperStaleAfterMs?: number;
	/** AF6 §1: routine scheduler poll cadence (ms). Optional; defaults to 30s. */
	readonly routinePollIntervalMs?: number;
	/** AF6 scope (iii): when true, generic (taskId) routines auto-fire. */
	readonly canProvision?: boolean;
	/** AF6 §4: in-process periodic reaper cadence (ms). 0 = every poll (tests). */
	readonly reaperCadenceMs?: number;
}): Array<() => void> {
	const { db, eventBus } = ctx;
	const disposers: Array<() => void> = [];
	const reaperStaleAfterMs = ctx.reaperStaleAfterMs ?? DEFAULT_REAPER_STALE_AFTER_MS;

	// AU21 §9 Increment 4: the routine scheduler (builtin-routine event
	// reaction + the cron/due-eval tick loop) is its own core-api-side
	// lifecycle (`routine-scheduler-bindings.ts`).
	const pollIntervalMs = ctx.routinePollIntervalMs ?? DEFAULT_ROUTINE_POLL_INTERVAL_MS;

	disposers.push(
		identifyBootstrapOwner(
			registerBuiltinRoutineReactions(db, eventBus),
			"builtin routine reactions",
			"bet_state_changed subscription stop",
			["builtin routine reactions"],
		),
	);

	const schedulerPromise = startRoutineScheduler(db, eventBus, {
		pollIntervalMs,
		canProvision: ctx.canProvision ?? Boolean(ctx.dispatcherDeps),
		reaperCadenceMs: ctx.reaperCadenceMs,
	});
	schedulerPromise.catch((err) => {
		serviceBootstrapLog.error("routine scheduler start failed", { err });
	});
	disposers.push(
		identifyBootstrapOwner(
			() => {
				void schedulerPromise.then((s) => s.stop()).catch(() => {});
			},
			"routine scheduler",
			"cron/due-eval tick stop",
			["routine scheduler"],
		),
	);

	// @lore AU21 Increment 14a: the cost sentinel (15-minute scheduled job) is
	// deleted along with the rest of the cost feature — no replacement.

	// AF7 §6: TTL workspace reaper — the durable poller (`startRuntime`, wired
	// by the Application's composition root) is the sole trigger for every kind.
	void reaperStaleAfterMs;

	return disposers;
}
