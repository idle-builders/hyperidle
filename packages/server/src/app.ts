import type { HyperIdleDb } from "@hyperidle/db";
import { defaultNotificationAdapterFactory, registerAssistantDispatcher } from "@hyperidle/fabric";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES, createLogger, EventBus } from "@hyperidle/shared";
import { Hono } from "hono";
import { createUpgradeTokenStore, type UpgradeTokenStore } from "./auth/upgrade-token-store.js";
import type { AdapterPool } from "./harness/adapter-pool.js";
import type { SandboxAdapter } from "./harness/sandbox-adapter.js";
import type { McpBridgeRegistry } from "./mcp/mcp-bridge-registry.js";
import { failClosedAssertion } from "./middleware/access-boundary-middleware.js";
import { authMiddleware, createAuthMiddleware } from "./middleware/auth.js";
import { createBodyLimit } from "./middleware/body-limit.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createRateLimiter } from "./middleware/rate-limit.js";
import { createAgentRoutes } from "./routes/agents.js";
import { createArtifactRoutes } from "./routes/artifacts.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createPublicAuthRoutes } from "./routes/auth-public.js";
import { createBetRoutes } from "./routes/bets.js";
import { createConnectionRoutes } from "./routes/connections.js";
import { createConversationRoutes } from "./routes/conversations.js";
import { createCredentialRoutes } from "./routes/credentials.js";
import { createDispatchQueueRoutes } from "./routes/dispatch-queue-routes.js";
import { createFilesystemRoutes } from "./routes/filesystems.js";
import { createGitExportRoutes } from "./routes/git-export-routes.js";
import { createHarnessRoutes } from "./routes/harnesses.js";
import { authHealth, health } from "./routes/health.js";
import { createHintRoutes } from "./routes/hints.js";
import { createKnowledgeRoutes, createTeamMembersRoutes } from "./routes/knowledge.js";
import { createModelGatewayRoutes } from "./routes/model-gateway.js";
import { createNotificationRoutes } from "./routes/notifications-routes.js";
import { createObservabilityRoutes } from "./routes/observability-routes.js";
import { createOrgRoutes } from "./routes/org.js";
import { createRecipientRoutes } from "./routes/recipients.js";
import { createReviewRoutes } from "./routes/reviews.js";
import { createRoutineRoutes } from "./routes/routines-routes.js";
import { createSearchRoutes } from "./routes/search.js";
import { createSessionRoutes } from "./routes/sessions-routes.js";
import { createSettingsRoutes } from "./routes/settings.js";
import { createStatusRoutes } from "./routes/status.js";
import { createTaskRoutes } from "./routes/tasks.js";
import { createTeamRoutes } from "./routes/teams-routes.js";
import { registerTestRoutes } from "./routes/test-routes.js";
import { createThreadRoutes } from "./routes/threads.js";
import { createUserRoutes, createUserSetupRoute } from "./routes/users.js";
import { createWorkersRoutes } from "./routes/workers.js";
import type { AssistantTurnDeps } from "./services/assistant-turn.js";
import { getServerSecret } from "./services/credential-encryption.js";
import type { CredentialResolver } from "./services/credential-resolver.js";
import { checkAndUnblockDependents } from "./services/dependency-watcher.js";
import {
	type ObservabilityConfig,
	readObservabilityConfig,
} from "./services/observability/config.js";
import { createConsoleObservabilityAdapter } from "./services/observability/console-adapter.js";
import {
	createDbTraceIdResolver,
	createObservabilityDispatcher,
	registerObservabilityDispatcher,
} from "./services/observability/dispatcher.js";
import type {
	ObservabilityAdapter,
	ObservabilityDispatcher,
} from "./services/observability/types.js";
import { ServiceConnectionResolver } from "./services/service-connection-resolver.js";
import { SessionActivityBuffer } from "./services/session-activity-buffer.js";

interface AppOptions {
	db?: HyperIdleDb;
	eventBus?: EventBus;
	/**
	 * Strategy-layer bootstrap function. When provided, `createApp` calls it
	 * with `{ db, eventBus }` and pushes the returned disposers into the app's
	 * disposer bag. When omitted (or undefined), the app boots in kernel-only
	 * mode — no strategy event handlers are registered.
	 *
	 * Production entry point passes `bootstrapFabric` from `@hyperidle/fabric`.
	 * Tests that need kernel-only mode pass `undefined` (or simply omit the field).
	 * Tests that need custom strategy wiring pass a custom function.
	 *
	 * @lore O3: This replaces 7 hardwired `register*` calls in app.ts, enforcing
	 * the kernel/strategy boundary via the package dependency graph.
	 */
	strategyBootstrap?: (ctx: { db: HyperIdleDb; eventBus: EventBus }) => Array<() => void>;
	/**
	 * Optional override for the notification adapter factory used by the
	 * HTTP `/notifications/test`, `/notifications/flush`, and
	 * `/notifications/digest` routes. Tests inject a FakeAdapter that
	 * records every send.
	 *
	 * NOTE: This does NOT affect the strategy-layer dispatcher (registered via
	 * `strategyBootstrap`). The dispatcher uses its own factory (internalized
	 * in `bootstrapFabric`). This option is purely for the HTTP route layer.
	 *
	 * @lore O3: Kept on AppOptions (HTTP route concern) even though the
	 * dispatcher factory was internalized in bootstrapFabric. Removing it
	 * would require restructuring notification route tests to not use createApp.
	 */
	notificationAdapterFactory?: (
		cfg: import("@hyperidle/fabric").NotificationConfig,
	) => import("@hyperidle/fabric").NotificationAdapter;
	/**
	 * Optional override for the observability adapter (H3). Tests inject
	 * a FakeAdapter whose `record` captures every event. When omitted
	 * production wiring picks console or noop based on
	 * `factory_settings.observability.adapter`.
	 */
	observabilityAdapter?: ObservabilityAdapter;
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
	 * Optional worker WebSocket registration hook. When provided,
	 * `createApp` invokes it with the `/api` sub-router at the same point as
	 * `registerWebSocket` — BEFORE the auth middleware — so workers can
	 * authenticate via query token without requiring a user API key.
	 *
	 * @lore S2-F01: worker WS route must be registered before auth middleware
	 * (same pattern as user WS route). Production createServer passes this hook
	 * so dead-code paths are eliminated.
	 */
	registerWorkerWebSocket?: (apiRouter: Hono) => void;
	/**
	 * Optional MCP bridge route registration hook. When provided,
	 * `createApp` invokes it with the `/api` sub-router BEFORE the auth
	 * middleware — MCP clients authenticate via the session token in the URL
	 * path, not via X-API-Key.
	 *
	 * @lore X2: The MCP route must be mounted before auth middleware so external
	 * harnesses (e.g. Claude Code) can call agent tools via MCP without needing
	 * the user API key. The 64-char hex token in the URL is the credential.
	 */
	registerMcpRoute?: (apiRouter: Hono) => void;
	/**
	 * Override the upgrade-token store used by `/api/auth/ws-token` and the
	 * WebSocket auth middleware. Tests inject a custom store with a tiny
	 * TTL; production wiring uses `createUpgradeTokenStore()`.
	 */
	upgradeTokenStore?: UpgradeTokenStore;
	/**
	 * Adapter pool for running agent sessions. When provided alongside
	 * `workspaceAdapter`, POST /api/sessions routes through `provisionSession`
	 * instead of a bare DB insert (R1).
	 * @lore S2: renamed from harnessAdapter to adapterPool.
	 */
	adapterPool?: AdapterPool;
	/**
	 * Sandbox adapter for provisioning/destroying agent sandboxes (R1).
	 */
	workspaceAdapter?: SandboxAdapter;
	/**
	 * Base path where workspaces are created. Defaults to a tmp directory in
	 * production (R1).
	 */
	sandboxBasePath?: string;
	/**
	 * Credential resolver for pre-flight API key checks (R1).
	 */
	credentialResolver?: CredentialResolver;
	/**
	 * X2: MCP bridge registry for routing MCP requests to session transports.
	 * When provided alongside `mcpBaseUrl`, the session provisioner creates a
	 * per-session bridge and writes `.mcp.json` for harness auto-discovery.
	 */
	mcpBridgeRegistry?: McpBridgeRegistry;
	/**
	 * X2: Base URL for MCP bridge (e.g., "http://localhost:3001").
	 * Used when writing `.mcp.json` to the workspace during session provisioning.
	 */
	mcpBaseUrl?: string;
	/**
	 * AH3: Optional assistant turn dependencies. When provided, a human plain
	 * message on the assistant thread fires runAssistantTurn (fire-and-forget).
	 * When absent, the trigger is a no-op (kernel-only mode, chrome tests).
	 *
	 * @lore AH3 §1.5: AH5's real-model lane supplies these deps at boot time.
	 * Integration tests supply them per-test via createTestApp({ assistantTurnDeps }).
	 */
	assistantTurnDeps?: AssistantTurnDeps;
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
}

function buildObservabilityAdapter(cfg: ObservabilityConfig): ObservabilityAdapter | null {
	switch (cfg.adapter) {
		case "console":
			return createConsoleObservabilityAdapter();
		case "noop":
			return null;
	}
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
 * Create the Hono application.
 * WebSocket routes are registered separately via registerWsRoute(), injected
 * through the `registerWebSocket` option so the app remains runtime-agnostic.
 */
async function createApp(options?: AppOptions): Promise<Hono> {
	const app = new Hono();

	// S1: shared mode — read from options (test-injectable) or env var (production).
	// @lore S1: The env var is read once at app construction time, not per-request.
	// This avoids per-request env lookups and is consistent with how HYPERIDLE_API_KEY
	// is used (read at middleware invocation time, but the middleware itself is
	// constructed once at startup).
	const sharedMode = options?.sharedMode ?? process.env.HYPERIDLE_SHARED_MODE === "true";

	// Backward-compat: /health without auth
	app.route("/", health);

	// ----- /api sub-router -----
	const api = new Hono();

	// CORS on all /api routes
	api.use("*", corsMiddleware);

	// Error handler
	api.onError(errorHandler);

	// Public: /api/health (no auth required)
	api.get("/health", (c) => {
		const response = {
			status: "ok" as const,
			timestamp: new Date().toISOString(),
		};
		return c.json(response);
	});

	// I2 R1-R5: rate limit BEFORE auth so unauthenticated floods are
	// throttled without ever touching the database. Per-identity bucket
	// (API-key first, then trusted XFF, then direct connection).
	//
	// I2 review W4: `/api/health` is a liveness probe target — k8s,
	// systemd, and load balancers fire it many times per minute and a 429
	// would mark the pod unhealthy. The limiter exempts it via skipPaths.
	const rateLimitPerMin = Number.parseInt(process.env.HYPERIDLE_RATE_LIMIT_PER_MIN ?? "300", 10);
	const baseRateLimit =
		Number.isFinite(rateLimitPerMin) && rateLimitPerMin > 0 ? rateLimitPerMin : 300;
	api.use(
		"*",
		createRateLimiter({
			limit: baseRateLimit,
			windowMs: 60_000,
			// Health probes never count against the limiter (k8s liveness).
			// `/api/auth/*` is exempted here and gets its own dedicated
			// bucket below so a WS-reconnect storm cannot starve the API.
			skipPaths: ["/api/health", "/api/status/health", "/api/auth"],
		}),
	);

	// P4: Public: POST /api/users (setup — no auth required on first run)
	// @lore P4: Registered AFTER the rate limiter so DoS floods are throttled
	// before reaching the setup route. The route itself enforces auth once a
	// human user already exists (setup-complete guard). Registered BEFORE the
	// auth middleware so the initial setup call can succeed without an API key.
	if (options?.db) {
		// AK6 T8: eventBus passed so user_created event is emitted after assistant persist.
		const earlyEventBus = options.eventBus ?? new EventBus();
		api.route("/users", createUserSetupRoute(options.db, earlyEventBus));
	}

	// S1: Public: POST /api/auth/claim (invite claim — no auth required).
	// @lore S1: Mounted BEFORE the auth middleware so unauthenticated users can
	// claim invites. Only mounted in shared mode — claim is meaningless in local
	// desktop mode where there are no invite flows.
	if (options?.db && sharedMode) {
		api.route("/auth", createPublicAuthRoutes(options.db));
	}

	// I2 review O6 / arch H-1: the WS-token mint endpoint gets its OWN
	// rate-limit bucket so a WS reconnect storm cannot starve the API
	// budget (or vice-versa). Larger budget than the API path because
	// browsers may legitimately reconnect in bursts during a flaky
	// network blip; auth still gates the mint, so the cost ceiling is the
	// API key holder's chosen budget.
	const authMintLimit = Math.max(baseRateLimit * 2, 120);
	const authMintLimiter = createRateLimiter({
		limit: authMintLimit,
		windowMs: 60_000,
	});

	// I2 R4: cap request bodies so a single oversize POST cannot stall
	// the process. Default 1 MiB; configurable via env. Rejects with 413
	// + the canonical ApiErrorResponse JSON shape.
	const maxBodyBytes = Number.parseInt(process.env.HYPERIDLE_MAX_BODY_BYTES ?? "1000000", 10);
	api.use(
		"*",
		createBodyLimit({
			maxSize: Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 ? maxBodyBytes : 1_000_000,
		}),
	);

	// I2 review arch H-2/H-3: the upgrade-token store and the
	// `/api/auth/ws-token` route are constructed ONLY when WS support is
	// being wired. Apps without a `registerWebSocket` hook (integration
	// tests that don't need WebSocket) never expose `/api/auth/ws-token`.
	let tokenStore: UpgradeTokenStore | null = null;
	if (options?.registerWebSocket) {
		tokenStore = options.upgradeTokenStore ?? createUpgradeTokenStore();
		// Register the WS route BEFORE the auth middleware: WS upgrades
		// authenticate via a one-shot upgrade token (`?token=...`) in a
		// middleware defined inside `registerWsRoute`.
		options.registerWebSocket(api, tokenStore);
	}

	// Register worker WS route BEFORE auth middleware — workers authenticate
	// via HYPERIDLE_WORKER_TOKEN query param, not via the user API key.
	if (options?.registerWorkerWebSocket) {
		options.registerWorkerWebSocket(api);
	}

	// Register MCP bridge route BEFORE auth middleware — MCP clients authenticate
	// via the session token in the URL path, not via X-API-Key.
	if (options?.registerMcpRoute) {
		options.registerMcpRoute(api);
	}

	// Auth middleware for all other /api routes (except /health above).
	// M3 A3: when db is available, use createAuthMiddleware({ db, sharedMode })
	// to set userId from users table. Without db, fall back to the stateless
	// middleware (used only by non-db app instances in tests).
	// @lore S1 SF-2: createAuthMiddleware signature changed from (db) to
	// ({ db, sharedMode }). All callers updated here.
	if (options?.db) {
		api.use("*", createAuthMiddleware({ db: options.db, sharedMode }));
	} else {
		api.use("*", authMiddleware);
	}

	// AF11: Global fail-closed assertion — mounted AFTER auth, covers all /api/* data routes.
	// After the handler runs, if __boundary was never set → undeclared route touched data.
	// In dev/test: throws loudly. In production: logs a hard error (lint is the real gate).
	// @lore AF11: Flip order — assertion starts as warn-log. Step 10 flips to throw-in-dev/test
	// once all data routes declare. That flip is now complete: all 41+ routes declare.
	api.use("*", failClosedAssertion());

	// I2 A3 + review O6: ws-token issuance lives behind the standard auth
	// middleware so the master HYPERIDLE_API_KEY mints a one-shot upgrade
	// token. The dedicated `authMintLimiter` overrides the base API
	// limiter so a reconnect storm doesn't drain the API bucket.
	if (tokenStore) {
		api.use("/auth/*", authMintLimiter);
	}

	// M3 A4: /api/auth/me is always mounted (regardless of tokenStore).
	// The /ws-token endpoint is conditionally mounted only when WS support exists.
	// This restructuring allows /me to be available in all deployments.
	// @lore S1: createAuthRoutes now takes sharedMode to conditionally mount
	// /invite and /logout (shared mode only) and to bind ws-token identity
	// from auth context rather than X-Identity header.
	// @lore S4: worker-token endpoint requires auth routes even without db or
	// tokenStore — always mount when at least one of them is truthy, or when
	// there's no db but we still want worker-token available (e.g. test apps).
	if (options?.db) {
		api.route("/auth", createAuthRoutes(options.db, tokenStore ?? null, sharedMode));
	} else {
		// Mount auth routes even without db so /worker-token is available.
		// createAuthRoutes handles null db gracefully (skips db-dependent routes).
		api.route("/auth", createAuthRoutes(null, tokenStore ?? null, sharedMode));
	}

	// Register test routes only in non-production environments
	if (process.env.NODE_ENV !== "production") {
		registerTestRoutes(api);
	}

	// P3: Authenticated health check — behind auth middleware
	api.route("/health", authHealth);

	// Register work endpoints if db is provided
	if (options?.db) {
		const eventBus = options.eventBus ?? new EventBus();

		// @lore U2: `/products` URL renamed to `/teams` (domain rename: Product → Team).
		// The old `createTeamsRoutes` (knowledge team_members listing) relocated to `/team-members`.
		api.route("/agents", createAgentRoutes(options.db, options.adapterPool));
		api.route("/model-gateway", createModelGatewayRoutes(options.db));
		api.route("/teams", createTeamRoutes(options.db, eventBus, options.adapterPool));
		api.route("/bets", createBetRoutes(options.db, eventBus));
		api.route("/tasks", createTaskRoutes(options.db, eventBus));
		api.route("/reviews", createReviewRoutes(options.db));
		api.route("/artifacts", createArtifactRoutes(options.db, eventBus));
		// AO1 v2: Wire the real ServiceConnectionResolver for reachability probes.
		// serverSecret may be null (no credential key configured) — the resolver handles null
		// gracefully (returns null for every connectionId → needs_attention for git probes).
		const scResolver = new ServiceConnectionResolver(options.db, getServerSecret());
		api.route("/filesystems", createFilesystemRoutes(options.db, eventBus, scResolver));
		api.route("/knowledge", createKnowledgeRoutes(options.db, eventBus));
		api.route("/team-members", createTeamMembersRoutes(options.db));
		api.route("/settings", createSettingsRoutes(options.db, eventBus));
		api.route("/conversations", createConversationRoutes(options.db, eventBus));
		api.route("/threads", createThreadRoutes(options.db, eventBus, options.assistantTurnDeps));
		api.route("/users", createUserRoutes(options.db, eventBus, options.adapterPool));
		api.route("/org", createOrgRoutes(options.db));
		api.route(
			"/routines",
			createRoutineRoutes(options.db, eventBus, {
				adapterPool: options.adapterPool,
				workspaceAdapter: options.workspaceAdapter,
				sandboxBasePath: options.sandboxBasePath,
			}),
		);
		api.route("/recipients", createRecipientRoutes(options.db, eventBus));

		// Q1 §6.1: session activity buffer — subscribe to tool_call_recorded events
		// and expose recent activity via GET /api/sessions/:id/activity.
		// @lore Q1: The buffer is created once per app instance, started immediately,
		// and disposed with the app. Tests that emit events against the same eventBus
		// instance will see the buffer populated correctly.
		const activityBuffer = new SessionActivityBuffer(eventBus);
		activityBuffer.start();
		api.route(
			"/sessions",
			createSessionRoutes(options.db, eventBus, activityBuffer, {
				adapterPool: options.adapterPool,
				workspaceAdapter: options.workspaceAdapter,
				sandboxBasePath: options.sandboxBasePath,
				credentialResolver: options.credentialResolver,
				mcpBridgeRegistry: options.mcpBridgeRegistry,
				mcpBaseUrl: options.mcpBaseUrl,
				// AN2: thread the already-constructed scResolver (encapsulates serverSecret).
				// This is the same resolver used by filesystem routes — constructed once at :416.
				serviceConnectionResolver: scResolver,
			}),
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
		api.route("/git-export", createGitExportRoutes(options.db));
		api.route("/credentials", createCredentialRoutes(options.db));
		// AN1: per-user service connections (token | mcp | inherited projected)
		api.route("/connections", createConnectionRoutes(options.db, options.adapterPool));
		api.route("/hint-progress", createHintRoutes(options.db));
		// AD2: Dispatch queue observer — GET /api/dispatch-queue
		api.route("/dispatch-queue", createDispatchQueueRoutes());
		api.route("/search", createSearchRoutes(options.db, eventBus));
		// O3: defaultNotificationAdapterFactory moved to @hyperidle/fabric (imported at top).
		// Tests may override via notificationAdapterFactory for route-level adapter injection.
		api.route(
			"/notifications",
			createNotificationRoutes(options.db, {
				adapterFactory: options.notificationAdapterFactory ?? defaultNotificationAdapterFactory,
			}),
		);

		// Observability dispatcher (H3). Constructed lazily so tests can
		// spin up apps without needing a configured adapter; the /status
		// route reports "disabled" when no dispatcher is attached.
		//
		// PATCH /config rebuilds the dispatcher in place so credential
		// rotation, adapter switches, and enable/disable transitions take
		// effect without a process restart (security M-3, architect C1,
		// adversary WARN).
		let observabilityDispatcher: ObservabilityDispatcher | null = null;
		let observabilityUnsubscribe: (() => void) | null = null;
		const db = options.db;
		const resolver = createDbTraceIdResolver(db);

		function buildDispatcher(cfg: ObservabilityConfig): ObservabilityDispatcher | null {
			const adapter = cfg.enabled
				? (options?.observabilityAdapter ?? buildObservabilityAdapter(cfg))
				: null;
			if (!(cfg.enabled && adapter)) return null;
			return createObservabilityDispatcher({
				adapter,
				config: {
					batchSize: cfg.batchSize,
					flushIntervalMs: cfg.flushIntervalMs,
					bufferCap: cfg.bufferCap,
				},
			});
		}

		function wireObservability(cfg: ObservabilityConfig): void {
			// Tear down the previous subscription + dispatcher first so we
			// never run two subscribers against the same bus.
			if (observabilityUnsubscribe) {
				observabilityUnsubscribe();
				observabilityUnsubscribe = null;
			}
			const previous = observabilityDispatcher;
			observabilityDispatcher = buildDispatcher(cfg);
			if (observabilityDispatcher) {
				const dispatcher = observabilityDispatcher;
				observabilityUnsubscribe = registerObservabilityDispatcher(eventBus, {
					dispatcher,
					resolver,
				});
			}
			if (previous) {
				// Drain + release the old adapter. Fire-and-forget: we must
				// not block the PATCH route on an outbound adapter flush.
				void previous.dispose();
			}
		}

		const obsCfg = await readObservabilityConfig(db);
		wireObservability(obsCfg);

		api.route(
			"/observability",
			createObservabilityRoutes(db, {
				getDispatcher: (): ObservabilityDispatcher | null => observabilityDispatcher,
				onConfigChange: wireObservability,
			}),
		);

		const disposers: Array<() => void> = [];

		// O3: strategy-layer services are wired via strategyBootstrap (if provided).
		// Kernel-only mode (strategyBootstrap: undefined) skips all strategy handlers.
		// @lore O3: This replaces 7 hardwired register* calls; the kernel/strategy
		// boundary is now enforced by the package dependency graph.
		const strategyDisposers = options.strategyBootstrap?.({ db, eventBus }) ?? [];
		disposers.push(...strategyDisposers);

		// AD8b AC-3: Register assistant dispatcher — listens for thread_message_appended
		// from human users in user-hosted threads and triggers the assistant agent.
		const unsubAssistant = registerAssistantDispatcher(eventBus, db);
		disposers.push(unsubAssistant);

		// AD5 AC-2: Auto-unblock dependent tasks when a task transitions to "done".
		// @lore AD5 option-A: handler lives in app.ts (server layer) — fabric cannot
		// import from server (layer violation). checkAndUnblockDependents is already
		// in the server package so no cross-package dependency issue exists here.
		const unsubDepWatcher = eventBus.on("task_state_changed", (event) => {
			if (event.toState === "done") {
				void checkAndUnblockDependents(db, eventBus, event.taskId).catch((err) => {
					appLogger.error("[dep-watcher] unblock failed for task", {
						taskId: event.taskId,
						error: err instanceof Error ? err.message : String(err),
					});
				});
			}
		});
		disposers.push(unsubDepWatcher);

		disposers.push(() => {
			activityBuffer.stop();
		});

		disposers.push(() => {
			if (observabilityUnsubscribe) {
				observabilityUnsubscribe();
				observabilityUnsubscribe = null;
			}
			const d = observabilityDispatcher;
			observabilityDispatcher = null;
			if (d) void d.dispose();
		});
		APP_DISPOSERS.set(app, disposers);
	}

	// 404 handler for unknown /api routes
	api.notFound((c) => {
		const response: ApiErrorResponse = {
			error: "Not found",
			code: API_ERROR_CODES.NOT_FOUND,
		};
		return c.json(response, 404);
	});

	app.route("/api", api);

	// Top-level 404 handler for all unmatched routes
	app.notFound((c) => {
		// Check if this is an /api route
		if (c.req.path.startsWith("/api")) {
			const response: ApiErrorResponse = {
				error: "Not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}
		return c.text("404 Not Found", 404);
	});

	return app;
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

export { createApp };
