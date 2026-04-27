import { actors, type HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES, createLogger, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createUpgradeTokenStore, type UpgradeTokenStore } from "./auth/upgrade-token-store.js";
import { type ActorEnv, createActorContextMiddleware } from "./middleware/actor-context.js";
import { authMiddleware } from "./middleware/auth.js";
import { createBodyLimit } from "./middleware/body-limit.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createRateLimiter } from "./middleware/rate-limit.js";
import { createAgentRoutes } from "./routes/agents.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createBetRoutes } from "./routes/bets.js";
import { createConversationRoutes } from "./routes/conversations.js";
import { createGitExportRoutes } from "./routes/git-export-routes.js";
import { health } from "./routes/health.js";
import { createKnowledgeRoutes } from "./routes/knowledge.js";
import { meRoutes } from "./routes/me.js";
import { createNotificationRoutes } from "./routes/notifications-routes.js";
import { createObservabilityRoutes } from "./routes/observability-routes.js";
import { createRailRoutes } from "./routes/rail.js";
import { createRoutineRoutes } from "./routes/routines-routes.js";
import { createSessionRoutes } from "./routes/sessions-routes.js";
import { createStatusRoutes } from "./routes/status.js";
import { createSystemStabilityRoutes } from "./routes/system-stability.js";
import { createTaskRoutes } from "./routes/tasks.js";
import { registerTestRoutes } from "./routes/test-routes.js";
import { createThreadRoutingRoutes } from "./routes/threads.js";
import { registerBuiltinRoutineHandlers } from "./services/builtin-routines.js";
import { registerCostCapDedupReleaser } from "./services/cost-cap.js";
import { registerGitExportHandler } from "./services/git-export.js";
import { createGitRunner } from "./services/git-export-runner.js";
import type { NotificationConfig } from "./services/notifications/config.js";
import { createConsoleAdapter } from "./services/notifications/console-adapter.js";
import { registerNotificationDispatcher } from "./services/notifications/dispatcher.js";
import { createNtfyAdapter } from "./services/notifications/ntfy-adapter.js";
import { createSmtpAdapter } from "./services/notifications/smtp-adapter.js";
import type { NotificationAdapter } from "./services/notifications/types.js";
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
import { createLangfuseObservabilityAdapter } from "./services/observability/langfuse-adapter.js";
import type {
	ObservabilityAdapter,
	ObservabilityDispatcher,
} from "./services/observability/types.js";
import { registerPolicyEngine } from "./services/policy-engine.js";
import { registerSessionReviewCreator } from "./services/session-review-creator.js";

interface AppOptions {
	db?: HyperIdleDb;
	eventBus?: EventBus;
	/**
	 * Optional override for the git-runner factory used by the
	 * `knowledge_updated` event handler. Tests can substitute a FakeGitRunner
	 * to prove the event-triggered path without spawning `git`.
	 */
	gitRunnerFactory?: (repoPath: string) => ReturnType<typeof createGitRunner>;
	/**
	 * Optional override for the notification adapter factory used by the
	 * dispatcher + HTTP `/notifications/test` + `/notifications/flush`
	 * routes. Tests inject a FakeAdapter that records every send.
	 */
	notificationAdapterFactory?: (cfg: NotificationConfig) => NotificationAdapter;
	/**
	 * Optional override for the observability adapter (H3). Tests inject
	 * a FakeAdapter whose `record` captures every event. When omitted
	 * production wiring picks console or langfuse based on
	 * `factory_settings.observability.adapter`.
	 */
	observabilityAdapter?: ObservabilityAdapter;
	/**
	 * Optional Bun-only WebSocket registration hook. When provided,
	 * `createApp` invokes it with the `/api` sub-router just after the
	 * error handler and public `/api/health` route and BEFORE the
	 * `authMiddleware` catch-all so the WS route can authenticate via
	 * query token. Kept optional so non-Bun integration tests can omit it.
	 *
	 * @lore I1 S1-S5: production `createBunServer` passes this hook so the
	 * same `createApp` instance powers both production and the integration
	 * test harness — no divergent "minimal app" path.
	 */
	registerWebSocket?: (apiRouter: Hono, tokenStore: UpgradeTokenStore) => void;
	/**
	 * Override the upgrade-token store used by `/api/auth/ws-token` and the
	 * WebSocket auth middleware. Tests inject a custom store with a tiny
	 * TTL; production wiring uses `createUpgradeTokenStore()`.
	 */
	upgradeTokenStore?: UpgradeTokenStore;
}

function buildObservabilityAdapter(cfg: ObservabilityConfig): ObservabilityAdapter | null {
	switch (cfg.adapter) {
		case "console":
			return createConsoleObservabilityAdapter();
		case "langfuse": {
			if (!(cfg.langfuse.publicKey && cfg.langfuse.secretKey)) {
				return createConsoleObservabilityAdapter();
			}
			return createLangfuseObservabilityAdapter({
				url: cfg.langfuse.url,
				publicKey: cfg.langfuse.publicKey,
				secretKey: cfg.langfuse.secretKey,
				swallowErrors: true,
			});
		}
		case "noop":
			return null;
	}
}

function defaultNotificationAdapterFactory(cfg: NotificationConfig): NotificationAdapter {
	switch (cfg.primaryChannel) {
		case "ntfy":
			return createNtfyAdapter({
				baseUrl: cfg.ntfy.baseUrl,
				authToken: cfg.ntfy.authToken,
			});
		case "smtp":
			if (!(cfg.smtp.host && cfg.smtp.from)) return createConsoleAdapter();
			return createSmtpAdapter({
				host: cfg.smtp.host,
				port: cfg.smtp.port,
				secure: cfg.smtp.secure,
				username: cfg.smtp.username,
				password: cfg.smtp.password,
				from: cfg.smtp.from,
				ignoreTls: cfg.smtpIgnoreTls,
			});
		default:
			return createConsoleAdapter();
	}
}

/**
 * Disposers returned from `createApp` so tests + graceful shutdown can
 * tear down event-bus subscriptions. Each function is safe to call more
 * than once.
 */
export interface AppDisposer {
	dispose(): void;
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
 * WebSocket routes are registered separately via registerWsRoute() in Bun-only context.
 */
function createApp(options?: AppOptions): Hono {
	const app = new Hono();

	// Backward-compat: /health without auth
	app.route("/", health);

	// ----- /api sub-router -----
	// L2: typed with `ActorEnv` so any route can read `c.get("actorId")` /
	// `c.get("actorRow")` without retrofitting per-router generics. The
	// actor-context middleware (mounted below when `db` is present) is the
	// sole writer; routes that don't need actor context simply don't read.
	const api = new Hono<ActorEnv>();

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
	const rateLimitPerMin = Number.parseInt(process.env.HYPERIDLE_RATE_LIMIT_PER_MIN ?? "60", 10);
	const baseRateLimit =
		Number.isFinite(rateLimitPerMin) && rateLimitPerMin > 0 ? rateLimitPerMin : 60;
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
	// being wired. Apps without a `registerWebSocket` hook (most non-Bun
	// integration tests) never expose `/api/auth/ws-token`.
	let tokenStore: UpgradeTokenStore | null = null;
	if (options?.registerWebSocket) {
		tokenStore = options.upgradeTokenStore ?? createUpgradeTokenStore();
		// Register the WS route BEFORE the auth middleware: WS upgrades
		// authenticate via a one-shot upgrade token (`?token=...`) in a
		// middleware defined inside `registerWsRoute`.
		options.registerWebSocket(api, tokenStore);
	}

	// Auth middleware for all other /api routes (except /health above)
	api.use("*", authMiddleware);

	// I2 A3 + review O6: ws-token issuance lives behind the standard auth
	// middleware so the master HYPERIDLE_API_KEY mints a one-shot upgrade
	// token. The dedicated `authMintLimiter` overrides the base API
	// limiter so a reconnect storm doesn't drain the API bucket.
	if (tokenStore) {
		api.use("/auth/*", authMintLimiter);
		api.route("/auth", createAuthRoutes(tokenStore));
	}

	// Register test routes only in non-production environments
	if (process.env.NODE_ENV !== "production") {
		registerTestRoutes(api);
	}

	// Register work endpoints if db is provided
	if (options?.db) {
		const eventBus = options.eventBus ?? new EventBus();

		// L2: actor-context middleware resolves `X-Actor-Id` (or env
		// fallback) into a row in `actors` and stashes it on the request
		// context. Mounted after auth so unauthenticated callers never
		// trigger a DB lookup. Mounted before route handlers so
		// `c.get("actorId")` is always defined within route logic.
		api.use("*", createActorContextMiddleware(options.db));

		// L2 review (security WARN-1): validate the env fallback resolves
		// to a real actor at boot. Don't fail-fast — env may be set
		// before the DB is migrated in some flows — but log a clear
		// startup warning so the operator notices a typo or stale value
		// before every request 404s.
		const envDefault = process.env.HYPERIDLE_DEFAULT_ACTOR_ID;
		if (envDefault && envDefault.length > 0) {
			try {
				const row = options.db.select().from(actors).where(eq(actors.id, envDefault)).get();
				if (!row) {
					appLogger.warn("HYPERIDLE_DEFAULT_ACTOR_ID does not match any actor row", {
						envDefault,
					});
				}
			} catch {
				// DB not yet migrated — defer the check to first request.
			}
		}

		api.route("/me", meRoutes);
		api.route("/threads", createThreadRoutingRoutes(options.db));
		api.route("/bets", createBetRoutes(options.db, eventBus));
		api.route("/tasks", createTaskRoutes(options.db, eventBus));
		api.route("/knowledge", createKnowledgeRoutes(options.db, eventBus));
		api.route("/rail", createRailRoutes(options.db, eventBus));
		api.route("/conversations", createConversationRoutes(options.db, eventBus));
		api.route("/agents", createAgentRoutes(options.db, eventBus));
		api.route("/routines", createRoutineRoutes(options.db, eventBus));
		api.route("/sessions", createSessionRoutes(options.db, eventBus));
		api.route("/status", createStatusRoutes(options.db));
		// L8: dedicated system-stability aggregate (crashed_sessions, cap_reached,
		// api_degraded). Polled by the Rail at ≤ 30s cadence (client-throttled).
		api.route("/system", createSystemStabilityRoutes(options.db));
		api.route("/git-export", createGitExportRoutes(options.db));
		const adapterFactory = options.notificationAdapterFactory ?? defaultNotificationAdapterFactory;
		api.route("/notifications", createNotificationRoutes(options.db, { adapterFactory }));

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
				// not block the PATCH route on an outbound Langfuse flush.
				void previous.dispose();
			}
		}

		const obsCfg = readObservabilityConfig(db);
		wireObservability(obsCfg);

		api.route(
			"/observability",
			createObservabilityRoutes(db, {
				getDispatcher: (): ObservabilityDispatcher | null => observabilityDispatcher,
				onConfigChange: wireObservability,
			}),
		);

		const disposers: Array<() => void> = [];
		disposers.push(registerSessionReviewCreator(db, eventBus));
		disposers.push(registerPolicyEngine(db, eventBus));
		disposers.push(registerBuiltinRoutineHandlers(db, eventBus));
		// I3 review C1 / arch H-1: drop cost-cap dedup-map entries on every
		// session_ended event (graceful end, crash, client PATCH). Single
		// chokepoint keeps the per-session map bounded across the factory's
		// lifetime — see services/cost-cap.ts for context.
		disposers.push(registerCostCapDedupReleaser(eventBus));
		disposers.push(
			registerGitExportHandler(db, eventBus, {
				runnerFactory: options.gitRunnerFactory ?? ((repoPath) => createGitRunner(repoPath)),
			}),
		);
		disposers.push(registerNotificationDispatcher(db, eventBus, { adapterFactory }));
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

const app = createApp();

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
export { app, createApp };
