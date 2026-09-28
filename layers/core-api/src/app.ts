import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import { assembleSessionDocuments } from "@hyperidle/document";
import { EventBus } from "@hyperidle/event-bus";
import type { RegisteredTool } from "@hyperidle/harness-protocol";
import { readServerConfig } from "@hyperidle/settings";
import { checkAndUnblockDependents } from "@hyperidle/task";
import {
	createUpgradeTokenStore,
	registerSubscriptionFire,
	startSubscriptionClock,
	type UpgradeTokenStore,
} from "@hyperidle/user";
import { Hono } from "hono";
import type { Action, ActionContext } from "./actions/action.js";
import { actionsAsTools } from "./actions/actions-as-tools.js";
import { createActionsRouter } from "./actions/actions-router.js";
import { buildCoreActions, runnerFor } from "./actions/compose.js";
import { createAuthRoutes } from "./routes/auth.js";
import { authHealth } from "./routes/health.js";
import { createSearchRoutes } from "./routes/search.js";
import {
	buildSeamBackedReviewVerdictRecorder,
	buildSeamBackedWorkIntentRecorder,
} from "./services/agent-orchestration-port-composition.js";
import type { HarnessCapabilityReader } from "./services/harness-capability-reader.js";

/**
 * The minimal shape a route needs to push data onto the WS connection hub —
 * satisfied by `WsConnectionHub.broadcast(topic, data)` (`./ws-connection-hub.js`)
 * without this module depending on that package's full class (same narrow-
 * interface pattern as `session-activity-gateway.ts`'s `SessionActivityBroadcastTarget`).
 */
export interface WsPushTarget {
	broadcast(topic: string, data: string): void;
}

interface AppOptions {
	db?: HyperIdleDb;
	eventBus?: EventBus;
	/**
	 * The seam's ONE port for this composition, built by the caller
	 * (`buildAgentOrchestrationPort(transport)`) and handed in as a value —
	 * there is no ambient/module-level transport to fall back on. Required
	 * whenever `db` is provided: every route and reaction routes through this door. `createCoreApiApp` throws a named error at
	 * construction if `db` is present and this is not.
	 */
	agentOrchestration?: AgentOrchestrationPort;
	serviceBootstrap?: (ctx: {
		db: HyperIdleDb;
		eventBus: EventBus;
		agentOrchestration: AgentOrchestrationPort;
		/**
		 * `edit_task`'s own bound `run`, so a background writer
		 * (`registerWorkSessionStartedReactions`) can call it in-process instead
		 * of the deleted `transitionTask`.
		 */
		editTask: (
			ctx: import("./actions/action.js").ActionContext,
			input: import("@hyperidle/domain-model").EditTaskInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<import("@hyperidle/domain-model").TaskView>
		>;
		/**
		 * `send_message`'s own bound `run`, so the relocated never-silent-net
		 * reaction (`session-not-returned-notice.ts`) posts through the action
		 * instead of a raw `insertMessage`.
		 */
		sendMessage: (
			ctx: import("./actions/action.js").ActionContext,
			input: import("@hyperidle/domain-model").SendMessageInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<
				import("@hyperidle/domain-model").SendMessageOutput
			>
		>;
		/**
		 * `edit_user`'s own bound `run` — the crashed-session
		 * health reaction writes the agent's `health` through it instead of a
		 * notification-queue row.
		 */
		editUser: (
			ctx: import("./actions/action.js").ActionContext,
			input: import("@hyperidle/domain-model").EditUserInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<import("@hyperidle/domain-model").UserView>
		>;
	}) => Array<() => void>;
	/**
	/**
	 * Optional WebSocket registration hook. When provided,
	 * `createApp` invokes it with the `/api` sub-router just after the
	 * error handler and public `/api/health` route and BEFORE the
	 * `authMiddleware` catch-all so the WS route can authenticate via
	 * query token. Kept optional so integration tests that do not need
	 * WebSocket support can omit it.
	 */
	registerWebSocket?: (apiRouter: Hono, tokenStore: UpgradeTokenStore) => void;
	/**
	 * Optional hook letting a caller mount extra routes on the `/api`
	 * sub-router. The only caller is the development test fixture, which mounts
	 * the middleware-exercising routes that used to be statically imported here.
	 */
	registerExtraRoutes?: (apiRouter: Hono) => void;
	/**
	 * Awaited inside POST /api/harnesses/redetect ALONGSIDE the
	 * harness discovery refresh, BEFORE the response returns — the inherited
	 * reach re-probe rides the same rate-limited moment (1 req/5s) with
	 * identical observable effect. The Application
	 * wires the orchestration Layer's `inheritedReach.refresh` here; absent
	 * (kernel-only) the redetect refreshes harness discoveries only.
	 */
	onHarnessRedetect?: () => Promise<void>;
	/**
	 * The WS connection hub's
	 * broadcast-only surface. `send_message`/`adjust_thread` push the
	 * `changes` row itself, once per row, on both topics — `wsPush` on
	 * `buildCoreActions`'s bindings wraps this same hub. Optional so
	 * integration tests that don't need WS pushes can omit it (actions still
	 * emit their EventBus events unchanged either way).
	 */
	wsHub?: WsPushTarget;
	/**
	 * Override the upgrade-token store used by `/api/auth/ws-token` and the
	 * WebSocket auth middleware. Tests inject a custom store with a tiny
	 * TTL; production wiring uses `createUpgradeTokenStore()`.
	 */
	upgradeTokenStore?: UpgradeTokenStore;
	/**
	 * Adapter pool for running agent sessions — read-only capability probe
	 * (which harnesses are registered/discovered), used only to gate route
	 * mounting and answer descriptor reads (`agents.ts`, `teams-routes.ts`,
	 * `users.ts`, `workers.ts`, `harnesses.ts`).
	 * @lore: HarnessCapabilityReader not AdapterPool — this layer only reads capability descriptors, never provisions sessions
	 */
	adapterPool?: HarnessCapabilityReader;
	/**
	 * Enable shared-mode authentication (S1). When true, the auth middleware
	 * accepts Bearer tokens from LoginSessions in addition to X-API-Key.
	 * Also mounts the public /api/auth/claim endpoint (pre-auth).
	 *
	 * Defaults to false (local mode — unchanged X-API-Key behavior).
	 */
	sharedMode?: boolean;
	/**
	 * Application-injected cross-Layer
	 * `agent_work_intents` recorder (`@hyperidle/work-intent-port`-typed,
	 * Mechanism C) — `routes/threads.ts` must not cross by importing
	 * `@hyperidle/session-requests` directly. Defaults to the seam-backed
	 * recorder built over `agentOrchestration` (`buildSeamBackedWorkIntentRecorder`);
	 * tests may override for isolation.
	 */
	agentWorkIntentRecorder?: import("@hyperidle/domain-model").AgentWorkIntentRecorderFn;
	// Application-injected verdict recorder; tests may override. Injected because routes/threads.ts may not read agent-orchestration.
	reviewVerdictRecorder?: import("@hyperidle/domain-model").ReviewVerdictRecorderFn;
	/**
	 * Base directory where plugin files are persisted on install.
	 * When provided, `installPlugin` copies the plugin source to
	 * `{pluginsBaseDir}/{pluginId}/` and stores the path in `plugins.install_path`.
	 * Required for skill restore to work (restore reads from install_path on disk).
	 * Absent → plugin files are not persisted; install_path will be null; skills
	 * are still materialised as documents but cannot be restored from source.
	 * Production wiring passes the platform config dir; tests pass a temp dir.
	 */
	pluginsBaseDir?: string;
	/**
	 * The plugins that ship inside the app, one folder each (the desktop build
	 * copies the repo's `plugins/` beside its migrations). `search_plugins` lists
	 * the ones a viewer's team has not installed as available; `edit_plugin`
	 * installs one by name. Never `pluginsBaseDir`. Absent → no available rows.
	 */
	bundledPluginsDir?: string;
}

// @lore: WeakMap keyed by Hono instance keeps disposers off the public surface; GC'd with the app
const APP_DISPOSERS = new WeakMap<Hono, Array<() => void>>();
// @lore: tool projection keyed off Hono instance; bootCoreApi reads it once; MCP registry and tool provider share the same composed list
const APP_ACTION_TOOLS = new WeakMap<Hono, ReadonlyArray<RegisteredTool<HyperIdleDb>>>();
// @lore: raw runners (not MCP-wrapped) for boot.ts to build CoreApiBoot document ports; separate WeakMap — tool and raw runner are different things
const APP_DOCUMENT_RUNNERS = new WeakMap<
	Hono,
	{
		readonly editDocument: (
			ctx: ActionContext,
			input: import("@hyperidle/domain-model").EditDocumentInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<import("@hyperidle/domain-model").DocumentView>
		>;
		readonly searchDocuments: (
			ctx: ActionContext,
			input: import("@hyperidle/domain-model").SearchDocumentsInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<
				import("@hyperidle/domain-model").DocumentRow[]
			>
		>;
	}
>();
const appLogger = createLogger({ pkg: "server.app" });

// Token store resolved by the caller (not createCoreApiApp) — same instance needed on both sides of auth middleware.
export function resolveUpgradeTokenStore(options?: AppOptions): UpgradeTokenStore | null {
	if (options?.upgradeTokenStore) return options.upgradeTokenStore;
	return options?.registerWebSocket ? createUpgradeTokenStore() : null;
}

// Register core-api's PRE-auth routes. Must sit before the auth middleware (registration order is the only gate).
export function registerCoreApiPreAuthRoutes(
	api: Hono,
	options: AppOptions | undefined,
	tokenStore: UpgradeTokenStore | null,
): void {
	// Public: /api/health (no auth required)
	api.get("/health", (c) => {
		const response = {
			status: "ok" as const,
			timestamp: new Date().toISOString(),
		};
		return c.json(response);
	});

	// WS upgrades authenticate via a one-shot upgrade token (`?token=...`) in a
	// middleware defined inside `registerWsRoute`, not via the API key.
	if (options?.registerWebSocket && tokenStore) {
		options.registerWebSocket(api, tokenStore);
	}
}

/**
 * `buildCoreActions`'s bindings, assembled once here rather than inline in
 * `createCoreApiApp` — that function's own cognitive-complexity budget is
 * already spent, and the optional pass-throughs (`pluginsBaseDir`,
 * `bundledPluginsDir`, `wsHub`) are a flat, ungated read of `options`, nothing this function
 * needs any of `createCoreApiApp`'s own state to compute.
 */
function buildCoreActionsBindings(
	options: AppOptions,
	agentOrchestration: AgentOrchestrationPort,
	agentWorkIntentRecorder: import("@hyperidle/domain-model").AgentWorkIntentRecorderFn,
	reviewVerdictRecorder: import("@hyperidle/domain-model").ReviewVerdictRecorderFn,
): Parameters<typeof buildCoreActions>[0] {
	return {
		agentOrchestration,
		agentWorkIntentRecorder,
		reviewVerdictRecorder,
		...(options.pluginsBaseDir ? { pluginsBaseDir: options.pluginsBaseDir } : {}),
		...(options.bundledPluginsDir ? { bundledPluginsDir: options.bundledPluginsDir } : {}),
		...(options.wsHub
			? {
					wsPush: (topic: string, envelope: unknown) =>
						options.wsHub?.broadcast(topic, JSON.stringify(envelope)),
				}
			: {}),
		...(options.adapterPool ? { adapterPool: options.adapterPool } : {}),
		...(options.onHarnessRedetect ? { onHarnessRedetect: options.onHarnessRedetect } : {}),
	};
}

/**
 * Registers the subscription fire mechanism
 * (the nine object events) and its schedule half, extracted out of
 * `createCoreApiApp` for the same reason `buildCoreActionsBindings` was —
 * that function's own cognitive-complexity budget is already spent.
 * `searchTasksRun`/`searchThreadsRun`/`searchDocumentsRun` are reach's own
 * doors (already extracted in `createCoreApiApp`, never `open_*`);
 * `assembleSessionDocuments`/`readServerConfig` are this Layer's own
 * (never a nested Service's) imports, exactly like
 * `task-run-resolver-bindings.ts`'s equivalent wiring.
 */
function registerSubscriptionServices(
	options: AppOptions,
	db: HyperIdleDb,
	eventBus: EventBus,
	agentWorkIntentRecorder: import("@hyperidle/domain-model").AgentWorkIntentRecorderFn,
	runners: {
		readonly searchTasksRun: import("@hyperidle/user").SearchTasksReachFn;
		readonly searchThreadsRun: import("@hyperidle/user").SearchThreadsReachFn;
		readonly searchDocumentsRun: import("./actions/action.js").SearchDocumentsRunFn;
	},
): Array<() => void> {
	const wsPush = options.wsHub
		? (topic: string, envelope: unknown) =>
				options.wsHub?.broadcast(topic, JSON.stringify(envelope))
		: undefined;
	const unsubSubscriptionFire = registerSubscriptionFire(db, eventBus, {
		agentWorkIntentRecorder,
		searchTasks: runners.searchTasksRun,
		searchThreads: runners.searchThreadsRun,
		searchDocuments: runners.searchDocumentsRun,
		assembleSessionDocuments,
		readServerConfig: (readDb) => readServerConfig(readDb),
		...(wsPush ? { wsPush } : {}),
	});
	// The schedule half — started and stopped alongside the fire
	// mechanism, needing the SAME composed runners `registerAgentLayerServices`
	// never had (its own composition root is deliberately built without them).
	const subscriptionClock = startSubscriptionClock(db, eventBus, {
		agentWorkIntentRecorder,
		searchDocuments: runners.searchDocumentsRun,
		assembleSessionDocuments,
		readServerConfig: (readDb) => readServerConfig(readDb),
	});
	return [unsubSubscriptionFire, subscriptionClock.stop];
}

// Create core-api's route table. Every path is RELATIVE — Application mounts at /api.
// Pre-auth half of core-api's surface lives in registerCoreApiPreAuthRoutes.
function createCoreApiApp(options?: AppOptions): Promise<Hono> {
	const api = new Hono();

	// shared mode — read from options (test-injectable) or env var (production), once at construction time.
	const sharedMode = options?.sharedMode ?? process.env.HYPERIDLE_SHARED_MODE === "true";
	const tokenStore = options?.upgradeTokenStore ?? null;

	// The /ws-token endpoint is mounted only when WS support exists; sharedMode
	// binds its identity to the authenticated caller rather than the
	// X-Identity header. The worker-token endpoint is always mounted.
	api.route("/auth", createAuthRoutes(tokenStore, sharedMode));

	// Dev routes register INTO production (legal direction) — test fixtures pass registerTestRoutes here.
	options?.registerExtraRoutes?.(api);

	// Authenticated health check — behind auth middleware
	api.route("/health", authHealth);

	// Register work endpoints if db is provided
	if (options?.db) {
		const eventBus = options.eventBus ?? new EventBus();
		// The seam's one port for this composition — a required
		// value, never an ambient global. `createTestApp`/`create-server.ts`
		// build it before calling `createCoreApiApp`.
		const agentOrchestration = options.agentOrchestration;
		if (!agentOrchestration) {
			throw new Error(
				"AppOptions.agentOrchestration is required when db is provided — build one with " +
					"buildAgentOrchestrationPort(transport) and pass it explicitly (AU31 §3.2: no ambient transport).",
			);
		}
		const defaultAgentWorkIntentRecorder = buildSeamBackedWorkIntentRecorder(agentOrchestration);
		const defaultGateVerdictRecorder = buildSeamBackedReviewVerdictRecorder(agentOrchestration);
		const agentWorkIntentRecorder =
			options.agentWorkIntentRecorder ?? defaultAgentWorkIntentRecorder;
		const reviewVerdictRecorder = options.reviewVerdictRecorder ?? defaultGateVerdictRecorder;

		// action list mounted at POST /api/actions/<name> — one loop, never a per-object route factory
		const actions: readonly Action[] = buildCoreActions(
			buildCoreActionsBindings(
				options,
				agentOrchestration,
				agentWorkIntentRecorder,
				reviewVerdictRecorder,
			),
		);
		api.route("/actions", createActionsRouter(actions, { db: options.db, eventBus }));
		APP_ACTION_TOOLS.set(api, actionsAsTools(actions));
		const editTaskAction = actions.find((a) => a.declaration.name === "edit_task");
		if (!editTaskAction) {
			throw new Error("buildCoreActions did not produce an edit_task action");
		}
		const editTask = editTaskAction.run as (
			ctx: ActionContext,
			input: import("@hyperidle/domain-model").EditTaskInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<import("@hyperidle/domain-model").TaskView>
		>;
		const sendMessageAction = actions.find((a) => a.declaration.name === "send_message");
		if (!sendMessageAction) {
			throw new Error("buildCoreActions did not produce a send_message action");
		}
		const sendMessage = sendMessageAction.run as (
			ctx: ActionContext,
			input: import("@hyperidle/domain-model").SendMessageInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<
				import("@hyperidle/domain-model").SendMessageOutput
			>
		>;
		// search_documents extracted same way as sendMessage — a search result is not a read
		const searchDocumentsAction = actions.find((a) => a.declaration.name === "search_documents");
		if (!searchDocumentsAction) {
			throw new Error("buildCoreActions did not produce a search_documents action");
		}
		const searchDocumentsRun = searchDocumentsAction.run as (
			ctx: ActionContext,
			input: import("@hyperidle/domain-model").SearchDocumentsInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<
				import("@hyperidle/domain-model").DocumentRow[]
			>
		>;
		// Subscription reach — extracted the same
		// way `searchDocumentsRun` is, never `open_task`/`open_thread` (a
		// subscriber's reach must never count as a read). `runnerFor` throws
		// its own "no such action" error, so this adds no branch here.
		const searchTasksRun = runnerFor<
			{ readonly ids: readonly string[] },
			readonly {
				readonly id: string;
				readonly teamId: string;
				readonly ownerAgentId: string | null;
			}[]
		>(actions, "search_tasks");
		const searchThreadsRun = runnerFor<
			{ readonly ids: readonly string[] },
			readonly { readonly id: string }[]
		>(actions, "search_threads");
		// edit_plugin writes documents through edit_document action — never document repository functions directly
		const editDocumentAction = actions.find((a) => a.declaration.name === "edit_document");
		if (!editDocumentAction) {
			throw new Error("buildCoreActions did not produce an edit_document action");
		}
		const editDocumentRun = editDocumentAction.run as (
			ctx: ActionContext,
			input: import("@hyperidle/domain-model").EditDocumentInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<import("@hyperidle/domain-model").DocumentView>
		>;
		// raw runners (not MCP-wrapped) for boot.ts to build CoreApiBoot document ports
		APP_DOCUMENT_RUNNERS.set(api, {
			editDocument: editDocumentRun,
			searchDocuments: searchDocumentsRun,
		});
		// health reaction writes through edit_user action — lands as user.changed row, same as any edit
		const editUserRun = runnerFor<
			import("@hyperidle/domain-model").EditUserInput,
			import("@hyperidle/domain-model").UserView
		>(actions, "edit_user");
		// user is one module now — search_users/open_user/edit_user under /api/actions/<name>
		api.route("/search", createSearchRoutes(options.db, eventBus, searchDocumentsRun));
		// Plugin management is the platform module now —
		// `search_plugins`/`edit_plugin`, mounted generically by
		// `createActionsRouter` above (`compose.ts`'s fourth action group).
		// `routes/plugins.ts` and its six routes are deleted.
		// /notifications deleted — inbox is open_user({}).inbox now

		const db = options.db;
		const disposers: Array<() => void> = [];

		const serviceDisposers =
			options.serviceBootstrap?.({
				db,
				eventBus,
				agentOrchestration,
				editTask,
				sendMessage,
				editUser: editUserRun,
			}) ?? [];
		disposers.push(...serviceDisposers);

		// Auto-unblock dependent tasks when a task transitions to "done".
		const unsubDepWatcher = eventBus.on("task.changed", (event) => {
			if (event.change.after.state === "done") {
				void checkAndUnblockDependents(
					{ actor: "system:propagation", db, eventBus, now: new Date().toISOString() },
					event.change.objectId,
					editTask,
				).catch((err) => {
					appLogger.error("[dep-watcher] unblock failed for task", {
						taskId: event.change.objectId,
						error: err instanceof Error ? err.message : String(err),
					});
				});
			}
			// @lore: NOT subscribed for killed — cascadeTaskKill calls handleDependencyKilled itself to avoid racing its own synchronous loop
		});
		disposers.push(unsubDepWatcher);

		// The subscription fire mechanism and its
		// schedule half, registered beside the dependency watcher above.
		// Extracted the same way `buildCoreActionsBindings` was — this
		// function's own cognitive-complexity budget is already spent.
		disposers.push(
			...registerSubscriptionServices(options, db, eventBus, agentWorkIntentRecorder, {
				searchTasksRun,
				searchThreadsRun,
				searchDocumentsRun,
			}),
		);

		APP_DISPOSERS.set(api, disposers);
	}

	return Promise.resolve(api);
}

// Attach extra disposers so a single disposeApp(root) tears the whole composition down.
export function registerAppDisposers(hono: Hono, disposers: ReadonlyArray<() => void>): void {
	const bag = APP_DISPOSERS.get(hono) ?? [];
	bag.push(...disposers);
	APP_DISPOSERS.set(hono, bag);
}

// Detach and return the disposer bag — ownership moves to the root, so every disposer runs exactly once.
export function takeAppDisposers(hono: Hono): Array<() => void> {
	const bag = APP_DISPOSERS.get(hono) ?? [];
	APP_DISPOSERS.delete(hono);
	return bag;
}

// Detach and return the composed action list's tool projection. Undefined when db was not supplied.
export function takeAppActionTools(
	hono: Hono,
): ReadonlyArray<RegisteredTool<HyperIdleDb>> | undefined {
	const tools = APP_ACTION_TOOLS.get(hono);
	APP_ACTION_TOOLS.delete(hono);
	return tools;
}

// Detach and return the raw edit_document/search_documents runners. Undefined when db was not supplied.
export function takeAppDocumentRunners(hono: Hono): ReturnType<typeof APP_DOCUMENT_RUNNERS.get> {
	const runners = APP_DOCUMENT_RUNNERS.get(hono);
	APP_DOCUMENT_RUNNERS.delete(hono);
	return runners;
}

/**
 * Dispose all event-bus subscriptions attached to an app created via
 * `createApp`. Safe no-op if `createApp` did not attach any (e.g. when
 * called without a `db`). A disposer that throws is logged and the
 * remaining disposers still run — individual handler cleanup failures
 * must not leak subscriptions.
 */
export function disposeApp(hono: Hono): void {
	const bag = APP_DISPOSERS.get(hono);
	if (!bag) return;
	for (const d of bag) {
		try {
			d();
		} catch (err) {
			// @lore: dispose is best-effort; tolerated failure is a double teardown on an already-unsubscribed handler; keep iterating to avoid leaking subscriptions
			appLogger.error("disposeApp: disposer threw", {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
	bag.length = 0;
	APP_DISPOSERS.delete(hono);
}

export type { AppOptions };

// AppType is bare Hono — typed RPC surface was lost when routes moved to untyped app.route(); honest type re-exported for the web client.
export type AppType = Hono;

export { createCoreApiApp };
