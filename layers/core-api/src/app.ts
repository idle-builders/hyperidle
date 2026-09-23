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
	 * AU31 §3.2 — the seam's ONE port for this composition, built by the caller
	 * (`buildAgentOrchestrationPort(transport)`) and handed in as a value —
	 * there is no ambient/module-level transport to fall back on. Required
	 * whenever `db` is provided: every route and reaction that used to reach
	 * `@hyperidle/session-requests`/`@hyperidle/run-orchestration`/
	 * `@hyperidle/run-orchestration`/`@hyperidle/filesystems` directly now goes
	 * through this door. `createCoreApiApp` throws a named error at
	 * construction if `db` is present and this is not.
	 */
	agentOrchestration?: AgentOrchestrationPort;
	/**
	 * @lore AU44 batch 4: readAlertPreferences removed from ctx — the dispatcher
	 * that consumed it is deleted. serviceBootstrap ctx now only carries the 3
	 * primitives the agent layer and agent orchestration need.
	 */
	serviceBootstrap?: (ctx: {
		db: HyperIdleDb;
		eventBus: EventBus;
		agentOrchestration: AgentOrchestrationPort;
		/**
		 * `edit_task`'s own bound `run`, so a background writer
		 * (`registerWorkSessionStartedReactions`) can call it in-process instead
		 * of the deleted `transitionTask`. the architecture doc §6.
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
		 * `adjust_thread`'s own bound `run`, so the stalled-knowledge-action
		 * reaction can resolve-or-create the document's thread.
		 */
		adjustThread: (
			ctx: import("./actions/action.js").ActionContext,
			input: import("@hyperidle/domain-model").AdjustThreadInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<import("@hyperidle/domain-model").ThreadView>
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
	 *
	 * @lore I1 S1-S5: production `createServer` passes this hook so the
	 * same `createApp` instance powers both production and the integration
	 * test harness — no divergent "minimal app" path.
	 */
	registerWebSocket?: (apiRouter: Hono, tokenStore: UpgradeTokenStore) => void;
	/**
	 * AU28: optional hook letting a caller mount extra routes on the `/api`
	 * sub-router. The only caller is the development test fixture, which mounts
	 * the middleware-exercising routes that used to be statically imported here.
	 */
	registerExtraRoutes?: (apiRouter: Hono) => void;
	/**
	 * AU36 D5: awaited inside POST /api/harnesses/redetect ALONGSIDE the
	 * harness discovery refresh, BEFORE the response returns — the inherited
	 * reach re-probe rides the same rate-limited moment (1 req/5s) with
	 * identical observable effect to the pre-AU36 wiring. The Application
	 * wires the orchestration Layer's `inheritedReach.refresh` here; absent
	 * (kernel-only) the redetect refreshes harness discoveries only.
	 */
	onHarnessRedetect?: () => Promise<void>;
	/**
	 * AU21 §6 Decision L4 / §9 Increment 14d: the WS connection hub's
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
	 *
	 * @lore AU31 §2.4/[P4]: typed against `@hyperidle/harness-protocol`'s
	 * `HarnessCapabilityReader` rather than `@hyperidle/harness-registry`'s
	 * `AdapterPool` — this route layer never provisions or executes a session
	 * (that is `run-orchestration-composition.ts`'s job, agent-orchestration
	 * wiring), it only reads capability descriptors, so the narrower shared
	 * type is both sufficient and the one every consuming route factory
	 * already declares its own parameter as. `workspaceAdapter`/
	 * `sandboxBasePath`/`mcpBridgeRegistry`/`mcpBaseUrl`/`mounter` were
	 * forward-only threading with zero readers anywhere in this file (every
	 * real consumer resolved them via a separately-built `dispatcherDeps`
	 * bundle in `create-server.ts` instead — `service-bootstrap.ts`'s
	 * `canProvision: boolean` already carries the one bit those five fields
	 * existed to signal) — deleted rather than retyped.
	 * @lore S2: renamed from harnessAdapter to adapterPool.
	 */
	adapterPool?: HarnessCapabilityReader;
	/**
	 * Enable shared-mode authentication (S1). When true, the auth middleware
	 * accepts Bearer tokens from LoginSessions in addition to X-API-Key.
	 * Also mounts the public /api/auth/claim endpoint (pre-auth).
	 *
	 * Defaults to false (local mode — unchanged X-API-Key behavior).
	 *
	 * @lore S1: Derived from HYPERIDLE_SHARED_MODE env var at app construction
	 * time in production. Tests pass this directly to control the mode without
	 * setting environment variables.
	 */
	sharedMode?: boolean;
	/**
	 * AU19 §11 (AC-9) / AU31 §3.2: Application-injected cross-Layer
	 * `agent_work_intents` recorder (`@hyperidle/work-intent-port`-typed,
	 * Mechanism C) — `routes/threads.ts` must not cross by importing
	 * `@hyperidle/session-requests` directly. Defaults to the seam-backed
	 * recorder built over `agentOrchestration` (`buildSeamBackedWorkIntentRecorder`);
	 * tests may override for isolation.
	 */
	agentWorkIntentRecorder?: import("@hyperidle/domain-model").AgentWorkIntentRecorderFn;
	/**
	 * @lore BA2: Application-injected verdict recorder for the review loop, injected for
	 * the same reason as `agentWorkIntentRecorder` above — `review_sessions` belongs
	 * to agent-orchestration and `routes/threads.ts` may not read it. Defaults to
	 * the seam-backed recorder; tests may override.
	 */
	reviewVerdictRecorder?: import("@hyperidle/domain-model").ReviewVerdictRecorderFn;
	/**
	 * BA9d D12: base directory where plugin files are persisted on install.
	 * When provided, `installPlugin` copies the plugin source to
	 * `{pluginsBaseDir}/{pluginId}/` and stores the path in `plugins.install_path`.
	 * Required for skill restore to work (restore reads from install_path on disk).
	 * Absent → plugin files are not persisted; install_path will be null; skills
	 * are still materialised as documents but cannot be restored from source.
	 * Production wiring passes the platform config dir; tests pass a temp dir.
	 */
	pluginsBaseDir?: string;
}

/**
 * @lore Event-bus disposers live alongside the app instance but must not
 * appear on the public Hono surface. A module-scoped WeakMap keyed by
 * the Hono instance keeps the association without string-cast stash
 * patterns — disposers are garbage-collected with the app.
 */
const APP_DISPOSERS = new WeakMap<Hono, Array<() => void>>();
/**
 * §7 — the composed action list's tool projection, keyed the same way
 * disposers are: it must not appear on the public Hono surface, and
 * `bootCoreApi` (`boot.ts`) reads it exactly once to grow `CoreApiBoot`'s
 * `actionTools` field, which `create-server.ts` threads into
 * `bootAgentOrchestration` so the MCP registry and the tool provider see the
 * SAME composed list (architecture.md §7's "one composed list, built once").
 */
const APP_ACTION_TOOLS = new WeakMap<Hono, ReadonlyArray<RegisteredTool<HyperIdleDb>>>();
/**
 * @lore document-module B15: `boot.ts` needs the RAW `edit_document`/
 * `search_documents` runners (not `actionsAsTools`' MCP-wrapped projection)
 * to build `CoreApiBoot.editDocument`/`searchDocuments` — the two values
 * architecture.md §8.4 threads into the writeback processor exactly like
 * `actionTools`. Same take-once-by-app-instance idiom as `APP_ACTION_TOOLS`,
 * kept as a second WeakMap rather than widening that one's value shape,
 * since a tool registration and a raw action runner are different things
 * with different consumers.
 */
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

/**
 * Resolve the one-shot WebSocket upgrade-token store this app instance uses.
 *
 * I2 review arch H-2/H-3: the store — and with it `/api/auth/ws-token` — exists
 * ONLY when WS support is being wired. Apps without a `registerWebSocket` hook
 * (integration tests that do not need WebSocket) never expose the mint route.
 *
 * @lore AU26 B1b: the store is now resolved by the Application (`bootCoreApi`)
 * rather than inside `createCoreApiApp`, because the SAME instance is needed on
 * both sides of the auth middleware — the pre-auth WS upgrade route consumes
 * tokens, the post-auth `/auth/ws-token` route mints them.
 */
export function resolveUpgradeTokenStore(options?: AppOptions): UpgradeTokenStore | null {
	if (options?.upgradeTokenStore) return options.upgradeTokenStore;
	return options?.registerWebSocket ? createUpgradeTokenStore() : null;
}

/**
 * Register `core-api`'s own PRE-auth routes on the Application's `/api` router.
 *
 * These four must sit in front of the auth middleware, and only registration
 * order puts them there — `createAuthMiddleware` has no path allow-list. The
 * Application calls this after `use()`ing cors/rate-limit/body-limit and before
 * `use()`ing auth (§D-B).
 *
 * @lore AU26 B1b: `GET /api/health` is registered here rather than before the
 * rate limiter (its previous position). The limiter's `skipPaths` already
 * exempts `/api/health`, so the liveness probe is unaffected — but the setup
 * and claim routes now also sit behind the body limit, which is strictly
 * tighter than before and costs nothing (both post a few hundred bytes).
 */
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

	// @lore BC5 T11 (architecture.md §7): the pre-auth `POST /api/users`
	// setup route is DELETED — `edit_user`'s own first-run rule (a caller
	// with no `users` row may create a person only while no person exists)
	// is strictly tighter, behind the auth middleware instead of in front of
	// it.

	// WS upgrades authenticate via a one-shot upgrade token (`?token=...`) in a
	// middleware defined inside `registerWsRoute`, not via the API key.
	if (options?.registerWebSocket && tokenStore) {
		options.registerWebSocket(api, tokenStore);
	}
}

/**
 * `buildCoreActions`'s bindings, assembled once here rather than inline in
 * `createCoreApiApp` — that function's own cognitive-complexity budget is
 * already spent, and the two optional pass-throughs (`pluginsBaseDir`,
 * `wsHub`) are a flat, ungated read of `options`, nothing this function
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

/**
 * Create `core-api`'s own route table — the Layer's HTTP surface and nothing
 * else. The returned app is mounted by the Application at `/` on its `/api`
 * router, AFTER the middleware stack, beside `bootAgentOrchestration().app`.
 *
 * @lore AU26 B1b: this used to be the whole application — it built the root
 * `Hono`, the `/api` sub-router, the cors/rate-limit/body-limit/auth/fail-closed
 * stack, the `onError`/`notFound` handlers, and it mounted the other Layer. All
 * of that is the **Application's** now (`applications/remote-server/src/create-server.ts`
 * in production, `test-utils.ts`'s `createTestApp` for a test harness): "only an
 * Application may choose to put another Layer's routes behind this stack."
 * What is left here is one Layer's routes.
 *
 * Two consequences a caller must know:
 *   - every path this app registers is RELATIVE (`/bets`, not `/api/bets`);
 *   - the pre-auth half of core-api's surface lives in
 *     `registerCoreApiPreAuthRoutes`, not here.
 */
async function createCoreApiApp(options?: AppOptions): Promise<Hono> {
	const api = new Hono();

	// S1: shared mode — read from options (test-injectable) or env var (production).
	// @lore S1: The env var is read once at app construction time, not per-request.
	const sharedMode = options?.sharedMode ?? process.env.HYPERIDLE_SHARED_MODE === "true";
	const tokenStore = options?.upgradeTokenStore ?? null;

	// M3 A4: /api/auth/me is always mounted (regardless of tokenStore).
	// The /ws-token endpoint is conditionally mounted only when WS support exists.
	// @lore S1: createAuthRoutes takes sharedMode to conditionally mount
	// /invite and /logout (shared mode only) and to bind ws-token identity
	// from auth context rather than X-Identity header.
	// @lore S4: worker-token endpoint requires auth routes even without db or
	// tokenStore — createAuthRoutes handles null db gracefully.
	api.route("/auth", createAuthRoutes(options?.db ?? null, tokenStore, sharedMode));

	// @lore AU28 Ruling 8.1: this used to be a static
	// `import { registerTestRoutes } from "./routes/test-routes.js"` plus a
	// `NODE_ENV !== "production"` guard — production code importing a development
	// module and relying on an env check to stay out of the shipped path. Inverted:
	// the development world now registers INTO production, which is the legal
	// direction. `src/__testing__/test-fixtures.ts` passes `registerTestRoutes`.
	options?.registerExtraRoutes?.(api);

	// P3: Authenticated health check — behind auth middleware
	api.route("/health", authHealth);

	// Register work endpoints if db is provided
	if (options?.db) {
		const eventBus = options.eventBus ?? new EventBus();
		// AU31 §3.2: the seam's one port for this composition — a required
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

		// the action list. `search_tasks`/`open_task`/`edit_task` mount at
		// `POST /api/actions/<name>` — one loop over the composed list, never a
		// per-object route factory. the architecture doc §7.
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
		const adjustThreadAction = actions.find((a) => a.declaration.name === "adjust_thread");
		if (!adjustThreadAction) {
			throw new Error("buildCoreActions did not produce an adjust_thread action");
		}
		const adjustThreadRun = adjustThreadAction.run as (
			ctx: ActionContext,
			input: import("@hyperidle/domain-model").AdjustThreadInput,
		) => Promise<
			import("@hyperidle/domain-model").ActionResult<import("@hyperidle/domain-model").ThreadView>
		>;
		// @lore `/search`'s scope=document branch and its own document category
		// (architecture.md §8.3) go through the composed `search_documents`
		// action, extracted the same way `sendMessage`/`adjustThreadRun` are —
		// never `open_document` (a search result is not a read).
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
		// @lore document-module B10: the platform module's install/enable/
		// disable/restore lifecycle (`edit_plugin`, bound in `compose.ts`'s
		// fourth action group) writes documents through this same composed
		// `edit_document` action — never `@hyperidle/document`'s repository
		// functions directly.
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
		// @lore document-module B15: the SAME two runners, captured raw (not
		// MCP-tool-wrapped) for `boot.ts` to build `CoreApiBoot.editDocument`/
		// `searchDocuments` off — the writeback processor's document port
		// (architecture.md §8.4).
		APP_DOCUMENT_RUNNERS.set(api, {
			editDocument: editDocumentRun,
			searchDocuments: searchDocumentsRun,
		});
		// @lore BC5 T7b (F1): the crashed-session health reaction writes the
		// agent's `health` through the composed `edit_user` action — never
		// `@hyperidle/user`'s store functions directly — so the write lands as
		// an ordinary `user.changed` row, same as any other edit.
		const editUserRun = runnerFor<
			import("@hyperidle/domain-model").EditUserInput,
			import("@hyperidle/domain-model").UserView
		>(actions, "edit_user");
		// @lore BC5 T11: the `agents`/`org`/`teams`/`recipients`/`harnesses`
		// route families and the core-hosted `filesystems` injection route are
		// all DELETED — user is one module now, `search_users`/`open_user`/
		// `edit_user` under `POST /api/actions/<name>` (mounted generically by
		// `createActionsRouter` above), never a route module. `agentIdentity`
		// (the shared helper those routes reduced an agent's identity document
		// creation to) goes with them — `@hyperidle/user`'s own
		// `agent-identity.ts` builds the same port internally now, per call,
		// for `edit_user`'s own identity-document write.
		// @lore BC3 architecture.md §5 B1: `/reviews`, `/conversations`, `/threads`
		// and their route files are DELETED — search_threads/open_thread/
		// send_message/adjust_thread are the door now, mounted generically by
		// createActionsRouter above.
		// AU26 E4: `/api/connections` was served by `agent-orchestration`'s own
		// app; that route family is deleted too — connections are a
		// user attribute now, behind `open_user`/`edit_user`.
		api.route("/search", createSearchRoutes(options.db, eventBus, searchDocumentsRun));
		// @lore BC5 T11: `/settings/agent-behavior` is deleted — behaviour is a
		// user attribute now, behind `open_user`/`edit_user`.
		// Plugin management is the platform module now —
		// `search_plugins`/`edit_plugin`, mounted generically by
		// `createActionsRouter` above (`compose.ts`'s fourth action group).
		// `routes/plugins.ts` and its six routes are deleted.
		// @lore BC5 T7b: `/notifications` is deleted with the notification
		// queue — a person's inbox is `open_user({}).inbox` now.

		const db = options.db;
		const disposers: Array<() => void> = [];

		const serviceDisposers =
			options.serviceBootstrap?.({
				db,
				eventBus,
				agentOrchestration,
				editTask,
				sendMessage,
				adjustThread: adjustThreadRun,
				editUser: editUserRun,
			}) ?? [];
		disposers.push(...serviceDisposers);

		// AD5 AC-2: Auto-unblock dependent tasks when a task transitions to "done".
		// @lore AD5 option-A: handler lives in app.ts (server layer) — fabric cannot
		// import from server (layer violation). checkAndUnblockDependents relocated
		// to `@hyperidle/task` (renamed from `@hyperidle/work`) — it
		// exclusively calls task's own table paths, so `task` is its correct
		// home. §6 row 2: it now writes through `edit_task` instead of the
		// deleted `transitionTask`, injected as a plain function (Mechanism C).
		// architecture.md §3: `task_state_changed` is gone from this path —
		// `task.changed` carries the row, and `change.after.state` is present
		// only when the edit moved the state (the diff-only shape `edit_task`
		// already writes).
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
			// @lore BA6: NOT subscribed here on `state === "killed"` — unlike the
			// `done` reaction above, a killed dependency's reset has to be visible
			// the moment the kill's own response returns. Subscribing here would
			// race `cascadeTaskKill`'s own synchronous per-task loop and
			// double-apply the reset. `cascadeTaskKill` — the ONLY production
			// path that ever reaches `killed` — calls `handleDependencyKilled`
			// itself, awaited, right after each task's kill transition.
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

	return api;
}

/**
 * Attach extra disposers to an app the Application composed, so a single
 * `disposeApp(root)` tears the whole composition down.
 *
 * @lore AU26 B1b: `createCoreApiApp` keys its own disposer bag on the route
 * table it returns, but a test harness holds the composed ROOT app. The
 * Application therefore forwards the Layer disposers onto the root, which keeps
 * `disposeApp(app)` — the shape ~240 fixture-based tests already rely on —
 * unchanged.
 */
export function registerAppDisposers(hono: Hono, disposers: ReadonlyArray<() => void>): void {
	const bag = APP_DISPOSERS.get(hono) ?? [];
	bag.push(...disposers);
	APP_DISPOSERS.set(hono, bag);
}

/**
 * Detach and return an app's disposer bag.
 *
 * @lore AU26 B1b: the Application composes ONE root app and tears it down with
 * ONE `disposeApp(root)` call. If the Layer boot kept its own bag and the root
 * merely held a `() => disposeApp(layerApp)` thunk, `disposeApp` would run
 * twice per shutdown — which `server-disposal.integration.test.ts` catches as a
 * duplicated `app-domain` phase. Taking the bag moves ownership instead of
 * nesting it, so every disposer runs exactly once, in order.
 */
export function takeAppDisposers(hono: Hono): Array<() => void> {
	const bag = APP_DISPOSERS.get(hono) ?? [];
	APP_DISPOSERS.delete(hono);
	return bag;
}

/**
 * §7 — detach and return the composed action list's tool projection.
 * `undefined` when `db` was never supplied (no actions were built). Read
 * exactly once, by `bootCoreApi`.
 */
export function takeAppActionTools(
	hono: Hono,
): ReadonlyArray<RegisteredTool<HyperIdleDb>> | undefined {
	const tools = APP_ACTION_TOOLS.get(hono);
	APP_ACTION_TOOLS.delete(hono);
	return tools;
}

/**
 * §8.4 — detach and return the composed `edit_document`/`search_documents`
 * runners. `undefined` when `db` was never supplied (no actions were built).
 * Read exactly once, by `bootCoreApi`, the same idiom `takeAppActionTools`
 * already gives.
 */
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
			// @lore G4 dispose-swallow: dispose is best-effort. Each registered
			// disposer is a synchronous `EventBus.off` call; the tolerated failure
			// mode here is a second teardown (e.g. overlapping test lifecycles)
			// calling `unsubscribe` on a handler that was already removed. We
			// prefer to continue iterating the disposer list rather than abort
			// midway and leak the remaining subscriptions — a partial dispose
			// during test teardown causes unbounded handler accumulation and
			// flaky downstream assertions. H2 adds observability for the failure
			// so we don't lose the signal.
			appLogger.error("disposeApp: disposer threw", {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
	bag.length = 0;
	APP_DISPOSERS.delete(hono);
}

export type { AppOptions };

/**
 * The Hono application type, re-exported via `@hyperidle/server/schemas` for the
 * web package's `hc<AppType>` client.
 *
 * @lore AF4/§4g: A fully typed Hono-RPC `AppType` (route-chained schema) was
 * lost when routes moved to untyped `app.route(path, sub)` mutation. `createApp`
 * returns a bare `Hono`, so the honest type is `Hono` — the web client keeps a
 * structural client without a per-route schema. Restoring a typed RPC surface
 * is a behaviour/architecture change (out of AF4 scope); this re-export only
 * un-dangles the type so server (and web, AF5) compile against the real shape.
 */
export type AppType = Hono;

export { createCoreApiApp };
