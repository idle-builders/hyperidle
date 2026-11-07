import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import { SYSTEM_ACTOR_ID } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { checkAndUnblockDependents, registerTaskLiveUpdates } from "@hyperidle/task";
import {
	createUpgradeTokenStore,
	registerSubscriptionFire,
	registerUserLiveUpdates,
	startSubscriptionClock,
	type UpgradeTokenStore,
} from "@hyperidle/user";
import { Hono } from "hono";
import type { Action, ActionContext } from "./actions/action.js";
import { createActionsRouter } from "./actions/actions-router.js";
import { buildCoreActions, runnerFor } from "./actions/compose.js";
import { createAuthRoutes } from "./routes/auth.js";
import { authHealth } from "./routes/health.js";
import { createSearchRoutes } from "./routes/search.js";
import { createStartRoutes } from "./routes/start.js";

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
	serviceBootstrap?: (ctx: {
		db: HyperIdleDb;
		eventBus: EventBus;
		/**
		 * `edit_task`'s own bound `run`, so background reactions can call it in-process.
		 */
		editTask: (
			ctx: import("./actions/action.js").ActionContext,
			input: import("@hyperidle/domain-model").EditTaskInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<import("@hyperidle/domain-model").TaskView>
		>;
		/**
		 * `send_message`'s own bound `run`, so the lifecycle-propagation reaction
		 * posts through the action instead of a raw `insertMessage`.
		 */
		sendMessage: (
			ctx: import("./actions/action.js").ActionContext,
			input: import("@hyperidle/domain-model").SendMessageInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<
				import("@hyperidle/domain-model").SendMessageOutput
			>
		>;
	}) => Array<() => void>;
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
	 * the middleware-exercising routes.
	 */
	registerExtraRoutes?: (apiRouter: Hono) => void;
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

const APP_DISPOSERS = new WeakMap<Hono, Array<() => void>>();
/** Raw action list — exposed so `boot.ts` can build `CoreApiBoot.callActionAs` without re-constructing the actions. */
const APP_ACTIONS = new WeakMap<Hono, readonly Action[]>();
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
function buildCoreActionsBindings(options: AppOptions): Parameters<typeof buildCoreActions>[0] {
	return {
		...(options.pluginsBaseDir ? { pluginsBaseDir: options.pluginsBaseDir } : {}),
		...(options.bundledPluginsDir ? { bundledPluginsDir: options.bundledPluginsDir } : {}),
		...(options.wsHub
			? {
					wsPush: (topic: string, envelope: unknown) =>
						options.wsHub?.broadcast(topic, JSON.stringify(envelope)),
				}
			: {}),
	};
}

/**
 * Registers the subscription fire mechanism
 * (the nine object events) and its schedule half, extracted out of
 * `createCoreApiApp` —
 * that function's own cognitive-complexity budget is already spent.
 * `searchTasksRun`/`searchThreadsRun`/`searchDocumentsRun` are reach's own
 * doors (already extracted in `createCoreApiApp`, never `open_*`).
 */
function registerSubscriptionServices(
	options: AppOptions,
	db: HyperIdleDb,
	eventBus: EventBus,
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
		searchTasks: runners.searchTasksRun,
		searchThreads: runners.searchThreadsRun,
		searchDocuments: runners.searchDocumentsRun,
		...(wsPush ? { wsPush } : {}),
	});
	// The schedule half — started and stopped alongside the fire mechanism.
	const subscriptionClock = startSubscriptionClock(db, wsPush ? { wsPush } : {});
	return [
		unsubSubscriptionFire,
		subscriptionClock.stop,
		...(wsPush
			? [registerTaskLiveUpdates(db, eventBus, wsPush), registerUserLiveUpdates(eventBus, wsPush)]
			: []),
	];
}

// Create core-api's route table. Every path is RELATIVE — Application mounts at /api.
// Pre-auth half of core-api's surface lives in registerCoreApiPreAuthRoutes.
function createCoreApiApp(options?: AppOptions): Promise<Hono> {
	const api = new Hono();

	const tokenStore = options?.upgradeTokenStore ?? null;

	// The /ws-token endpoint is mounted only when WS support exists.
	api.route("/auth", createAuthRoutes(tokenStore));

	// Dev routes register INTO production (legal direction) — test fixtures pass registerTestRoutes here.
	options?.registerExtraRoutes?.(api);

	// Authenticated health check — behind auth middleware
	api.route("/health", authHealth);

	// Register work endpoints if db is provided
	if (options?.db) {
		const eventBus = options.eventBus ?? new EventBus();

		// action list mounted at POST /api/actions/<name> — one loop, never a per-object route factory
		const actions: readonly Action[] = buildCoreActions(buildCoreActionsBindings(options));
		api.route("/actions", createActionsRouter(actions, { db: options.db, eventBus }));
		APP_ACTIONS.set(api, actions);
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
				readonly startedBy: string | null;
			}[]
		>(actions, "search_tasks");
		const searchThreadsRun = runnerFor<
			{ readonly ids: readonly string[] },
			readonly { readonly id: string; readonly members: readonly string[] }[]
		>(actions, "search_threads");
		// user module: search_users/open_user/edit_user under /api/actions/<name>
		api.route("/search", createSearchRoutes(options.db, eventBus, searchDocumentsRun));
		api.route("/start", createStartRoutes(options.db, eventBus, actions));
		// Plugin management: `search_plugins`/`edit_plugin`, mounted generically by
		// `createActionsRouter` above (`compose.ts`'s fourth action group).

		const db = options.db;
		const disposers: Array<() => void> = [];

		const serviceDisposers =
			options.serviceBootstrap?.({
				db,
				eventBus,
				editTask,
				sendMessage,
			}) ?? [];
		disposers.push(...serviceDisposers);

		// Auto-unblock dependent tasks when a task transitions to "done".
		const unsubDepWatcher = eventBus.on("task.changed", (event) => {
			if (event.change.after.state === "done") {
				void checkAndUnblockDependents(
					{ actor: SYSTEM_ACTOR_ID, db, eventBus, now: new Date().toISOString() },
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
		// Extracted here — this function's own cognitive-complexity budget is already spent.
		disposers.push(
			...registerSubscriptionServices(options, db, eventBus, {
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

/** Detach and return the raw action list. `undefined` when `db` was never supplied. Read exactly once, by `bootCoreApi`. */
export function takeAppActions(hono: Hono): readonly Action[] | undefined {
	const actions = APP_ACTIONS.get(hono);
	APP_ACTIONS.delete(hono);
	return actions;
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

// AppType is bare Hono — typed RPC surface is not available; honest type re-exported for the web client.
export type AppType = Hono;

export { createCoreApiApp };
