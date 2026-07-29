import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ServerType, serve, upgradeWebSocket } from "@hono/node-server";
import {
	type CredentialResolver,
	DbCredentialResolver,
	decryptCredentialValue,
	deleteCredential,
	encryptCredentialValue,
	listConnections,
	readCredentials,
	writeCredential,
} from "@hyperidle/connections";
import {
	findThread,
	insertMessage,
	insertThread,
	listMessages,
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
import type { DispatchConfig, DispatchOps } from "@hyperidle/dispatch";
import { RegistryFilesystemMounter } from "@hyperidle/filesystems";
import { createGitRunner, registerGitExportHandler } from "@hyperidle/git-export";
import {
	type AdapterPool,
	createReturnEnforcement,
	type SandboxAdapter,
} from "@hyperidle/harness-registry";
import { createMcpToolBridge } from "@hyperidle/harness-registry/mcp";
import {
	create as createKnowledgeItem,
	get as getKnowledgeItem,
	list as listKnowledgeItems,
	reapAccessLog,
	recordConflict as recordWritebackConflict,
	update as updateKnowledgeItem,
	VersionConflictError,
} from "@hyperidle/knowledge";
import { resolveModel } from "@hyperidle/model-gateway";
import {
	enqueue,
	installNotifications,
	isSilenced,
	type NotificationsDeps,
	reap,
} from "@hyperidle/notifications";
import { getTeamMembers, resolveReviewRecipients, updateTeam } from "@hyperidle/org";
import type { PolicyDeps } from "@hyperidle/policy";
import { registerPolicy } from "@hyperidle/policy";
import { createDbSubscribeAuthorizer, WsBroadcaster } from "@hyperidle/realtime";
import { registerReviewSubscriptions } from "@hyperidle/review";
import { listRoutines } from "@hyperidle/routine";
import type { RuntimeDeps } from "@hyperidle/run-orchestration";
import {
	backfillConfigurationDefaults,
	migrateCredentialsToStore,
	readServerConfig,
	updateServerConfig,
} from "@hyperidle/settings";
import { createLogger, EventBus, type ModelTier, type ResolvedModel } from "@hyperidle/shared";
import {
	findUser,
	listUsers,
	reapExpiredCredentials,
	requireRunnableAgent,
} from "@hyperidle/users";
import * as work from "@hyperidle/work";
import {
	getTaskRiskTierByTaskId,
	registerBetDecomposition,
	resolveOrphanedDecompositions,
	type WorkDeps,
} from "@hyperidle/work";
import { and, inArray, lt } from "drizzle-orm";
import { WebSocketServer } from "ws";
import { attachRelevanceListener } from "../knowledge/src/relevance-listener.js";
import { createApp, disposeApp } from "./app.js";
import { registerWsRoute } from "./routes/ws.js";
import { registerAgentRunAdmissionReactions } from "./services/agent-run-admission-reactions.js";
import { agentSelectionService } from "./services/agent-selection-bindings.js";
import {
	createInProcessCoreApiTransport,
	registerCoreApiTransport,
} from "./services/core-api-port-composition.js";
// @lore AD8c: cost sentinel extracted from routine row to application code.
// @lore AU20 Am3: `costOps._testHooks.installDedupReleaser` removed — folded into
// `costOps.startSentinel` (now a single call covers both the dedup releaser
// subscription and the sentinel interval). Disposer count 15→14.
import { costOps } from "./services/cost-bindings.js";
import { dispatchOps } from "./services/dispatch-bindings.js";
import { registerRoutineRunSessionEndReactions } from "./services/routine-run-session-end-reactions.js";
import {
	registerBuiltinRoutineReactions,
	startRoutineScheduler,
} from "./services/routine-scheduler-bindings.js";
import { registerSessionActivityGateway } from "./services/session-activity-gateway.js";

type AssistantTurnDeps = Parameters<DispatchOps["runAssistantTurn"]>[0];
type TaskDispatcherDeps = NonNullable<DispatchConfig["task"]> & {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
};

import {
	enqueueWorkIntent,
	registerSessionCostRecorder,
	startLifecycleProjectionDrain,
} from "@hyperidle/session-requests";
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
 * @lore AU19 Increment 2c: `git-export`'s two DI ports (Mechanism C), wired
 * here at the `packages/server` composition point — both targets
 * (`settings`, `knowledge`) are real, already-migrated packages.
 * `gitExportKnowledgeReader` closes the census-missed `git-export ->
 * knowledge` edge surfaced by this migration (see `@hyperidle/git-export`'s
 * `ports.ts` top `@lore`).
 */
const gitExportServerConfigPort = { read: readServerConfig, update: updateServerConfig };
const gitExportKnowledgeReader = {
	listExportableItems: (
		db: import("@hyperidle/db").HyperIdleDb,
		filters: { readonly layers: readonly string[]; readonly statuses: readonly string[] },
	) => listKnowledgeItems(db, { exportable: filters }),
	getProjectionByItemId: (db: import("@hyperidle/db").HyperIdleDb, id: string) =>
		getKnowledgeItem(db, id, { view: "projection" }),
};

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
 * review routing, lifecycle propagation, retention, git-export, and the
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
		costAlerts: boolean;
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

	// AU21 §9 Increment 6 (Decision D): agent-orchestration's OWN reaction
	// (session-requests, NOT a core-api Service) — wired here because
	// server-factory.ts is today's single process composition root, the same
	// reason `startLifecycleProjectionDrain` (also an orchestration-owned
	// module) is booted from this file.
	disposers.push(
		identifyBootstrapOwner(
			registerSessionCostRecorder(db, eventBus),
			"session-cost recorder",
			"unsubscribe",
			["session_ended subscription"],
		),
	);

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
	disposers.push(
		identifyBootstrapOwner(
			registerGitExportHandler(db, eventBus, {
				runnerFactory: (repoPath) => createGitRunner(repoPath),
				serverConfig: gitExportServerConfigPort,
				knowledge: gitExportKnowledgeReader,
			}),
			"git-export handler",
			"unsubscribe",
			["knowledge-update subscription"],
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
 * AU11: registers AGENT-owned services — builtin routine handlers, cost-cap
 * dedup release, cost sentinel, the task dispatcher, and the sandbox/
 * routine-session reapers. Split from the former `bootstrapAppRuntime`
 * shell alongside `registerCoreDomainServices` (see that function's
 * doc-comment for the behavior-preservation invariant).
 *
 * @lore AU20 Ag1b: dispatch trigger registration collapsed into
 * `dispatchOps.start`. Scheduler config is absorbed here so one start call boots
 * the full dispatch lifecycle (builtin handlers + assistant dispatcher +
 * optional task trigger + optional scheduler). The returned disposer owns
 * the entire lifecycle.
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

	// AF6 §1 + AU20 Ag1b: `dispatchOps.start` boots the assistant + task dispatch
	// lifecycle. AU21 §9 Increment 4: the routine scheduler (builtin-routine
	// event reaction + the cron/due-eval tick loop) is a SEPARATE core-api-side
	// lifecycle now (`routine-scheduler-bindings.ts`) — dispatch no longer knows
	// about routines at all.
	const pollIntervalMs = ctx.routinePollIntervalMs ?? DEFAULT_ROUTINE_POLL_INTERVAL_MS;
	const dispatchPromise = dispatchOps.start({
		db,
		eventBus,
		task: ctx.dispatcherDeps,
	});
	dispatchPromise.catch((err) => {
		serviceBootstrapLog.error("dispatch start failed", { err });
	});
	disposers.push(
		identifyBootstrapOwner(
			() => {
				void dispatchPromise.then((d) => d()).catch(() => {});
			},
			"dispatch lifecycle",
			"assistant/task stop",
			["assistant", "task"],
		),
	);

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

	// @lore AD8c: cost sentinel registered as a 15-minute scheduled job.
	// @lore AU20 Am3: `costOps.startSentinel` now also installs the dedup-releaser
	// EventBus subscription (folded from `costOps._testHooks.installDedupReleaser`).
	// One disposer instead of two; count drops from 15 to 14.
	disposers.push(
		identifyBootstrapOwner(
			costOps.startSentinel(db, eventBus),
			"cost sentinel",
			"sentinel plus dedup subscription stop",
			["sentinel", "dedup subscription"],
		),
	);

	// AF7 §6: TTL workspace reaper (task trigger is now inside dispatchOps.start).
	void reaperStaleAfterMs;

	return disposers;
}

/**
 * AF7 §1: build the dispatcher's `resolveModel(tier)`. The HTTP path resolves
 * models in sessions-routes via resolveModelTier; the dispatcher (no request
 * context) needs the same resolution. Reuses the server config + the production
 * credential resolver. When resolution fails (missing credential), the dispatcher
 * treats it as unrecoverable-per-task — correct.
 */
function makeResolveModel(
	db: HyperIdleDb,
	credentialResolver: CredentialResolver,
): (tier: string) => Promise<ResolvedModel | undefined> {
	return async (tier: string): Promise<ResolvedModel | undefined> => {
		const cfg = await readServerConfig(db);
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
	/**
	 * AH6 B3: Optional assistantTurnDeps override for test environments.
	 * When absent, createServer builds deps from adapterPool + credentialResolver.
	 * Test servers may inject a custom stub here to control turn behavior.
	 *
	 * @lore AH6: The production path always builds real deps; this field exists
	 * so the ah6-test-server.ts can override with the seeded model/credential.
	 */
	readonly assistantTurnDeps?: AssistantTurnDeps;
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

	// AK3 §1: Boot-time orphan sweep — resolve any bet stuck on 'running' from a
	// previous crash. Must run BEFORE the subscriber starts so a re-commit cannot
	// race with the sweep (subscriber isn't listening yet at this point).
	// @lore AK3: 'running' at boot = orphaned in-process turn (no restart resume).
	await resolveOrphanedDecompositions(db);

	// AK3 §2: Register the kernel-side bet decomposition subscriber.
	// Deps: all already available from the dispatcherDeps wiring above.
	//
	// @lore AU20 Ag5a: `WorkDeps` bundles the five inbound DI ports — wired
	// ONCE here at the composition root. Spread into `registerBetDecomposition`
	// (and any future function that needs the full set); sub-shapes are
	// extracted where a function only needs a subset (e.g. `transitionTask`
	// takes `TaskStateMachineDeps` with only `workIntents`).
	const workDeps: WorkDeps = {
		// @lore AU20 Ab4: adapts new AgentSelectionService methods to work's
		// AgentSelectionDefaults structural-mirror port (unchanged in work/ports.ts).
		agentSelection: {
			listCandidates: (db, teamId) => agentSelectionService.listCandidates({ db, teamId }),
			selectAgent: (occDeps, occasion) =>
				agentSelectionService.selectAgent({
					surface: occasion.surface,
					db: occDeps.db,
					eventBus: occDeps.eventBus,
					teamId: occasion.teamId,
					workKey: occasion.workKey,
					roleHint: occasion.roleHint,
					spreadIndex: occasion.spreadIndex,
				}),
		},
		users: {
			getUserById: (db, id) => findUser(db, { id }),
			listActiveAiUsersByTeams: (db, teamIds) =>
				listUsers(db, { teamIds, kind: "ai", status: "active" }),
			// AU21 §6 Decision B / Increment 3: unfiltered persisted-FK-membership
			// read for `resolveBetDecompositionRequest`'s candidate union — see
			// `ports.ts`'s `UserStoreReader.listUsersByTeam` `@lore`.
			listUsersByTeam: (db, teamMembersId) => listUsers(db, { teamIds: [teamMembersId] }),
		},
		costCap: { checkCostCap: costOps.check },
		workIntents: { record: enqueueWorkIntent },
		// AU19 Increment 1c: `org` is a REAL migrated package — wired to its real
		// exported functions (W2 closure).
		teamCapacity: {
			getByTeamId: (db, teamId) => getTeamMembers(db, { teamId }),
			setActiveBets: (db, teamId, activeBets) => updateTeam(db, teamId, { activeBets }),
		},
	};
	const disposeBetDecomp = registerBetDecomposition({
		db,
		eventBus,
		adapterPool,
		sandboxBasePath,
		resolveModel: makeResolveModel(db, credentialResolver),
		...workDeps,
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
			assistantTurn: deps.assistantTurnDeps ?? { db, eventBus, adapterPool, credentialResolver },
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

	// AH6 B3 (R-1): Build assistantTurnDeps from the already-constructed adapterPool
	// + credentialResolver so the message→turn trigger fires in production.
	// When assistantTurnDeps is absent from createApp, POST /api/threads/:id/messages
	// stores the message but never calls runAssistantTurn — the silent no-op that
	// caused the inert Assistant. This additive wiring closes R-1 without changing
	// any other app behaviour.
	//
	// @lore AH6 B3: deps.assistantTurnDeps can override (test-only) if the caller
	// needs to inject a stub. Production always uses the constructed deps here.
	const assistantTurnDeps = deps.assistantTurnDeps ?? {
		db,
		eventBus,
		adapterPool,
		credentialResolver,
	};

	let wsDispose: (() => void) | null = null;
	let sessionActivityGatewayDispose: (() => void) | null = null;
	const app = await createApp({
		db,
		eventBus,
		assistantTurnDeps,
		serviceBootstrap: (ctx) => {
			// AF6/AU1: production boots the routine scheduler at the default
			// 30s cadence. Runtime deps are present, so generic routine fires
			// enter through AgentSessionRequest instead of stub sessions.
			const readAlertPreferences = async () => {
				const cfg = await readServerConfig(db);
				return {
					blockerAlerts: cfg.notifications.blockerAlerts,
					costAlerts: cfg.notifications.costAlerts,
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
			// services (builtin-routine handlers/cost-cap/dispatcher/reapers).
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
			// authz on `thread:<id>` topics. The authorizer reads the threads
			// table on each subscribe call.
			// @lore AU19 Increment 2f: `createDbSubscribeAuthorizer` is
			// `@hyperidle/realtime`'s Mechanism C DI boundary — this deps bundle
			// wires its four real outbound edges (`conversation`/`users`/`org`/
			// `work`) to the real already-imported functions above.
			const broadcaster = new WsBroadcaster(
				eventBus,
				createDbSubscribeAuthorizer(db, {
					conversation: { getThreadById: (db, id) => findThread(db, { id }) },
					users: { getUserById: (db, id) => findUser(db, { id }) },
					org: { getTeamMembersById: (db, id) => getTeamMembers(db, { id }) },
					work: { getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id) },
				}),
			);
			broadcaster.start();
			// AU21 §6 Decision E / §9 Increment 7: the (c) session/harness-
			// streaming forward relocated OUT of `WsBroadcaster`'s own route
			// table into this dedicated gateway — agent-orchestration's
			// gateway/router role over the events that also feed the
			// relocated `SessionActivityBuffer` (`@hyperidle/agent-execution`).
			// Drives the SAME broadcaster's `broadcast()` from the outside.
			sessionActivityGatewayDispose = registerSessionActivityGateway(eventBus, broadcaster);
			wsDispose = registerWsRoute(apiRouter, eventBus, tokenStore, upgradeWebSocket, broadcaster);
		},
		/**
		 * @lore S2-F01: Worker WS route registered BEFORE auth middleware so remote
		 * workers can authenticate via HYPERIDLE_WORKER_TOKEN query param without
		 * needing a user API key. Same placement pattern as the user WS route.
		 */
		registerWorkerWebSocket: (apiRouter) => {
			runRuntime.registerWorkerWebSocket(apiRouter, upgradeWebSocket);
		},
		/**
		 * @lore X2: MCP route registered BEFORE auth middleware — MCP clients
		 * authenticate via the 64-char hex session token in the URL, not X-API-Key.
		 */
		registerMcpRoute: (apiRouter) => {
			// AL6 CRIT-1: pass enforcementRegistry so the /return-status sub-path
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

			await runPhase("bet-decomposition", disposeBetDecomp);
			await runPhase("run-runtime", () => runRuntime.dispose());
			await runPhase("app-domain", () => disposeApp(app));
			await runPhase("websocket", () => {
				const disposeWebSocket = wsDispose;
				wsDispose = null;
				disposeWebSocket?.();
				const disposeSessionActivityGateway = sessionActivityGatewayDispose;
				sessionActivityGatewayDispose = null;
				disposeSessionActivityGateway?.();
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
