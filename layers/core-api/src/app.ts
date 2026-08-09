import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { CredentialResolver } from "@hyperidle/credential-access";
import { decryptCredentialValue, encryptCredentialValue } from "@hyperidle/credential-access";
import {
	deleteCredential,
	readCredentials,
	writeCredential,
} from "@hyperidle/credentials";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import { EventBus } from "@hyperidle/event-bus";
import type { HarnessCapabilityReader } from "@hyperidle/harness-protocol";
import { createRateLimiter } from "@hyperidle/http-middleware";
import type { NotificationAdapter, NotificationsDeps } from "@hyperidle/notifications";
import { getTeamMembers } from "@hyperidle/org";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import { createUpgradeTokenStore, findUser, type UpgradeTokenStore } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { checkAndUnblockDependents } from "@hyperidle/work";
import { Hono } from "hono";
import { type ObservabilityDeps, startObservability } from "./observability-runtime.js";
import { createAgentRoutes } from "./routes/agents.js";
import { createArtifactRoutes } from "./routes/artifacts.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createPublicAuthRoutes } from "./routes/auth-public.js";
import { createBetRoutes } from "./routes/bets.js";
import { createConversationRoutes } from "./routes/conversations.js";
import { createCredentialRoutes } from "./routes/credentials.js";
import { createFilesystemInjectionRoutes } from "./routes/filesystems.js";
import { createHarnessRoutes } from "./routes/harnesses.js";
import { authHealth } from "./routes/health.js";
import { createHintRoutes } from "./routes/hints.js";
import { createKnowledgeRoutes, createTeamMembersRoutes } from "./routes/knowledge.js";
import { createModelGatewayRoutes } from "./routes/model-gateway.js";
import { createNotificationRoutes } from "./routes/notifications-routes.js";
import { createOrgRoutes } from "./routes/org.js";
import { createRecipientRoutes } from "./routes/recipients.js";
import { createReviewRoutes } from "./routes/reviews.js";
import { createRoutineRoutes } from "./routes/routines-routes.js";
import { createSearchRoutes } from "./routes/search.js";
import { createSessionRoutes } from "./routes/sessions-routes.js";
import { createSettingsRoutes } from "./routes/settings.js";
import { createAgentBehaviorSettingsRoutes } from "./routes/settings-agent-behavior.js";
import { createStatusRoutes } from "./routes/status.js";
import { createTaskRoutes } from "./routes/tasks.js";
import { createTeamRoutes } from "./routes/teams-routes.js";
import { createThreadRoutes } from "./routes/threads.js";
import { createUserRoutes, createUserSetupRoute } from "./routes/users.js";
import { createWorkersRoutes } from "./routes/workers.js";
import { buildSeamBackedWorkIntentRecorder } from "./services/agent-orchestration-port-composition.js";
import { taskRunResolverDeps } from "./services/task-run-resolver-bindings.js";

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
	 * `@hyperidle/agent-run-config`/`@hyperidle/filesystems` directly now goes
	 * through this door. `createCoreApiApp` throws a named error at
	 * construction if `db` is present and this is not.
	 */
	agentOrchestration?: AgentOrchestrationPort;
	serviceBootstrap?: (ctx: {
		db: HyperIdleDb;
		eventBus: EventBus;
		agentOrchestration: AgentOrchestrationPort;
		/**
		 * AU31 §5.2: built by `bootCoreApi` from this Layer's own `settings`
		 * service and merged onto `ctx` before the caller's `serviceBootstrap`
		 * runs — the Application used to build this closure itself
		 * (`create-server.ts`'s deleted `readAlertPreferences`), which meant
		 * importing `@hyperidle/settings` directly. Optional so a caller that
		 * doesn't register the routine scheduler (most tests) can ignore it.
		 */
		readAlertPreferences?: () => Promise<{
			readonly blockerAlerts: boolean;
			readonly reviewAlerts: boolean;
			readonly quietHoursEnabled: boolean;
			readonly quietHoursStart: string;
			readonly quietHoursEnd: string;
		}>;
	}) => Array<() => void>;
	/**
	 * Optional override for the notification adapter used by the HTTP
	 * `/notifications/test`, `/notifications/flush`, and
	 * `/notifications/digest` routes. Tests inject a FakeAdapter that
	 * records every send.
	 *
	 * NOTE: This does NOT affect the app-level notification dispatcher. This
	 * option is purely for the HTTP route layer.
	 *
	 * @lore AU20 Ag6b: factory signature simplified to `() => NotificationAdapter`
	 * (no config arg) since the route layer delegates all config-reading to the
	 * internal `sendTest`/`flush`/`runDigest` wrappers.
	 */
	notificationAdapterFactory?: () => NotificationAdapter;
	/**
	 * Optional override for the observability adapter (H3). Tests inject
	 * a FakeAdapter whose `record` captures every event. When omitted
	 * production wiring picks console or noop based on
	 * `server_config.observability.adapter`.
	 *
	 * Typed as `ObservabilityDeps['adapter']` — the test seam field on the
	 * single deps contract, same shape as before (structural adapter interface).
	 */
	observabilityAdapter?: ObservabilityDeps["adapter"];
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
	 * sub-router. The only caller is the development test fixture, which mounts the
	 * middleware-exercising routes that used to be statically imported here.
	 */
	registerExtraRoutes?: (apiRouter: Hono) => void;
	/**
	 * AU21 §6 Decision L4 / §9 Increment 14d: the WS connection hub's
	 * broadcast-only surface. When provided, route factories that push
	 * changed data directly (`createThreadRoutes`'s per-thread +
	 * conversations-list pushes) call `wsHub.broadcast(topic, data)` at the
	 * same write that has the full record in hand — no generic event→topic
	 * forwarder, no follow-up client read. Optional so integration tests that
	 * don't need WS pushes can omit it (routes still emit their EventBus
	 * events unchanged either way).
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
	agentWorkIntentRecorder?: import("@hyperidle/work-intent-port").AgentWorkIntentRecorder<HyperIdleDb>;
}

/**
 * @lore Event-bus disposers live alongside the app instance but must not
 * appear on the public Hono surface. A module-scoped WeakMap keyed by
 * the Hono instance keeps the association without string-cast stash
 * patterns — disposers are garbage-collected with the app.
 */
const APP_DISPOSERS = new WeakMap<Hono, Array<() => void>>();
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
	const sharedMode = options?.sharedMode ?? process.env.HYPERIDLE_SHARED_MODE === "true";

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

	// S1: Public: POST /api/auth/claim (invite claim — no auth required).
	// Only mounted in shared mode — claim is meaningless in local desktop mode
	// where there are no invite flows.
	if (options?.db && sharedMode) {
		api.route("/auth", createPublicAuthRoutes(options.db));
	}

	// WS upgrades authenticate via a one-shot upgrade token (`?token=...`) in a
	// middleware defined inside `registerWsRoute`, not via the API key.
	if (options?.registerWebSocket && tokenStore) {
		options.registerWebSocket(api, tokenStore);
	}
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

	// I2 review O6 / arch H-1: the WS-token mint endpoint gets its OWN
	// rate-limit bucket so a WS reconnect storm cannot starve the API
	// budget (or vice-versa). Larger budget than the API path because
	// browsers may legitimately reconnect in bursts during a flaky
	// network blip; auth still gates the mint, so the cost ceiling is the
	// API key holder's chosen budget.
	if (tokenStore) {
		const rateLimitPerMin = Number.parseInt(process.env.HYPERIDLE_RATE_LIMIT_PER_MIN ?? "300", 10);
		const baseRateLimit =
			Number.isFinite(rateLimitPerMin) && rateLimitPerMin > 0 ? rateLimitPerMin : 300;
		api.use(
			"/auth/*",
			createRateLimiter({ limit: Math.max(baseRateLimit * 2, 120), windowMs: 60_000 }),
		);
	}

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
		const defaultAgentWorkIntentRecorder =
			buildSeamBackedWorkIntentRecorder<HyperIdleDb>(agentOrchestration);

		// @lore U2: `/products` URL renamed to `/teams` (domain rename: Product → Team).
		// The old `createTeamsRoutes` (knowledge team_members listing) relocated to `/team-members`.
		api.route("/agents", createAgentRoutes(options.db, agentOrchestration, options.adapterPool));
		api.route("/model-gateway", createModelGatewayRoutes(options.db));
		api.route(
			"/teams",
			createTeamRoutes(options.db, eventBus, agentOrchestration, options.adapterPool),
		);
		api.route("/bets", createBetRoutes(options.db, eventBus, agentOrchestration));
		api.route("/tasks", createTaskRoutes(options.db, eventBus, agentOrchestration));
		api.route("/reviews", createReviewRoutes(options.db));
		api.route("/artifacts", createArtifactRoutes(options.db, eventBus));
		// AU26 F2: only ONE `/api/filesystems` registration is still core-hosted —
		// `POST /:id/injections`, whose team-consistency gate reads `users` +
		// `team_members`. Every other registration (and the reachability probe's
		// `ServiceConnectionResolver`, which core-api no longer constructs) lives
		// on agent-orchestration's app at byte-identical paths. See
		// `routes/filesystems.ts`'s own top-of-file `@lore`.
		api.route("/filesystems", createFilesystemInjectionRoutes(options.db, agentOrchestration));
		api.route("/knowledge", createKnowledgeRoutes(options.db, eventBus, agentOrchestration));
		api.route("/team-members", createTeamMembersRoutes(options.db));
		api.route("/settings", createSettingsRoutes(options.db, eventBus));
		api.route("/settings/agent-behavior", createAgentBehaviorSettingsRoutes(options.db));
		api.route("/conversations", createConversationRoutes(options.db, eventBus));
		api.route(
			"/threads",
			createThreadRoutes(
				options.db,
				eventBus,
				options.agentWorkIntentRecorder ?? defaultAgentWorkIntentRecorder,
				options.wsHub,
			),
		);
		api.route("/users", createUserRoutes(options.db, agentOrchestration, options.adapterPool));
		api.route("/org", createOrgRoutes(options.db, agentOrchestration));
		api.route("/routines", createRoutineRoutes(options.db, eventBus, agentOrchestration));
		api.route("/recipients", createRecipientRoutes(options.db, eventBus));

		// AU26 B1a (§D-A's `sessions-routes.ts` split): `POST /api/sessions` is all that is left of this
		// route module. `GET /`, `GET /starts/:startId`, `GET /:id/activity` and
		// `PATCH /:id` moved onto agent-orchestration's own app — same URLs (§D-A
		// rule 7), different host. POST stays because its handler gates on `tasks`
		// and bakes `users`/`server_config`: a two-sided table set, and §D-A rule 3
		// gives a two-sided route exactly one legal host.
		//
		// @lore AU26 B1a: the `SessionActivityBuffer` this block used to construct
		// and start is GONE from core-api. Both of its readers (the REST activity
		// route and the `AgentOrchestrationPort` backing route) are on the owning
		// side now, so `bootAgentOrchestration` owns the buffer's lifecycle.
		api.route(
			"/sessions",
			// AU11 AC-2: the route only ever read the adapter-pool PRESENCE as a
			// boolean gate (see routes/sessions-routes.ts's removal note) — the
			// composition root now computes that boolean directly instead of
			// threading the whole harness-typed deps object into the route.
			createSessionRoutes(options.db, eventBus, Boolean(options.adapterPool), agentOrchestration),
		);
		api.route("/status", createStatusRoutes(options.db));

		// S2: worker admin visibility — GET /api/workers lists registered adapters.
		// Requires X-API-Key matching HYPERIDLE_API_KEY (admin-level auth inside route).
		// Only mounted when adapterPool is provided so kernel-only mode is unaffected.
		if (options.adapterPool) {
			api.route("/workers", createWorkersRoutes(options.adapterPool));
			// AH2: GET /api/harnesses — deduped harness type list for SettingsAgents selector.
			// AM4 CHANGE 3 (Seam 3): thread options.db so the handler can stamp discovery.disabled
			// and the redetect/disable routes can read/write server_config.
			api.route("/harnesses", createHarnessRoutes(options.adapterPool, options.db));
		}
		api.route("/credentials", createCredentialRoutes(options.db));
		// AU26 E4: `/api/connections` is served by `agent-orchestration`'s own
		// app now (its whole table set is `service_connections`, which that Layer
		// owns). Same path, other host — see `createAgentOrchestrationApp`.
		api.route("/hint-progress", createHintRoutes(options.db));
		api.route("/search", createSearchRoutes(options.db, eventBus));
		// Tests may override via notificationAdapterFactory for route-level adapter injection.
		// @lore AU20 Ag6b: adapterFactory option replaced with adapterOverride (no config arg).
		api.route(
			"/notifications",
			createNotificationRoutes(options.db, {
				deps: notificationsDeps,
				adapterOverride: options.notificationAdapterFactory
					? options.notificationAdapterFactory()
					: undefined,
			}),
		);

		// Observability runtime. `startObservability` wires the adapter,
		// dispatcher and bus subscription in one call.
		//
		// @lore AU26 C2: the `/api/observability*` routes are GONE — all four had
		// zero requesters repo-wide — and with them the `reconfigure` seam that
		// let PATCH /config rotate the adapter without a process restart. Config
		// is read once at boot; changing it is a restart.
		const db = options.db;
		const observabilityRuntime = await startObservability({
			db,
			eventBus,
			...(options?.observabilityAdapter ? { adapter: options.observabilityAdapter } : {}),
		});

		const disposers: Array<() => void> = [];

		const serviceDisposers = options.serviceBootstrap?.({ db, eventBus, agentOrchestration }) ?? [];
		disposers.push(...serviceDisposers);

		// AD5 AC-2: Auto-unblock dependent tasks when a task transitions to "done".
		// @lore AD5 option-A: handler lives in app.ts (server layer) — fabric cannot
		// import from server (layer violation). checkAndUnblockDependents relocated
		// to `@hyperidle/work` (AU20 Ag2 barrel collapse) — it exclusively calls
		// work's own table paths, so `work` is its correct home. The `work:` DI-port
		// sub-object is gone; only the against-grain `session-requests` recorder
		// (`workIntents`) remains injected — AU31 §3.1/§3.2: seam-backed, so this
		// write is now the same relinquished-atomicity shape as `transitionTask`'s
		// own site 6 (`checkAndUnblockDependents` calls `transitionTask` directly).
		const unsubDepWatcher = eventBus.on("task_state_changed", (event) => {
			if (event.toState === "done") {
				void checkAndUnblockDependents(db, eventBus, event.taskId, {
					workIntents: defaultAgentWorkIntentRecorder,
					taskRunResolver: taskRunResolverDeps,
				}).catch((err) => {
					appLogger.error("[dep-watcher] unblock failed for task", {
						taskId: event.taskId,
						error: err instanceof Error ? err.message : String(err),
					});
				});
			}
		});
		disposers.push(unsubDepWatcher);

		disposers.push(() => {
			void observabilityRuntime.dispose();
		});
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
