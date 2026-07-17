import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ServerType, serve, upgradeWebSocket } from "@hono/node-server";
import { createAgentSelectionOps, resolveDecompositionPlan } from "@hyperidle/agent-selection";
import { registerCaptureWriteback } from "@hyperidle/capture-writeback";
import {
	type CredentialResolver,
	DbCredentialResolver,
	decryptCredentialValue,
	deleteCredentialByName,
	encryptCredentialValue,
	findCredentialByName,
	getServerSecret,
	insertCredential,
	listServiceConnectionsByAuthSource,
	upsertCredential,
} from "@hyperidle/connections";
import {
	getThreadById,
	insertMessage,
	insertThread,
	listInitiatedVerdictMessages,
	listMessagesByThread,
	listVerdictMessagesByItemIds,
	updateMessage,
	updateThread,
} from "@hyperidle/conversation";
import {
	createPgliteDb,
	createPostgresDb,
	type DbHandle,
	type HyperIdleDb,
	resolveProfile,
} from "@hyperidle/db";
import type { AssistantTurnDeps, TaskDispatcherDeps } from "@hyperidle/dispatch";
import { RegistryFilesystemMounter } from "@hyperidle/filesystems";
import { createGitRunner, registerGitExportHandler } from "@hyperidle/git-export";
import {
	type AdapterPool,
	enforcementRegistry,
	type SandboxAdapter,
} from "@hyperidle/harness-registry";
import {
	create as createKnowledgeItem,
	findKnowledgeItemProjectionById,
	listExportableKnowledgeItems,
	reapKnowledgeAccessLog,
	recordWritebackConflict,
	registerRelevanceListener,
	setupFts,
	update as updateKnowledgeItem,
	VersionConflictError,
} from "@hyperidle/knowledge";
import { createMcpBridgeRegistry, createMcpRoute } from "@hyperidle/mcp-provider";
import { resolveModelTier } from "@hyperidle/model-gateway";
import {
	type AlertPreferences,
	defaultMutePreferenceReader,
	defaultNotificationAdapterFactory,
	deleteReaped,
	insertNotification,
	isSilenced,
	type NotificationsConfigDeps,
	type NotificationsCredentialCipher,
	type NotificationsCredentialStore,
	type NotificationsMuteDeps,
	type NotificationsSilenceDeps,
	type NotificationsWorkReader,
	registerNotificationDispatcher,
	registerNotificationListener,
	startNotificationDrain,
} from "@hyperidle/notifications";
import {
	getTeamMembersById,
	getTeamMembersByTeamId,
	resolveReviewRecipients,
	setTeamMembersActiveBets,
} from "@hyperidle/org";
import type { LifecyclePropagationDeps, PolicyEngineDeps } from "@hyperidle/policy";
import { registerLifecyclePropagation, registerPolicyEngine } from "@hyperidle/policy";
import { createDbSubscribeAuthorizer, WsBroadcaster } from "@hyperidle/realtime";
import type { RetentionReaperDeps } from "@hyperidle/retention";
import { startRetentionReaper } from "@hyperidle/retention";
import { registerSessionReviewCreator } from "@hyperidle/review";
import { listRoutines } from "@hyperidle/routine";
import {
	migrateCredentialsToStore,
	projectProductionConfigurationDefaults,
	readServerConfig,
	updateServerConfig,
} from "@hyperidle/settings";
import { createLogger, EventBus, type ModelTier, type ResolvedModel } from "@hyperidle/shared";
import {
	getFirstUserByKind,
	getUserById,
	listActiveAiUsersByTeams,
	listUsersByKind,
	reapInviteCodes,
	reapLoginSessions,
} from "@hyperidle/users";
import {
	createItem as createWorkItem,
	getBetById,
	getItemById,
	getTaskById,
	getTaskRiskTierByTaskId,
	listItemIdsBySourceAgent,
	listQueuedItemsSince,
	listTasks,
	registerBetDecomposition,
	resolveOrphanedDecompositions,
	transitionBetStatus,
	transitionTaskState,
	updateItemById,
	updateTaskById,
} from "@hyperidle/work";
import { WebSocketServer } from "ws";
import { createApp, disposeApp } from "./app.js";
import { registerWsRoute } from "./routes/ws.js";
// @lore AD8c: cost sentinel extracted from routine row to application code.
import {
	checkCostCap,
	registerCostCapDedupReleaser,
	startCostSentinel,
} from "./services/cost-bindings.js";
import {
	registerBuiltinRoutineHandlers,
	registerTaskDispatcher,
	startRoutineScheduler,
} from "./services/dispatch-bindings.js";
import { startAgentLifecycleProjectionDrain } from "./services/lifecycle-projection-bindings.js";
import {
	bootAgentLayer,
	markRunningAgentSessionRequestsForShutdown,
	registerWorkerWsRoute,
} from "./services/run-orchestration-bindings.js";
import {
	type ProvisionSessionDeps,
	reapStaleRoutineSessions,
	registerHandoffTerminationRequester,
	startSandboxReaper,
} from "./services/session-lifecycle-bindings.js";
import { recordAgentWorkIntent } from "./services/session-requests-bindings.js";

const serviceBootstrapLog = createLogger({ pkg: "server.server-factory" });

/** Production default poll cadence for the routine scheduler. */
const DEFAULT_ROUTINE_POLL_INTERVAL_MS = 30_000;
/** Default staleness bound for the routine-session reaper (1h). */
const DEFAULT_REAPER_STALE_AFTER_MS = 60 * 60 * 1000;

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
	listExportableItems: listExportableKnowledgeItems,
	getProjectionByItemId: findKnowledgeItemProjectionById,
};

const notificationsCredentialCipher: NotificationsCredentialCipher = {
	getServerSecret,
	encryptCredentialValue,
	decryptCredentialValue,
};

const notificationsCredentialStore: NotificationsCredentialStore = {
	findByName: findCredentialByName,
	upsert: upsertCredential,
	deleteByName: deleteCredentialByName,
};

const notificationsConfigDeps: NotificationsConfigDeps = {
	serverConfig: notificationsServerConfigPort,
	credentialCipher: notificationsCredentialCipher,
	credentialStore: notificationsCredentialStore,
};

const notificationsMuteDeps: NotificationsMuteDeps = {
	serverConfig: notificationsServerConfigPort,
};

const notificationsSilenceDeps: NotificationsSilenceDeps = {
	serverConfig: notificationsServerConfigPort,
	users: { getUserById },
	teams: { getTeamMembersById },
};

const notificationsWorkReader: NotificationsWorkReader = {
	listQueuedItemsSince,
	getItemById,
};

/**
 * @lore AU19 Increment 2a: `@hyperidle/policy`'s DI ports (Mechanism C),
 * wired here at the `packages/server` composition point — `work`/
 * `conversation`/`users`/`org` are all real, already-migrated packages.
 * `PolicyEngineDeps.silence` closes over `notificationsSilenceDeps` (built
 * above) so `policy` itself only ever sees the boolean-returning
 * `isSilenced` predicate, never `notifications`' own deps shape.
 */
const policyEngineDeps: PolicyEngineDeps = {
	work: { getItemById, updateItemById },
	conversation: { insertMessage, listMessagesByThread, updateMessage, updateThread },
	silence: {
		isSilenced: (db, item, now) => isSilenced(db, item, now, notificationsSilenceDeps),
	},
	approvalRate: {
		work: { listItemIdsBySourceAgent },
		conversation: { listInitiatedVerdictMessages, listVerdictMessagesByItemIds },
	},
};

const lifecyclePropagationDeps: LifecyclePropagationDeps = {
	work: { getTaskById, transitionTaskState, getBetById, transitionBetStatus, listTasks },
	conversation: { insertMessage, insertThread },
	users: { getFirstUserByKind },
	notifications: { insert: insertNotification },
};

/**
 * @lore AU19 Increment 2g: `@hyperidle/retention`'s DI ports (Mechanism C),
 * wired here at the `packages/server` composition point — `users`/
 * `knowledge`/`notifications` are all real, already-migrated packages.
 * Two of the three ports (`users`, `knowledge`) close census-missed edges
 * surfaced by this migration (raw table access wasn't a countable edge at
 * original census time — see `@hyperidle/retention`'s `ports.ts` top
 * `@lore`); `notifications` was already census-listed.
 */
const retentionReaperDeps: RetentionReaperDeps = {
	users: { reapLoginSessions, reapInviteCodes },
	knowledge: { reapKnowledgeAccessLog },
	notifications: { deleteReaped },
};

/**
 * @lore AU19 Increment 3e: `@hyperidle/agent-selection`'s bound-ops factory,
 * wired here at the `packages/server` composition point — `users`/`org` are
 * both real, already-migrated packages. `work`'s (still-interim, §10.3
 * against-grain) `AgentSelectionDefaults` port below now points at these
 * real bound exports instead of the deleted `services/select-agent.ts` /
 * `services/agent-defaults/resolvers.ts` flat modules — mechanical wiring
 * swap, zero behavior change.
 */
const agentSelectionOps = createAgentSelectionOps({
	users: { getUserById, listActiveAiUsersByTeams },
	teams: { getTeamMembersByTeamId },
});

/**
 * AU11: registers CORE-owned application services against the event bus —
 * knowledge (relevance listener, FTS), notifications, policy engine,
 * review routing, lifecycle propagation, retention, git-export, and the
 * routine scheduler (cron/due-eval + `recordAgentWorkIntent`).
 *
 * Split from the former `app-runtime` shell's `bootstrapAppRuntime` —
 * together with `registerAgentLayerServices` this replicates the exact
 * same disposer set; only the grouping changed, not registration order
 * within each group (behavior-preserving, AU11 import-path-only invariant).
 *
 * @lore AU15: routine-scheduler.ts stays Core (cron/due-eval is a core
 * domain concern); the residual Core→Agent edge AU11 recorded here (its
 * fire-time `isAgentAtWipLimit`/`selectAgentByAppDefaults` call into the
 * agent-owned `agent-selection.ts`) is CLOSED — owner-WIP evaluation and
 * delegate resolution moved to drain-time in
 * `agent-work-intent-worker.ts`'s `resolveAuthoritativeInput` (`routine_run`
 * branch). routine-scheduler.ts no longer imports agent-selection.ts at all.
 */
export function registerCoreDomainServices(ctx: {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly readAlertPreferences?: () => Promise<AlertPreferences>;
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
	disposers.push(startAgentLifecycleProjectionDrain(db));

	// AF9 Task 3b: fire-and-forget FTS setup at every boot so the fts_vector
	// column exists even when production createServer skips the drizzle migrator.
	setupFts(db).catch((err) => {
		serviceBootstrapLog.error("FTS setup failed at boot", { err });
	});

	disposers.push(registerRelevanceListener(db, eventBus));
	disposers.push(
		registerSessionReviewCreator(db, eventBus, {
			work: { getTaskById, updateTaskById, createItem: createWorkItem },
			conversation: { insertThread, getThreadById, updateThread },
			users: { getUserById, listUsersByKind },
			org: { resolveReviewRecipients },
			taskRiskTier: { getRiskTierByTaskId: getTaskRiskTierByTaskId },
		}),
	);
	disposers.push(registerPolicyEngine(db, eventBus, policyEngineDeps));
	disposers.push(registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps));
	disposers.push(
		registerGitExportHandler(db, eventBus, {
			runnerFactory: (repoPath) => createGitRunner(repoPath),
			serverConfig: gitExportServerConfigPort,
			knowledge: gitExportKnowledgeReader,
		}),
	);
	disposers.push(
		registerNotificationDispatcher(db, eventBus, {
			adapterFactory: defaultNotificationAdapterFactory,
			readAlertPreferences: ctx.readAlertPreferences,
			notificationsConfig: notificationsConfigDeps,
			silencePolicy: notificationsSilenceDeps,
			work: notificationsWorkReader,
		}),
	);

	// AF8: notification listener (event→typed row) + drain loop (automatic delivery).
	const muteReader = defaultMutePreferenceReader(db, notificationsMuteDeps);
	disposers.push(
		registerNotificationListener(db, eventBus, { mute: muteReader, work: notificationsWorkReader }),
	);
	disposers.push(
		startNotificationDrain(db, defaultNotificationAdapterFactory, {
			notificationsConfig: notificationsConfigDeps,
			silencePolicy: notificationsSilenceDeps,
		}),
	);

	// AF16 T17: in-process 6h TTL retention reaper. Runs unconditionally.
	disposers.push(startRetentionReaper(db, retentionReaperDeps));

	const reaperStaleAfterMs = ctx.reaperStaleAfterMs ?? DEFAULT_REAPER_STALE_AFTER_MS;
	// AF6 §1 (Option A): start the routine scheduler async, push a deferred
	// disposer that drains the start promise then stops. Built-in routines
	// auto-fire (no session); generic routines are gated by canProvision.
	const pollIntervalMs = ctx.routinePollIntervalMs ?? DEFAULT_ROUTINE_POLL_INTERVAL_MS;
	const schedulerPromise = startRoutineScheduler(db, eventBus, {
		pollIntervalMs,
		canProvision: ctx.canProvision ?? Boolean(ctx.dispatcherDeps),
		...(ctx.dispatcherDeps ? { runtimeDeps: ctx.dispatcherDeps } : {}),
		// Non-optional periodic reaper sweep: catches in-process hangs.
		reap: () => reapStaleRoutineSessions(db, eventBus, { staleAfterMs: reaperStaleAfterMs }),
		reaperCadenceMs: ctx.reaperCadenceMs,
	});
	schedulerPromise.catch((err) => {
		serviceBootstrapLog.error("routine scheduler failed to start", { err });
	});
	disposers.push(() => {
		void schedulerPromise.then((s) => s.stop()).catch(() => { /* best-effort scheduler stop on dispose; errors discarded */ });
	});

	return disposers;
}

/**
 * AU11: registers AGENT-owned services — builtin routine handlers, cost-cap
 * dedup release, cost sentinel, the task dispatcher, and the sandbox/
 * routine-session reapers. Split from the former `bootstrapAppRuntime`
 * shell alongside `registerCoreDomainServices` (see that function's
 * doc-comment for the behavior-preservation invariant).
 */
export function registerAgentLayerServices(ctx: {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly dispatcherDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
	readonly reaperStaleAfterMs?: number;
}): Array<() => void> {
	const { db, eventBus } = ctx;
	const disposers: Array<() => void> = [];

	disposers.push(registerBuiltinRoutineHandlers(db, eventBus));
	disposers.push(registerCostCapDedupReleaser(eventBus));
	disposers.push(registerHandoffTerminationRequester(db, eventBus));
	// @lore AD8c: cost sentinel registered as a 15-minute scheduled job.
	disposers.push(startCostSentinel(db, eventBus));

	// AD2: Register task dispatcher when provisioning deps are provided.
	if (ctx.dispatcherDeps) {
		disposers.push(
			registerTaskDispatcher({
				db,
				eventBus,
				...ctx.dispatcherDeps,
			}),
		);
		// AF7 §6: TTL workspace reaper.
		disposers.push(startSandboxReaper(db, { sandboxBasePath: ctx.dispatcherDeps.sandboxBasePath }));
	}

	// AF6 §4: boot one-shot reaper — clear zombie routine sessions left by a
	// previous process. Fire-and-forget; never blocks boot.
	const reaperStaleAfterMs = ctx.reaperStaleAfterMs ?? DEFAULT_REAPER_STALE_AFTER_MS;
	reapStaleRoutineSessions(db, eventBus, { staleAfterMs: reaperStaleAfterMs }).catch((err) => {
		serviceBootstrapLog.error("boot routine-session reaper failed", { err });
	});

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
		return resolveModelTier(tier as ModelTier, cfg.modelGateway, credentialResolver);
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
	readonly dispose: () => void;
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
	const serverSecret = getServerSecret();
	if (!serverSecret) {
		// @lore AH1 §6: Boot is non-fatal but we log a warning so misconfigured deployments
		// are visible. The write boundary (PUT /api/credentials) rejects loudly (500
		// MISSING_ROOT_SECRET). console.warn is intentional here — the observability adapter
		// is not yet constructed at this point in the boot sequence.
		// biome-ignore lint/suspicious/noConsole: intentional boot-time warning before observability adapter is constructed
		console.warn(
			"[HyperIdle] No HYPERIDLE_CREDENTIAL_KEY/HYPERIDLE_API_KEY set — credential writes will be refused (MISSING_ROOT_SECRET). Agents cannot resolve keys until a secret is configured.",
		);
	}
	const credentialResolver: CredentialResolver = new DbCredentialResolver(db, serverSecret);

	// AH1 §4: Run the one-time credential migration at boot.
	// Relocates legacy server_config blob apiKeys → server_credentials.
	// Seeds anthropic_api_key from env if the DB slot is absent.
	// No-op when already migrated. Non-fatal: migration skips if no root secret.
	// @lore AU19 Increment 1h: `settings`' `SettingsCredentialCipher`/
	// `SettingsCredentialStore` ports (Mechanism C) wired here — both to
	// `@hyperidle/connections`' real exports now that `connections` has
	// migrated (closes the Inc-1f interim wiring; see `@hyperidle/settings`'
	// `ports.ts` top-level `@lore`), zero behavior change.
	await migrateCredentialsToStore(
		db,
		{ getServerSecret, encryptCredentialValue, decryptCredentialValue },
		{ findByName: findCredentialByName, insert: insertCredential },
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
	await projectProductionConfigurationDefaults(db, {
		users: { listUsersByKind },
		routines: { listRoutines },
		serviceConnections: { listByAuthSource: listServiceConnectionsByAuthSource },
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
	const disposeBetDecomp = registerBetDecomposition({
		db,
		eventBus,
		adapterPool,
		sandboxBasePath,
		resolveModel: makeResolveModel(db, credentialResolver),
		// AU19 Increment 1b: `work`'s four outbound DI ports (Mechanism C) — the
		// concrete implementation for `workIntents` still lives in packages/server
		// (session-requests has not migrated yet); `agentSelection`/`costCap`
		// wire to real Service packages (`agent-selection` since Increment 3e,
		// `cost` since Increment 3g — `costCap` is RULED PERMANENT, not an
		// EventBus-inversion target, see `@hyperidle/work`'s `ports.ts` top
		// `@lore`). See packages/core-api/work/src/ports.ts for the port
		// contracts.
		agentSelection: {
			enumerateTeamCandidates: agentSelectionOps.enumerateTeamCandidates,
			selectOwner: agentSelectionOps.selectOwner,
			resolveDecompositionPlan,
		},
		users: { getUserById, listActiveAiUsersByTeams },
		costCap: { checkCostCap },
		workIntents: { record: recordAgentWorkIntent },
		// AU19 Increment 1c: `org` is a REAL migrated package — wired to its real
		// exported functions (W2 closure).
		teamCapacity: { getByTeamId: getTeamMembersByTeamId, setActiveBets: setTeamMembersActiveBets },
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
	const disposeCaptureWriteback = registerCaptureWriteback({
		db,
		eventBus,
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
	});

	// X2: Create the MCP bridge registry that maps session tokens to transport instances.
	const mcpBridgeRegistry = createMcpBridgeRegistry();
	const mcpBaseUrl = `http://localhost:${port}`;
	// @lore AU19 Increment 3c: `runtime` is built as its own variable (not an
	// inline literal in the `bootAgentLayer` call) so it type-checks against
	// `bootAgentLayer`'s Mechanism-C-narrowed `RunOrchestrationProvisionDeps`
	// (only `db`/`eventBus`/`onHarnessStarted` declared) without an excess-
	// property error — the extra fields (`adapterPool`, `workspace`, …) still
	// flow through unchanged at runtime, only assigned via a variable rather
	// than a fresh literal (TS excess-property-check applies to literals, not
	// variable references). See `run-orchestration`'s `ports.ts` top `@lore`.
	const runtimeDeps: ProvisionSessionDeps = {
		db,
		eventBus,
		adapterPool,
		workspace: workspaceAdapter,
		mcpBridgeRegistry,
		mcpBaseUrl,
		serviceConnectionResolver: credentialResolver,
		mounter,
	};
	const disposeAgentLayer = await bootAgentLayer({
		db,
		eventBus,
		runtime: runtimeDeps,
		sandboxBasePath,
		resolveModel: makeResolveModel(db, credentialResolver),
		assistantTurn: deps.assistantTurnDeps ?? { db, eventBus, adapterPool, credentialResolver },
	});

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
					conversation: { getThreadById },
					users: { getUserById },
					org: { getTeamMembersById },
					work: { getTaskById },
				}),
			);
			broadcaster.start();
			wsDispose = registerWsRoute(apiRouter, eventBus, tokenStore, upgradeWebSocket, broadcaster);
		},
		/**
		 * @lore S2-F01: Worker WS route registered BEFORE auth middleware so remote
		 * workers can authenticate via HYPERIDLE_WORKER_TOKEN query param without
		 * needing a user API key. Same placement pattern as the user WS route.
		 */
		registerWorkerWebSocket: (apiRouter) => {
			registerWorkerWsRoute(apiRouter, adapterPool, upgradeWebSocket);
		},
		/**
		 * @lore X2: MCP route registered BEFORE auth middleware — MCP clients
		 * authenticate via the 64-char hex session token in the URL, not X-API-Key.
		 */
		registerMcpRoute: (apiRouter) => {
			// AL6 CRIT-1: pass enforcementRegistry so the /return-status sub-path
			// resolves token → sessionId → entry → forceMessage (the real adjudicator).
			const mcpRouter = createMcpRoute(mcpBridgeRegistry, enforcementRegistry);
			apiRouter.route("/", mcpRouter);
		},
	});

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

	const dispose = (): void => {
		// @lore I1 M1: tear down event-bus subscriptions first so none of the
		// five createApp-registered handlers (session-review-creator,
		// policy-engine, builtin-routines, git-export, notification-dispatcher,
		// observability) outlive the server. If we called `server.close()` or
		// the WS disposer first, `disposeApp` would still run, but background
		// handlers could observe events during shutdown against a torn-down
		// runtime. Order: domain handlers -> WS route -> HTTP server -> DB.
		// AK3: unsubscribe the bet decomposition subscriber.
		disposeBetDecomp();
		// AU19 Increment 3f: unsubscribe the capture-writeback subscriber.
		disposeCaptureWriteback();
		disposeAgentLayer();
		// @lore AU9: best-effort — store the durable "shutdown" cause on every
		// still-running correlated request BEFORE the process tears down, so a
		// later boot's recovery sweep disposes it via the reason (failed/
		// RUNTIME_LOST) instead of a generic guess. Never blocks teardown.
		void markRunningAgentSessionRequestsForShutdown(db).catch(() => { /* best-effort: shutdown marker; never blocks teardown */ });
		disposeApp(app);
		if (wsDispose) {
			wsDispose();
			wsDispose = null;
		}
		httpServer.close();
		// AF7 §1: only close the DB we own. When a test injected `deps.db`, the
		// fixture owns its lifecycle — closing it here would break the test harness.
		if (dbHandle) {
			void dbHandle.close();
		}
	};

	return { httpServer, dispose, credentialResolver };
}
