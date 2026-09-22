import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import {
	type CredentialResolver,
	decryptCredentialValue,
	deleteCredential,
	encryptCredentialValue,
	readCredentials,
	writeCredential,
} from "@hyperidle/credentials";
import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import { EventBus } from "@hyperidle/event-bus";
import type { RegisteredTool } from "@hyperidle/harness-protocol";
import type { NotificationsDeps } from "@hyperidle/notifications";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import { checkAndUnblockDependents } from "@hyperidle/task";
import { createUpgradeTokenStore, type UpgradeTokenStore } from "@hyperidle/users";
import { Hono } from "hono";
import type { Action, ActionContext } from "./actions/action.js";
import { actionsAsTools } from "./actions/actions-as-tools.js";
import { createActionsRouter } from "./actions/actions-router.js";
import { buildCoreActions } from "./actions/compose.js";
import { createAgentIdentityPort } from "./routes/agent-identity.js";
import { createAgentRoutes } from "./routes/agents.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createCredentialRoutes } from "./routes/credentials.js";
import { createFilesystemInjectionRoutes } from "./routes/filesystems.js";
import { createHarnessRoutes } from "./routes/harnesses.js";
import { authHealth } from "./routes/health.js";
import { createNotificationRoutes } from "./routes/notifications-routes.js";
import { createOrgRoutes } from "./routes/org.js";
import { createRecipientRoutes } from "./routes/recipients.js";
import { createRoutineRoutes } from "./routes/routines-routes.js";
import { createSearchRoutes } from "./routes/search.js";
import { createAgentBehaviorSettingsRoutes } from "./routes/settings-agent-behavior.js";
import { createTeamRoutes } from "./routes/teams-routes.js";
import { createUserRoutes, createUserSetupRoute } from "./routes/users.js";
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
	 * primitives needed by the routine scheduler and agent orchestration.
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
	 * Credential resolver for pre-flight API key checks (R1).
	 */
	credentialResolver?: CredentialResolver;
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
 * @lore AU19 Increment 1g/1h: `notifications`' DI ports (Mechanism C), wired
 * here at the `packages/server` composition point — same construction as
 * `server-factory.ts`'s (both need the same real functions; `app.ts` also
 * needs to build the `/api/notifications` route table). All five targets
 * (`settings`, `users`, `org`, `work`, `connections`) are now real,
 * already-migrated packages; the credential cipher/store closed in
 * Increment 1h and wire directly to `@hyperidle/connections`' real exports.
 *
 * @lore AU20 Ag6b: collapsed from 5 separate port objects into one
 * `NotificationsDeps` bag (same pattern as server-factory.ts).
 */
const notificationsServerConfigPort = { read: readServerConfig, update: updateServerConfig };

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
			}),
		deleteByName: (db, name) => deleteCredential(db, name),
	},
};

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

	// P4: Public: POST /api/users (setup — no auth required on first run).
	// The route itself enforces auth once a human user already exists
	// (setup-complete guard).
	if (options?.db && options.agentOrchestration) {
		// AK6 T8: eventBus passed so user_created event is emitted after assistant persist.
		const earlyEventBus = options.eventBus ?? new EventBus();
		api.route(
			"/users",
			createUserSetupRoute(options.db, earlyEventBus, options.agentOrchestration),
		);
	}

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
	};
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
		// @lore document-module B11: an agent's identity document (§8.3) — the
		// one shared helper every agent-creating route (`/agents`, `/org`'s
		// scaffold-request, `/teams`'s create) reduces to, built from the same
		// composed `search_documents`/`edit_document` runners rather than
		// `@hyperidle/document`'s repository functions.
		const agentIdentity = createAgentIdentityPort({
			searchDocuments: searchDocumentsRun,
			editDocument: editDocumentRun,
			eventBus,
		});
		// @lore U2: `/products` URL renamed to `/teams` (domain rename: Product → Team).
		// The old `createTeamsRoutes` (knowledge team_members listing) relocated to `/team-members`.
		// Mounted here (after the action list and `agentIdentity` both exist)
		// rather than at its old pre-actions spot — the profile/list/create/
		// delete handlers all reach an agent's identity document through it now.
		api.route(
			"/agents",
			createAgentRoutes(options.db, agentOrchestration, options.adapterPool, agentIdentity),
		);
		// @lore `/teams` mounts after the action list is built and `sendMessage`
		// extracted — its POST handler's welcome-message seed posts through the
		// composed action instead of a raw `insertThread`/`insertMessage` into
		// the literal id `thr-ast-${userId}`.
		api.route(
			"/teams",
			createTeamRoutes(
				options.db,
				eventBus,
				agentOrchestration,
				sendMessage,
				agentIdentity,
				options.adapterPool,
			),
		);
		// @lore BC3 architecture.md §5 B1: `/reviews`, `/conversations`, `/threads`
		// and their route files are DELETED — search_threads/open_thread/
		// send_message/adjust_thread are the door now, mounted generically by
		// createActionsRouter above. `/recipients` stays (plan.md Confusion 4).
		// AU26 F2: only ONE `/api/filesystems` registration is still core-hosted —
		// `POST /:id/injections`, whose team-consistency gate reads `users` +
		// `team_members`. Every other registration (and the reachability probe's
		// `ServiceConnectionResolver`, which core-api no longer constructs) lives
		// on agent-orchestration's app at byte-identical paths. See
		// `routes/filesystems.ts`'s own top-of-file `@lore`.
		api.route("/filesystems", createFilesystemInjectionRoutes(options.db, agentOrchestration));
		api.route("/users", createUserRoutes(options.db));
		api.route("/org", createOrgRoutes(options.db, agentOrchestration, agentIdentity));
		// @lore document-module B12: a routine's prompt document reads/writes
		// through the same composed `search_documents`/`edit_document` runners,
		// extracted above (architecture.md §8.2, §8.3) — never
		// `@hyperidle/document`'s repository functions directly.
		api.route(
			"/routines",
			createRoutineRoutes(
				options.db,
				eventBus,
				agentOrchestration,
				searchDocumentsRun,
				editDocumentRun,
			),
		);
		api.route("/recipients", createRecipientRoutes(options.db, eventBus));

		// AH2: GET /api/harnesses — deduped harness type list for SettingsAgents selector.
		// AM4 CHANGE 3 (Seam 3): thread options.db so the handler can stamp discovery.disabled
		// and the redetect/disable routes can read/write server_config.
		// AU36 D5: thread onHarnessRedetect so redetect also refreshes inherited reach.
		if (options.adapterPool) {
			api.route(
				"/harnesses",
				createHarnessRoutes(options.adapterPool, options.db, options.onHarnessRedetect),
			);
		}
		api.route("/credentials", createCredentialRoutes(options.db));
		// AU26 E4: `/api/connections` is served by `agent-orchestration`'s own
		// app now (its whole table set is `service_connections`, which that Layer
		// owns). Same path, other host — see `createAgentOrchestrationApp`.
		api.route("/search", createSearchRoutes(options.db, eventBus, searchDocumentsRun));
		api.route("/settings/agent-behavior", createAgentBehaviorSettingsRoutes(options.db));
		// BC6: plugin management is the platform module now —
		// `search_plugins`/`edit_plugin`, mounted generically by
		// `createActionsRouter` above (`compose.ts`'s fourth action group).
		// `routes/plugins.ts` and its six routes are deleted.
		api.route("/notifications", createNotificationRoutes(options.db, { deps: notificationsDeps }));

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
			}) ?? [];
		disposers.push(...serviceDisposers);

		// AD5 AC-2: Auto-unblock dependent tasks when a task transitions to "done".
		// @lore AD5 option-A: handler lives in app.ts (server layer) — fabric cannot
		// import from server (layer violation). checkAndUnblockDependents relocated
		// to `@hyperidle/task` (renamed from `@hyperidle/work`) — it
		// exclusively calls task's own table paths, so `task` is its correct
		// home. §6 row 2: it now writes through `edit_task` instead of the
		// deleted `transitionTask`, injected as a plain function (Mechanism C).
		const unsubDepWatcher = eventBus.on("task_state_changed", (event) => {
			if (event.toState === "done") {
				void checkAndUnblockDependents(
					{ actor: "system:propagation", db, eventBus, now: new Date().toISOString() },
					event.taskId,
					editTask,
				).catch((err) => {
					appLogger.error("[dep-watcher] unblock failed for task", {
						taskId: event.taskId,
						error: err instanceof Error ? err.message : String(err),
					});
				});
			}
			// @lore BA6: NOT subscribed here on `toState === "killed"` — unlike the
			// `done` reaction above, a killed dependency's reset has to be visible
			// the moment the kill's own response returns. Subscribing here would
			// race `cascadeTaskKill`'s own synchronous per-task loop and
			// double-apply the reset. `cascadeTaskKill` — the ONLY production
			// path that ever reaches `killed` — calls `handleDependencyKilled`
			// itself, awaited, right after each task's kill transition.
		});
		disposers.push(unsubDepWatcher);

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
