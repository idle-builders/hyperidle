import {
	type CredentialResolver,
	deleteCredential,
	readCredentials,
	ServiceConnectionResolver,
	writeCredential,
} from "@hyperidle/connections";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import type { AdapterPool, McpToolBridge, SandboxAdapter } from "@hyperidle/harness-registry";
import type { NotificationAdapter, NotificationsDeps } from "@hyperidle/notifications";
import { getTeamMembers } from "@hyperidle/org";
import { enqueueWorkIntent, findSessionRequest } from "@hyperidle/session-requests";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES, createLogger, EventBus } from "@hyperidle/shared";
import { decryptCredentialValue, encryptCredentialValue } from "@hyperidle/shared/crypto";
import { failClosedAssertion, type HyperIdleEnv } from "@hyperidle/shared/http";
import { createUpgradeTokenStore, findUser, type UpgradeTokenStore } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { checkAndUnblockDependents } from "@hyperidle/work";
import { Hono } from "hono";
import { authMiddleware, createAuthMiddleware } from "./middleware/auth.js";
import { createBodyLimit } from "./middleware/body-limit.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createRateLimiter } from "./middleware/rate-limit.js";
import { type ObservabilityDeps, startObservability } from "./observability-runtime.js";
import { createAgentRoutes } from "./routes/agents.js";
import { createArtifactRoutes } from "./routes/artifacts.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createPublicAuthRoutes } from "./routes/auth-public.js";
import { createBetRoutes } from "./routes/bets.js";
import { createConnectionRoutes } from "./routes/connections.js";
import { createConversationRoutes } from "./routes/conversations.js";
import { createCredentialRoutes } from "./routes/credentials.js";
import { createFilesystemRoutes } from "./routes/filesystems.js";
import { createGitExportRoutes } from "./routes/git-export-routes.js";
import { createHarnessRoutes } from "./routes/harnesses.js";
import { authHealth, health } from "./routes/health.js";
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
import { registerTestRoutes } from "./routes/test-routes.js";
import { createThreadRoutes } from "./routes/threads.js";
import { createUserRoutes, createUserSetupRoute } from "./routes/users.js";
import { createWorkersRoutes } from "./routes/workers.js";
import {
	createInProcessAgentOrchestrationTransport,
	registerAgentOrchestrationTransport,
} from "./services/agent-orchestration-port-composition.js";
import { taskRunResolverDeps } from "./services/task-run-resolver-bindings.js";

const agentWorkIntentRecorder = { record: enqueueWorkIntent };
const agentWorkIntentReader: import("@hyperidle/shared").AgentWorkIntentReader<HyperIdleDb> = {
	findByKindAndSource: (db, kind, sourceId) =>
		findSessionRequest(db, { by: "intentSource", kind, sourceId }),
};

/**
 * The minimal shape a route needs to push data onto the WS connection hub —
 * satisfied by `WsConnectionHub.broadcast(topic, data)` (`@hyperidle/realtime`)
 * without this module depending on that package's full class (same narrow-
 * interface pattern as `session-activity-gateway.ts`'s `SessionActivityBroadcastTarget`).
 */
export interface WsPushTarget {
	broadcast(topic: string, data: string): void;
}

/**
 * A booted Layer the Application mounts inside this app's `/api` router.
 * Structural on purpose: `core-api` declares the shape it consumes rather than
 * importing `@hyperidle/agent-orchestration`'s `AgentOrchestrationBoot`, so
 * nothing in this file names the other Layer at all.
 */
export interface MountedLayer {
	/** Mounted AFTER the auth middleware, at the `/api` root. */
	readonly app: Hono<HyperIdleEnv>;
	/** Registered BEFORE the auth middleware (the worker WS upgrade). */
	readonly registerPreAuthRoutes?: (apiRouter: Hono) => void;
	/** Torn down by `disposeApp`. */
	readonly dispose?: () => void;
}

interface AppOptions {
	db?: HyperIdleDb;
	eventBus?: EventBus;
	serviceBootstrap?: (ctx: { db: HyperIdleDb; eventBus: EventBus }) => Array<() => void>;
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
	 * AU26 B1a (§D-B): the OTHER Layer's booted app, handed in by the Application.
	 *
	 * `core-api` never constructs it, never imports its route modules (AC5(a),
	 * enforced by `scripts/composition-edge-anti-regrowth-guard.ts`) and knows
	 * nothing about what it serves — it receives an opaque `Hono` plus two
	 * callbacks, exactly like `registerWebSocket`/`registerMcpRoute`. The
	 * Application decides to put another Layer behind this stack; only an
	 * Application may.
	 *
	 * @lore AU26 B1a: this option replaces `registerWorkerWebSocket`, which was a
	 * core-api-shaped hook for an orchestration-owned socket. B1b inverts the
	 * relationship entirely — the Application will own the `/api` router and
	 * mount both apps itself, at which point this option disappears.
	 */
	agentOrchestration?: MountedLayer;
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
	mcpBridgeRegistry?: McpToolBridge;
	/**
	 * X2: Base URL for MCP bridge (e.g., "http://localhost:3001").
	 * Used when writing `.mcp.json` to the workspace during session provisioning.
	 */
	mcpBaseUrl?: string;
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
	 * AO2: Optional filesystem mounter. When present, mount + captureBack hooks
	 * run around each session. When absent, sessions run without filesystem mount.
	 */
	mounter?: import("@hyperidle/shared").FilesystemMounter;
	/**
	 * AU19 §11 (AC-9): Application-injected cross-Layer `agent_work_intents`
	 * recorder/reader (`@hyperidle/shared`-typed, Mechanism C) — the
	 * `agent-orchestration`/`session-requests` Layer boundary
	 * `routes/threads.ts`/`routes/sessions-routes.ts` (core-api routes) must
	 * not cross by importing `@hyperidle/session-requests` directly. Defaults
	 * to the real production binding (`durable-agent-queue.ts`); tests
	 * may override for isolation.
	 */
	agentWorkIntentRecorder?: import("@hyperidle/shared").AgentWorkIntentRecorder<HyperIdleDb>;
	agentWorkIntentReader?: import("@hyperidle/shared").AgentWorkIntentReader<HyperIdleDb>;
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
 * Create `core-api`'s Hono application.
 *
 * WebSocket routes are registered separately via registerWsRoute(), injected
 * through the `registerWebSocket` option so the app remains runtime-agnostic.
 *
 * @lore AU26 B1a: renamed from `createApp`. It is no longer *the* app — it is
 * one of two, beside `bootAgentOrchestration().app`. It still applies the
 * middleware stack and owns the `/api` router at this increment; B1b lifts both
 * into the Application (`remote-server/src/create-server.ts`) and this function
 * shrinks to core-api's own route table.
 */
async function createCoreApiApp(options?: AppOptions): Promise<Hono> {
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

	// AU26 B1a: the mounted Layer's own pre-auth routes (the worker WS upgrade —
	// workers authenticate via HYPERIDLE_WORKER_TOKEN on the query string, not
	// via the user API key). Registered BEFORE the auth middleware, same
	// placement pattern as the user WS route.
	options?.agentOrchestration?.registerPreAuthRoutes?.(api);

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
		const scResolver = new ServiceConnectionResolver(options.db);
		api.route("/filesystems", createFilesystemRoutes(options.db, eventBus, scResolver));
		api.route("/knowledge", createKnowledgeRoutes(options.db, eventBus));
		api.route("/team-members", createTeamMembersRoutes(options.db));
		api.route("/settings", createSettingsRoutes(options.db, eventBus));
		api.route("/settings/agent-behavior", createAgentBehaviorSettingsRoutes(options.db));
		api.route("/conversations", createConversationRoutes(options.db, eventBus));
		api.route(
			"/threads",
			createThreadRoutes(
				options.db,
				eventBus,
				options.agentWorkIntentRecorder ?? agentWorkIntentRecorder,
				options.wsHub,
			),
		);
		api.route("/users", createUserRoutes(options.db, eventBus, options.adapterPool));
		api.route("/org", createOrgRoutes(options.db));
		api.route("/routines", createRoutineRoutes(options.db, eventBus));
		api.route("/recipients", createRecipientRoutes(options.db, eventBus));

		// AU26 B1a (§D-H #16): `POST /api/sessions` is all that is left of this
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
			createSessionRoutes(
				options.db,
				eventBus,
				Boolean(options.adapterPool),
				options.agentWorkIntentRecorder ?? agentWorkIntentRecorder,
				options.agentWorkIntentReader ?? agentWorkIntentReader,
			),
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

		const serviceDisposers = options.serviceBootstrap?.({ db, eventBus }) ?? [];
		disposers.push(...serviceDisposers);

		// AD5 AC-2: Auto-unblock dependent tasks when a task transitions to "done".
		// @lore AD5 option-A: handler lives in app.ts (server layer) — fabric cannot
		// import from server (layer violation). checkAndUnblockDependents relocated
		// to `@hyperidle/work` (AU20 Ag2 barrel collapse) — it exclusively calls
		// work's own table paths, so `work` is its correct home. The `work:` DI-port
		// sub-object is gone; only the against-grain `session-requests` recorder
		// (`workIntents`) remains injected, wired to `enqueueWorkIntent`
		// (migrated Increment 3b, `durable-agent-queue.js`).
		const unsubDepWatcher = eventBus.on("task_state_changed", (event) => {
			if (event.toState === "done") {
				void checkAndUnblockDependents(db, eventBus, event.taskId, {
					workIntents: { record: enqueueWorkIntent },
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

		// AU26 B1a: the mounted Layer's own teardown (its activity buffer + the
		// session-activity gateway) rides this app's disposer bag so a test that
		// builds an app and disposes it tears both Layers down in one call.
		const mountedDispose = options.agentOrchestration?.dispose;
		if (mountedDispose) disposers.push(mountedDispose);

		disposers.push(() => {
			void observabilityRuntime.dispose();
		});
		APP_DISPOSERS.set(app, disposers);
	}

	// AU26 B1a (§D-B): mount the other Layer's app on the SAME `/api` router,
	// AFTER the auth middleware and the fail-closed assertion, so every path
	// string it serves keeps its byte-identical public URL (§D-A rule 7) and
	// sits behind the same stack. `core-api` sees an opaque `Hono` — the
	// Application built it, and only an Application may choose this.
	if (options?.agentOrchestration) {
		api.route("/", options.agentOrchestration.app);
	}

	// 404 handler for unknown /api routes.
	//
	// @lore AU26 B1a (AC10): this handler is UNREACHABLE and deliberately kept
	// as-is rather than "fixed". `api` is itself a sub-app (`app.route("/api",
	// api)` below), and Hono applies a parent's middleware, context vars and
	// `onError` to a mounted sub-app but NOT its `notFound` — only the ROOT
	// app's fires (verified on the installed `hono@4.12.30`,
	// `.pipeline/work/AU26/probes/two-app-mount/`). The canonical JSON 404 for
	// an unknown `/api/*` path therefore comes from `app.notFound` below, and
	// that is what the mounted agent-orchestration app relies on too. A port
	// that moves the branch onto a sub-app turns every unknown `/api/*` into
	// Hono's `text/plain` default.
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

	// AU21 §9 Increment 6 (Decision D): register the in-process
	// `AgentOrchestrationPort` transport here in `createApp` itself — NOT in
	// `server-factory.ts` the way `CoreApiPort`'s write-seam transport is
	// (`core-api-port-composition.ts`'s own `@lore`). That deferral exists
	// because registering a WRITE seam's transport for every test app also
	// activates production event-subscriber side effects tests don't expect
	// (the double-fire hazard). This door is read-only (§12) — carries no
	// event subscriptions and mutates nothing — so there is no equivalent
	// hazard, and registering it unconditionally (no `options?.db` branch —
	// keeps this function's already-over-budget cognitive complexity from
	// growing further) means every `createApp` caller, including a db-less
	// app, gets a working `getRegisteredAgentOrchestrationTransport()`. A
	// db-less app never mounted `/agent-orchestration/sessions/*`, so the
	// transport just 404s through this app's own top-level not-found handler
	// if anything ever called it — never reached in practice.
	registerAgentOrchestrationTransport(createInProcessAgentOrchestrationTransport(app));

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

export { createCoreApiApp };
