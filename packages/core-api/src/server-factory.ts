import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ServerType, serve, upgradeWebSocket } from "@hono/node-server";
import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";
import { readAgentRunConfigs } from "@hyperidle/agent-run-config";
import {
	type CredentialResolver,
	DbCredentialResolver,
	deleteCredential,
	listConnections,
	readCredentials,
	writeCredential,
} from "@hyperidle/connections";
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
import type { WriteExecutor } from "@hyperidle/db";
import {
	createPgliteDb,
	createPostgresDb,
	type DbHandle,
	type HyperIdleDb,
	propagationLog,
	resolveProfile,
} from "@hyperidle/db";
import {
	RegistryFilesystemMounter,
	resolveInjectedFilesystemsForAgent,
} from "@hyperidle/filesystems";
import {
	type AdapterPool,
	createReturnEnforcement,
	type SandboxAdapter,
} from "@hyperidle/harness-registry";
import { createMcpToolBridge } from "@hyperidle/harness-registry/mcp";
import {
	assembleSessionKnowledge,
	create as createKnowledgeItem,
	reapAccessLog,
	recordConflict as recordWritebackConflict,
	update as updateKnowledgeItem,
	VersionConflictError,
} from "@hyperidle/knowledge";
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
import { createDbSubscribeAuthorizer, WsConnectionHub } from "@hyperidle/realtime";
import { registerReviewSubscriptions } from "@hyperidle/review";
import { listRoutines } from "@hyperidle/routine";
import type { RuntimeDeps } from "@hyperidle/run-orchestration";
import {
	backfillConfigurationDefaults,
	migrateCredentialsToStore,
	readServerConfig,
	updateServerConfig,
} from "@hyperidle/settings";
import {
	createLogger,
	EventBus,
	type ModelTier,
	type ResolvedModel,
	resolveModel,
} from "@hyperidle/shared";
import { decryptCredentialValue, encryptCredentialValue } from "@hyperidle/shared/crypto";
import { createGitRunner } from "@hyperidle/shared/git";
import {
	findUser,
	listUsers,
	reapExpiredCredentials,
	requireRunnableAgent,
} from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { getTaskRiskTierByTaskId } from "@hyperidle/work";
import { and, inArray, lt } from "drizzle-orm";
import { WebSocketServer } from "ws";
import { attachRelevanceListener } from "../knowledge/src/relevance-listener.js";
import { disposeApp } from "./app.js";
import { bootCoreApi } from "./boot.js";
import { registerWsRoute } from "./routes/ws.js";
import { registerAgentRunAdmissionReactions } from "./services/agent-run-admission-reactions.js";
import { registerAssistantTurnCoherenceTrigger } from "./services/assistant-turn-coherence-trigger.js";
import { resolveOrCreateCallingThread } from "./services/calling-thread-bindings.js";
import {
	createInProcessCoreApiTransport,
	registerCoreApiTransport,
} from "./services/core-api-port-composition.js";
// @lore AU21 Increment 14a: cost sentinel + `costOps`/`cost-bindings.ts` are
// HARD-DELETED along with the rest of the cost feature — no replacement.
import { registerRoutineRunSessionEndReactions } from "./services/routine-run-session-end-reactions.js";
import {
	registerBuiltinRoutineReactions,
	startRoutineScheduler,
} from "./services/routine-scheduler-bindings.js";
import { registerWorkSessionEndReactions } from "./services/work-session-end-reactions.js";
import { registerWorkSessionStartedReactions } from "./services/work-session-started-reactions.js";
import { registerWorkStatePushGateway } from "./services/work-state-push-gateway.js";

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

import { enqueueWorkIntent, startLifecycleProjectionDrain } from "@hyperidle/session-requests";
import { queueDeps } from "./services/durable-agent-queue.js";
import {
	runtimeDeps as buildRunRuntimeDeps,
	type ProvisionSessionDeps,
	startRuntime,
} from "./services/run-orchestration-composition.js";

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
const DEFAULT_REAPER_STALE_AFTER_MS = 60 * 60 * 1000;
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
 * above) as every other kind — no second lifecycle to boot here.
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

	// AF7 §6: TTL workspace reaper — the durable poller (`startRuntime`,
	// wired above) is the sole trigger for every kind.
	void reaperStaleAfterMs;

	return disposers;
}

/**
 * AF7 §1: build the drain's `resolveModel(tier, modelOverride?)`. The HTTP path
 * resolves models in sessions-routes via resolveModelTier; the poller drain (no
 * request context) needs the same resolution. Reuses the server config + the
 * production credential resolver. When resolution fails (missing credential),
 * the drain treats it as unrecoverable-per-request — correct.
 *
 * @lore AU27 Increment 6 (Decision 4, C11): `modelOverride` is the target
 * agent's baked `modelId`/`modelProvider` (uniform for all six kinds, not
 * assistant-only — see `agent-work-intent-recorder.ts`'s `BakedAgentRunnableConfig`).
 * `resolveModel({kind:"agent"})` sets `agentPath: true`, and `resolveProvider`'s
 * `openai-compatible` case THROWS `UnsupportedAgentProviderError` when
 * `agentPath` is set — `openai-compatible` is a real, user-selectable per-agent
 * provider (Settings → Agents), so an unguarded agent-path request would throw
 * outside `runClaimedRequest` (feeding the unbounded re-claim loop plan.md
 * accepts as out-of-scope) for any agent configured that way. The guard: request
 * `{kind:"agent"}` only when the override's provider is NOT `openai-compatible`;
 * otherwise fall back to `{kind:"tier"}` — such an agent then runs on its tier,
 * strictly better than throwing the turn out entirely. A `modelId`-less override
 * (or no override at all) already falls through to the tier inside
 * `resolveModel` itself, so this guard only ever narrows the agent path, never
 * widens it.
 */
function makeResolveModel(
	db: HyperIdleDb,
	credentialResolver: CredentialResolver,
): (
	tier: string,
	modelOverride?: { readonly modelId: string | null; readonly modelProvider: string | null },
) => Promise<ResolvedModel | undefined> {
	return async (
		tier: string,
		modelOverride?: { readonly modelId: string | null; readonly modelProvider: string | null },
	): Promise<ResolvedModel | undefined> => {
		const cfg = await readServerConfig(db);
		if (modelOverride && modelOverride.modelProvider !== "openai-compatible") {
			return resolveModel(
				{
					kind: "agent",
					modelId: modelOverride.modelId,
					modelProvider: modelOverride.modelProvider,
					tierFallback: tier,
				},
				cfg.modelGateway,
				credentialResolver,
			);
		}
		return resolveModel(
			{ kind: "tier", tier: tier as ModelTier },
			cfg.modelGateway,
			credentialResolver,
		);
	};
}

/**
 * AF7 §1 / §14.3: test-only dependency overrides for `createServer`.
 *
 * @lore AU19 Increment 5 (item 2): `adapterPool`/`workspaceAdapter` were
 * OPTIONAL through Increment 4 — `packages/server` (the pre-AU19 composition
 * root) defaulted them internally via `createLocalAdapterPool()` +
 * `isServerProfile ? DisabledSandboxAdapter : LocalSandboxAdapter`, a runtime
 * `HYPERIDLE_PROFILE` env-var branch inside the ONE shared binary. That
 * defaulting made the concrete `HarnessPort` adapter a runtime toggle, not a
 * structural (tsc-enforceable) one — exactly what §12 Increment 5 item 2
 * (founder ruling `97b8728b`) requires fixing. Both fields are now REQUIRED:
 * `@hyperidle/core-api` (this Layer's composition barrel) no longer imports
 * `LocalSandboxAdapter`/`DisabledSandboxAdapter`/`createLocalAdapterPool` at
 * all — each Application (`desktop`, `remote-server`) constructs its own
 * concrete adapter/pool in its own bootstrap file and injects it here. Every
 * real call site already passed these explicitly (verified repo-wide before
 * this change — only the two zero-deps production entrypoints,
 * `packages/server/src/index.ts` and `packages/desktop/src/boot-server.ts`,
 * relied on the internal default; both are now Application bootstrap code
 * that supplies the concrete value itself, see `packages/remote-server/src/index.ts`
 * and `packages/desktop/src/boot-server.ts`).
 */
export interface CreateServerDeps {
	readonly db?: HyperIdleDb;
	readonly adapterPool: AdapterPool;
	readonly workspaceAdapter: SandboxAdapter;
	readonly sandboxBasePath?: string;
}

/**
 * Handle returned from `createServer` so callers can shut the server down
 * cleanly in tests + graceful shutdown.
 *
 * `httpServer` is typed as `ServerType` from @hono/node-server (which is
 * `http.Server | Http2Server | Http2SecureServer`). In practice, since we
 * do not pass HTTP/2 options to `serve()`, the runtime value is always
 * `http.Server`. We store `ServerType` to avoid an unsafe `as http.Server`
 * cast — `.close()` exists on all union members.
 *
 * `credentialResolver` is exposed so integration tests can assert the
 * production wiring is `instanceof DbCredentialResolver` (AH1 invariant).
 *
 * @lore N1: B1 (reviewer): do NOT use `as http.Server` cast. Use ServerType
 * directly — `.close()` exists on all union members.
 * @lore AH1 §3: credentialResolver is in ServerHandle so the single-resolver
 * invariant test can assert `instanceof DbCredentialResolver` without relying
 * on indirect observable effects. This is the correct scope: the test must
 * fail if someone reverts the wiring to EnvCredentialResolver.
 */
export interface ServerHandle {
	readonly httpServer: ServerType;
	readonly dispose: () => Promise<void>;
	readonly credentialResolver: CredentialResolver;
}

const MIME_TYPES: Record<string, string> = {
	".html": "text/html",
	".js": "application/javascript",
	".css": "text/css",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
	".woff": "font/woff",
};

/**
 * Create a fetch handler that serves static files from a directory,
 * falling back to the Hono app for /api routes and to index.html for
 * SPA client-side routing.
 */
function createStaticHandler(
	dir: string,
	appFetch: (req: Request, env?: unknown) => Response | Promise<Response>,
): (req: Request, env?: unknown) => Response | Promise<Response> {
	const indexPath = path.join(dir, "index.html");

	return (req: Request, env?: unknown): Response | Promise<Response> => {
		const url = new URL(req.url);

		// /api routes (including WebSocket upgrades at /api/ws) go to the Hono app.
		// env must be forwarded — @hono/node-server passes WebSocket bindings via env.
		if (url.pathname.startsWith("/api")) {
			return appFetch(req, env);
		}

		// Try to serve exact file
		const filePath = path.join(dir, url.pathname);
		if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
			const ext = path.extname(filePath);
			return new Response(fs.readFileSync(filePath), {
				headers: { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" },
			});
		}

		// SPA fallback: serve index.html
		return new Response(fs.readFileSync(indexPath), {
			headers: { "Content-Type": "text/html" },
		});
	};
}

/**
 * Create a Node-compatible server with the full domain app + WebSocket support.
 *
 * Uses `@hono/node-server` (which runs under both Node and Bun via Node
 * compatibility shims). Replaces the previous Bun-native serve API.
 *
 * Reads the DB path from `DATABASE_URL` (falling back to `./hyperidle.db`),
 * builds a fresh `EventBus`, and wires them into `createApp`. The WebSocket
 * route is registered via the `registerWebSocket` hook on `AppOptions` so the
 * production boot path and integration tests share a single `createApp`.
 *
 * Pass port 0 for a random available port (useful in tests).
 *
 * @lore PGlite migration: production DB uses resolveProfile() to pick the
 * connection factory — `createPgliteDb` for laptop profile (embedded WASM
 * Postgres), `createPostgresDb` for vps/cloud (postgres-js). DATABASE_URL
 * env var overrides the profile default.
 *
 * @lore I1 S1-S5: the previous `createFullApp` factory mounted only
 * `/health`, `/api/health`, and `/api/ws` — every domain route returned 404
 * in production. Converging on `createApp` is the fix; any future divergence
 * would re-introduce the same bug.
 */
/**
 * Resolve a PGlite data directory path to an absolute path.
 * If the path is already absolute or is the special `:memory:` value, return
 * it unchanged. Otherwise resolve it relative to the repo root so that
 * `"./hyperidle-pg"` always points to `<repo-root>/hyperidle-pg` regardless
 * of the process CWD (which differs between `npm run dev` and direct Node
 * invocations).
 *
 * @lore CWD-mismatch: `npm run dev` starts the server from
 * `packages/server/` (workspace CWD), so a raw `"./hyperidle-pg"` resolves
 * to `packages/server/hyperidle-pg` — not the repo-root DB created by
 * `npm run setup`. We compute the repo root as 3 directories above this
 * file (`packages/server/src/server-factory.ts`).
 */
function resolvePglitePath(rawPath: string): string {
	if (rawPath === ":memory:" || path.isAbsolute(rawPath)) {
		return rawPath;
	}
	// import.meta.url → file:///…/packages/server/src/server-factory.ts
	// repoRoot        → file:///…/ (3 levels up)
	const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
	return path.resolve(repoRoot, rawPath);
}

export async function createServer(port: number, deps: CreateServerDeps): Promise<ServerHandle> {
	// AF7 §1: when a test injects `deps.db`, use the migrated fixture DB and do NOT
	// construct/own a throwaway DB. Production passes nothing → real DB + close.
	let dbHandle: DbHandle | null = null;
	let db: HyperIdleDb;
	if (deps.db) {
		db = deps.db;
	} else {
		const profile = resolveProfile({ env: process.env });
		const rawDbUrl = process.env.DATABASE_URL ?? profile.dbUrlDefault;
		const dbUrl = profile.dbDriver === "pglite" ? resolvePglitePath(rawDbUrl) : rawDbUrl;
		if (profile.dbDriver === "pglite") {
			dbHandle = await createPgliteDb(dbUrl);
		} else {
			dbHandle = createPostgresDb(dbUrl);
		}
		db = dbHandle.db;
	}
	const eventBus = new EventBus();
	// AU9: reconciliation is awaited; runtime readiness means no recoverable intent
	// was left stranded by a previous process death.

	// AH1 §3: DbCredentialResolver is the sole production resolver.
	// @lore AH1 §3: EnvCredentialResolver is retained ONLY for packages/eval (CI-secret
	// env key, no DB). Production always uses DbCredentialResolver. The single-resolver
	// invariant is tested in server-factory.resolver.test.ts via
	// `handle.credentialResolver instanceof DbCredentialResolver` — the resolver is
	// exposed on ServerHandle so the test can assert the production wiring directly.
	// @lore AU20 Am4: getServerSecret removed from barrel (cipher-owns-key pattern).
	// Boot warning now checks env directly instead of calling getServerSecret().
	const hasSecret = Boolean(process.env.HYPERIDLE_CREDENTIAL_KEY ?? process.env.HYPERIDLE_API_KEY);
	if (!hasSecret) {
		// @lore AH1 §6: Boot is non-fatal but we log a warning so misconfigured deployments
		// are visible. The write boundary (PUT /api/credentials) rejects loudly (500
		// MISSING_ROOT_SECRET). console.warn is intentional here — the observability adapter
		// is not yet constructed at this point in the boot sequence.
		// biome-ignore lint/suspicious/noConsole: intentional boot-time warning before observability adapter is constructed
		console.warn(
			"[HyperIdle] No HYPERIDLE_CREDENTIAL_KEY/HYPERIDLE_API_KEY set — credential writes will be refused (MISSING_ROOT_SECRET). Agents cannot resolve keys until a secret is configured.",
		);
	}
	const credentialResolver: CredentialResolver = new DbCredentialResolver(db);

	// AH1 §4: Run the one-time credential migration at boot.
	// Relocates legacy server_config blob apiKeys → server_credentials.
	// Seeds anthropic_api_key from env if the DB slot is absent.
	// No-op when already migrated. Non-fatal: migration skips if no root secret.
	// @lore AU19 Increment 1h: `settings`' `SettingsCredentialCipher`/
	// `SettingsCredentialStore` ports (Mechanism C) wired here — both to
	// `@hyperidle/connections`' real exports now that `connections` has
	// migrated (closes the Inc-1f interim wiring; see `@hyperidle/settings`'
	// `ports.ts` top-level `@lore`), zero behavior change.
	// @lore AU20 Am4: cipher is now no-arg (encryptCredentialValue/decryptCredentialValue
	// read the root secret internally). Store adapts to the new collapsed write API:
	// writeCredential with encryptedValue present = upsert path.
	await migrateCredentialsToStore(
		db,
		{ encryptCredentialValue, decryptCredentialValue },
		{
			findByName: async (execDb, name) => (await readCredentials(execDb, { name }))[0],
			insert: async (execDb, values) =>
				writeCredential(execDb, values.name, {
					encryptedValue: values.encryptedValue,
					validationState: values.validationState,
					lastValidatedAt: values.lastValidatedAt,
					updatedAt: values.updatedAt,
				}),
		},
	);
	// AU2: Project existing first-party behavior into the editable configuration
	// model on production boot. This keeps registered tools, builtin harness
	// metadata, and legacy rows queryable through the new resolver without moving
	// runtime ownership away from existing services.
	// @lore AU19 Increment 1f/1i + Increment 5 item 4 (connections sub-item):
	// `settings`' `RoutineReader`/`SettingsUserDirectory`/
	// `ServiceConnectionsReader` ports (Mechanism C) wired here — `users` to
	// the real `@hyperidle/users` exports (already migrated), `routine` to
	// `@hyperidle/routine`'s real `listRoutines` export (closed Increment 1i —
	// no more interim `routine-service.ts` indirection), `serviceConnections`
	// to `@hyperidle/connections`' real `listServiceConnectionsByAuthSource`
	// export (closes the Increment 1h `ServiceConnectionsReader` interim —
	// see `@hyperidle/settings`' `ports.ts`). All ordinary downward
	// core-api→core-api edges, zero behavior change.
	// @lore AU20 Am4: listServiceConnectionsByAuthSource removed from barrel; adapt
	// to listConnections(db, { authSource }) to satisfy ServiceConnectionsReader port.
	await backfillConfigurationDefaults(db, {
		users: { listUsersByKind: (db, kind) => listUsers(db, { kind }) },
		routines: { listRoutines },
		serviceConnections: {
			listByAuthSource: (execDb, authSource) => listConnections(execDb, { authSource }),
		},
		// AU26 G1 (§D-L): the six run-config fields the projection carries now
		// live in `agent_run_config`; the Layer wires their owner's batched read.
		agentRunConfig: { readAgentRunConfigs },
	});
	// @lore AU19 Increment 5 (item 2): `adapterPool`/`workspaceAdapter` are now
	// REQUIRED, Application-supplied deps (see `CreateServerDeps`'s top `@lore`)
	// — this Layer no longer constructs a concrete `SandboxAdapter`/`AdapterPool`
	// itself, and no longer branches on `HYPERIDLE_PROFILE` at runtime. Which
	// concrete adapter to inject is each Application's own choice (`desktop`:
	// `LocalSandboxAdapter` + `createLocalAdapterPool()`; `remote-server`: an
	// empty pool + `DisabledSandboxAdapter` — see each package's bootstrap file).
	const { adapterPool, workspaceAdapter } = deps;
	const sandboxBasePath =
		deps.sandboxBasePath ??
		process.env.HYPERIDLE_WORKSPACES_DIR ??
		path.join(os.tmpdir(), "hyperidle-workspaces");

	// AO2: Build the production filesystem mounter. capturesDir lives alongside the
	// sandboxBasePath so captures survive server restarts.
	const capturesDir = path.join(sandboxBasePath, ".ao2-captures");
	fs.mkdirSync(capturesDir, { recursive: true });
	const mounter = new RegistryFilesystemMounter({
		gitRunnerFactory: (repoPath: string) => createGitRunner(repoPath),
		capturesDir,
		db,
	});

	// AU19 Increment 3f: register the capture-writeback subscriber — the
	// §10.3 line 517 EventBus inversion for `filesystems ⚠ capture-writeback`.
	// `@hyperidle/filesystems`' `file-watcher.ts` emits
	// `sandbox_writeback_changes_detected`; this subscriber drives
	// `processWriteback` off it. The `knowledge` port's `update` wraps the
	// real `@hyperidle/knowledge` `update()` (which THROWS `VersionConflictError`)
	// into the port's discriminated `CaptureWritebackUpdateResult` — the one
	// place both `@hyperidle/knowledge` and the port type are legally
	// importable together (see `@hyperidle/capture-writeback`'s `ports.ts`
	// top `@lore`).
	const writebackDeps: NonNullable<RuntimeDeps["composition"]["writeback"]> = {
		db,
		knowledge: {
			create: createKnowledgeItem,
			async update(execDb, id, patch, expectedVersion) {
				try {
					const item = await updateKnowledgeItem(execDb, id, patch, expectedVersion);
					return { ok: true, item };
				} catch (err) {
					if (err instanceof VersionConflictError) {
						return { ok: false, currentVersion: err.currentVersion };
					}
					throw err;
				}
			},
			recordConflict: recordWritebackConflict,
		},
	};

	// X2: Create the MCP bridge registry that maps session tokens to transport instances.
	const enforcementRegistry = createReturnEnforcement();
	const mcpBridgeRegistry = createMcpToolBridge({ enforcement: enforcementRegistry });
	const mcpBaseUrl = `http://localhost:${port}`;
	// @lore AU19 Increment 3c: `runtime` is built as its own variable (not an
	// inline literal in the `bootAgentLayer` call) so it type-checks against
	// `bootAgentLayer`'s Mechanism-C-narrowed `RunOrchestrationProvisionDeps`
	// (only `db`/`eventBus`/`onHarnessStarted` declared) without an excess-
	// property error — the extra fields (`adapterPool`, `workspace`, …) still
	// flow through unchanged at runtime, only assigned via a variable rather
	// than a fresh literal (TS excess-property-check applies to literals, not
	// variable references). See `run-orchestration`'s `ports.ts` top `@lore`.
	const runtimeDeps = {
		db,
		eventBus,
		adapterPool,
		workspace: workspaceAdapter,
		mcpBridgeRegistry,
		mcpBaseUrl,
		serviceConnectionResolver: credentialResolver,
		mounter,
	} as ProvisionSessionDeps;
	const runRuntime = await startRuntime(
		buildRunRuntimeDeps(db, eventBus, {
			runtime: runtimeDeps,
			sandboxBasePath,
			resolveModel: makeResolveModel(db, credentialResolver),
			// The assistant flows through this same durable poller like every
			// other kind — no second execution entry.
			// runtimeDeps deep-merges this partial override with its production
			// context/provisioner ports; do not replace context with a fake object.
			composition: {
				writeback: writebackDeps,
				reapers: {
					sandboxes: { sandboxBasePath },
					routines: { staleAfterMs: DEFAULT_REAPER_STALE_AFTER_MS },
				},
			} as RuntimeDeps["composition"],
		}),
	);

	// Posting a message records the `assistant_turn` intent
	// (`routes/threads.ts`), and this same `startRuntime` poller (wired
	// above) drains it like every other kind's intent — one wiring path.
	let wsDispose: (() => void) | null = null;

	// AU21 §6 Decision L4 / §9 Increment 14d: the hub is built ONCE, here,
	// and shared between (a) the WS route + session-activity gateway wired
	// below in `registerWebSocket` and (b) every core-api route/service that
	// pushes domain data directly (`createThreadRoutes`'s per-thread +
	// conversations-list pushes via `wsHub`, `work-state-push-gateway.ts`'s
	// task/bet forwarder) — one topic space, one transport instance.
	// `createDbSubscribeAuthorizer` is `@hyperidle/realtime`'s Mechanism C DI
	// boundary — this deps bundle wires its four real outbound edges
	// (`conversation`/`users`/`org`/`work`) to the real already-imported
	// functions above.
	const wsHub = new WsConnectionHub(
		createDbSubscribeAuthorizer(db, {
			conversation: { getThreadById: (db, id) => findThread(db, { id }) },
			users: { getUserById: (db, id) => findUser(db, { id }) },
			org: { getTeamMembersById: (db, id) => getTeamMembers(db, { id }) },
			work: { getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id) },
		}),
	);
	// The "work" topic forwarder: task_state_changed/bet_state_changed
	// already carry the changed data (`toState`), so a thin EventBus-driven
	// forwarder suffices — same shape as `session-activity-gateway.ts`'s (c)
	// concern, registered once here rather than per-request.
	const workStatePushGatewayDispose = registerWorkStatePushGateway(eventBus, wsHub);

	// @lore S2-F01: the worker WS route is registered BEFORE the auth middleware
	// so remote workers can authenticate via HYPERIDLE_WORKER_TOKEN on the query
	// string without a user API key. It rides `bootAgentOrchestration`'s
	// `registerPreAuthRoutes` now — the socket is `run-orchestration`'s, so the
	// hook belongs to that Layer's boot rather than to core-api's `AppOptions`.
	const agentOrchestration = bootAgentOrchestration({
		db,
		eventBus,
		broadcast: wsHub,
		registerWorkerWebSocket: (apiRouter) => {
			runRuntime.registerWorkerWebSocket(apiRouter, upgradeWebSocket);
		},
	});

	const { app } = await bootCoreApi({
		db,
		eventBus,
		wsHub,
		serviceBootstrap: (ctx) => {
			// AF6/AU1: production boots the routine scheduler at the default
			// 30s cadence. Runtime deps are present, so generic routine fires
			// enter through AgentSessionRequest instead of stub sessions.
			const readAlertPreferences = async () => {
				const cfg = await readServerConfig(db);
				return {
					blockerAlerts: cfg.notifications.blockerAlerts,
					reviewAlerts: cfg.notifications.reviewAlerts,
					quietHoursEnabled: cfg.notifications.quietHoursEnabled,
					quietHoursStart: cfg.notifications.quietHoursStart,
					quietHoursEnd: cfg.notifications.quietHoursEnd,
				};
			};
			// AF7 §1: feed the task dispatcher's injection seam. Without it the
			// dispatcher never registers and a ready task never gets a session
			// (Z8-004). The TaskDispatcherDeps fields already exist.
			const dispatcherDeps = {
				adapterPool,
				workspace: workspaceAdapter,
				sandboxBasePath,
				resolveModel: makeResolveModel(db, credentialResolver),
				mcpBridgeRegistry,
				mcpBaseUrl,
				// AO2: pass the production mounter so routine-dispatched sessions mount.
				mounter,
			};
			// AU11: two owners register independently — core domain services
			// (knowledge/notifications/policy/routine-scheduler) then agent-owned
			// services (builtin-routine handlers/dispatcher/reapers).
			return [
				...registerCoreDomainServices({ ...ctx, readAlertPreferences, dispatcherDeps }),
				...registerAgentLayerServices({ ...ctx, dispatcherDeps }),
			];
		},
		adapterPool,
		workspaceAdapter,
		sandboxBasePath,
		credentialResolver,
		mcpBridgeRegistry,
		mcpBaseUrl,
		// AO2: wire the production mounter so session-route and routine-route sessions mount.
		mounter,
		registerWebSocket: (apiRouter, tokenStore) => {
			// L1 step9 (Adv-C1): production WS subscribe must enforce participant
			// authz on `thread:<id>` topics — already baked into `wsHub` above.
			// @lore AU26 B1a: the session-activity gateway used to be registered
			// here too. It moved into `bootAgentOrchestration` — it is the owning
			// Layer's own live tee of `session_started`/`session_ended`/
			// `tool_call_recorded`. The Application still supplies the sink: the
			// SAME `wsHub`, passed in as the one-method `{ broadcast }` port, so
			// there is still exactly one WS listener and one topic space (§D-E).
			wsDispose = registerWsRoute(apiRouter, tokenStore, upgradeWebSocket, wsHub);
		},
		// AU26 B1a: the other Layer, booted and handed in. The Application decides
		// to put agent-orchestration's routes behind this middleware stack — only
		// an Application may. B1b inverts this: the Application will own the `/api`
		// router and mount both apps itself.
		agentOrchestration,
		/**
		 * @lore X2: MCP route registered BEFORE auth middleware — MCP clients
		 * authenticate via the 64-char hex session token in the URL, not X-API-Key.
		 */
		registerMcpRoute: (apiRouter) => {
			// Pass enforcementRegistry so the /return-status sub-path
			// resolves token → sessionId → entry → forceMessage (the real adjudicator).
			const mcpRouter = mcpBridgeRegistry.router;
			apiRouter.route("/", mcpRouter);
		},
	});

	// AU21 §9 Increment 1: register the boot-time in-process CoreApiPort
	// transport — `tool-handlers-bindings.ts`'s `coreApi` accessor (currently
	// only `create_bet`) reads it via `getRegisteredCoreApiTransport()` on
	// every call. Colocated boot uses `app.fetch` directly; a split/remote
	// topology would register `createNetworkCoreApiTransport(baseUrl)`
	// instead — same call site, per architecture.md §6 Decision A.
	registerCoreApiTransport(createInProcessCoreApiTransport(app));

	// Serve built frontend when HYPERIDLE_STATIC_DIR is set.
	// The SPA falls back to index.html for client-side routing.
	const staticDir = process.env.HYPERIDLE_STATIC_DIR;
	let resolvedStaticDir: string | null = null;
	if (staticDir) {
		resolvedStaticDir = path.resolve(staticDir);
		if (!fs.existsSync(path.join(resolvedStaticDir, "index.html"))) {
			resolvedStaticDir = null;
		}
	}

	const appFetch = app.fetch;
	const staticFetch = resolvedStaticDir
		? createStaticHandler(resolvedStaticDir, appFetch)
		: appFetch;

	// Create the WebSocketServer with noServer: true — @hono/node-server
	// handles the upgrade event internally and delegates to this wss instance.
	const wss = new WebSocketServer({ noServer: true });

	const httpServer = serve({
		fetch: staticFetch,
		port,
		websocket: { server: wss },
	});

	let disposePromise: Promise<void> | null = null;
	const dispose = (): Promise<void> => {
		if (disposePromise) return disposePromise;
		disposePromise = (async () => {
			const failures: Array<{ phase: string; cause: unknown }> = [];
			const runPhase = async (phase: string, cleanup: () => void | Promise<void>) => {
				try {
					await cleanup();
				} catch (cause) {
					failures.push({ phase, cause });
				}
			};

			await runPhase("run-runtime", () => runRuntime.dispose());
			await runPhase("app-domain", () => disposeApp(app));
			await runPhase("websocket", () => {
				const disposeWebSocket = wsDispose;
				wsDispose = null;
				disposeWebSocket?.();
				// @lore AU26 B1a: the session-activity gateway is torn down by the
				// `app-domain` phase above — `bootAgentOrchestration`'s `dispose`
				// rides `disposeApp`'s disposer bag, so the owning Layer's teardown
				// travels with the app it was mounted into.
				workStatePushGatewayDispose();
			});
			await runPhase(
				"http",
				() =>
					new Promise<void>((resolve, reject) => {
						httpServer.close((error?: Error) => {
							if (error) reject(error);
							else resolve();
						});
					}),
			);
			if (dbHandle) {
				await runPhase("owned-db", () => dbHandle.close());
			}

			if (failures.length > 0) {
				throw new AggregateError(failures, "Server disposal failed");
			}
		})();
		return disposePromise;
	};

	return { httpServer, dispose, credentialResolver };
}
