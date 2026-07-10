import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ServerType, serve, upgradeWebSocket } from "@hono/node-server";
import {
	createPgliteDb,
	createPostgresDb,
	type DbHandle,
	type HyperIdleDb,
	resolveProfile,
} from "@hyperidle/db";
import { EventBus, type ModelTier, type ResolvedModel } from "@hyperidle/shared";
import { WebSocketServer } from "ws";
import { createApp, disposeApp } from "./app.js";
import { bootstrapAppRuntime } from "./app-runtime/bootstrap.js";
import { createGitRunner } from "./app-runtime/services/git-export-runner.js";
import {
	setAgentSessionRequestConsumerFn,
	setAgentSessionRequestCreateFn,
	setProvisionSessionFn,
} from "./app-runtime/services/provision-registry.js";
import { RegistryFilesystemMounter } from "./filesystem/mounter-registry.js";
import { type AdapterPool, createLocalAdapterPool } from "./harness/adapter-pool.js";
import { DisabledSandboxAdapter } from "./harness/disabled-sandbox-adapter.js";
import { LocalSandboxAdapter } from "./harness/local-sandbox-adapter.js";
import { enforcementRegistry } from "./harness/return-enforcement-registry.js";
import type { SandboxAdapter } from "./harness/sandbox-adapter.js";
import { createMcpBridgeRegistry } from "./mcp/mcp-bridge-registry.js";
import { createMcpRoute } from "./routes/mcp-route.js";
import { registerWorkerWsRoute } from "./routes/worker-ws.js";
import { registerWsRoute } from "./routes/ws.js";
import { executeAgentRunRequest } from "./services/agent-run-boundary.js";
import { createAgentSessionRequest } from "./services/agent-session-requests.js";
import type { AssistantTurnDeps } from "./services/assistant-turn.js";
import { resolveOrphanedDecompositions } from "./services/bet-decomposition.js";
import { registerBetDecomposition } from "./services/bet-decomposition-subscriber.js";
import { getServerSecret } from "./services/credential-encryption.js";
import type { CredentialResolver } from "./services/credential-resolver.js";
import { DbCredentialResolver } from "./services/credential-resolver.js";
import { resolveModelTier } from "./services/model-gateway.js";
import { projectProductionConfigurationDefaults } from "./services/plugin-configuration.js";
import { migrateCredentialsToStore, readServerConfig } from "./services/server-config.js";
import { provisionSession } from "./services/session-provisioning.js";
import { createTriggeredAgentSessionRequest } from "./services/trigger-resolution.js";
import { createDbSubscribeAuthorizer, WsBroadcaster } from "./services/ws-broadcaster.js";

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
 * AF7 §1 / §14.3: test-only dependency overrides for `createServer`. Lets an
 * integration test inject a stub adapter pool + workspace adapter + a migrated
 * fixture DB so the production boot wire (dispatcher registration) runs without a
 * real LLM or a throwaway unmigrated DB.
 *
 * @lore AF7 §1: this widens a production entry point for tests ONLY — production
 * call sites pass nothing and `createServer` constructs the real DB + adapter
 * pool. The optional branch is reached by af7-dispatch-wiring.integration.test.ts,
 * so knip does not flag it as dead. Mirrors createApp's existing SessionRouteDeps
 * DI pattern.
 */
export interface CreateServerDeps {
	readonly db?: HyperIdleDb;
	readonly adapterPool?: AdapterPool;
	readonly workspaceAdapter?: SandboxAdapter;
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

export async function createServer(port: number, deps?: CreateServerDeps): Promise<ServerHandle> {
	// AF7 §1: when a test injects `deps.db`, use the migrated fixture DB and do NOT
	// construct/own a throwaway DB. Production passes nothing → real DB + close.
	let dbHandle: DbHandle | null = null;
	let db: HyperIdleDb;
	if (deps?.db) {
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
	await migrateCredentialsToStore(db);
	// AU2: Project existing first-party behavior into the editable configuration
	// model on production boot. This keeps registered tools, builtin harness
	// metadata, and legacy rows queryable through the new resolver without moving
	// runtime ownership away from existing services.
	await projectProductionConfigurationDefaults(db);
	// AF7 §1: test-only overrides for the adapter pool + workspace adapter + base
	// path so the dispatcher wire can run against a stub pool (no real LLM).
	const adapterPool = deps?.adapterPool ?? (await createLocalAdapterPool());
	// Server profiles (production, non-laptop) run no agents — LocalSandboxAdapter
	// refuses to construct there. Use a disabled no-op adapter so the server boots;
	// it fails loudly only if something actually tries to provision a sandbox.
	const isServerProfile =
		process.env.NODE_ENV === "production" &&
		(process.env.HYPERIDLE_PROFILE ?? "laptop") !== "laptop";
	const workspaceAdapter =
		deps?.workspaceAdapter ??
		(isServerProfile ? new DisabledSandboxAdapter() : new LocalSandboxAdapter());
	const sandboxBasePath =
		deps?.sandboxBasePath ??
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

	// AF7/AU3: register app-owned session request consumers for dispatcher paths.
	setProvisionSessionFn(provisionSession);
	setAgentSessionRequestCreateFn(async (requestDb, input) => {
		if ("eventType" in input && "defaultAgentId" in input) {
			const { request } = await createTriggeredAgentSessionRequest(requestDb, input);
			return request;
		}
		return createAgentSessionRequest(requestDb, input);
	});
	setAgentSessionRequestConsumerFn(executeAgentRunRequest);

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
		sandbox: workspaceAdapter,
		sandboxBasePath,
		resolveModel: makeResolveModel(db, credentialResolver),
	});

	// X2: Create the MCP bridge registry that maps session tokens to transport instances.
	const mcpBridgeRegistry = createMcpBridgeRegistry();
	const mcpBaseUrl = `http://localhost:${port}`;

	// AH6 B3 (R-1): Build assistantTurnDeps from the already-constructed adapterPool
	// + credentialResolver so the message→turn trigger fires in production.
	// When assistantTurnDeps is absent from createApp, POST /api/threads/:id/messages
	// stores the message but never calls runAssistantTurn — the silent no-op that
	// caused the inert Assistant. This additive wiring closes R-1 without changing
	// any other app behaviour.
	//
	// @lore AH6 B3: deps.assistantTurnDeps can override (test-only) if the caller
	// needs to inject a stub. Production always uses the constructed deps here.
	const assistantTurnDeps = deps?.assistantTurnDeps ?? {
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
		serviceBootstrap: (ctx) =>
			bootstrapAppRuntime({
				...ctx,
				// AF6/AU1: production boots the routine scheduler at the default
				// 30s cadence. Runtime deps are present, so generic routine fires
				// enter through AgentSessionRequest instead of stub sessions.
				readAlertPreferences: async () => {
					const cfg = await readServerConfig(db);
					return {
						blockerAlerts: cfg.notifications.blockerAlerts,
						costAlerts: cfg.notifications.costAlerts,
						reviewAlerts: cfg.notifications.reviewAlerts,
						quietHoursEnabled: cfg.notifications.quietHoursEnabled,
						quietHoursStart: cfg.notifications.quietHoursStart,
						quietHoursEnd: cfg.notifications.quietHoursEnd,
					};
				},
				// AF7 §1: feed the task dispatcher's injection seam. App runtime bootstrap
				// forwards this to registerTaskDispatcher; without it the dispatcher
				// never registers and a ready task never gets a session (Z8-004).
				// The TaskDispatcherDeps fields already exist — no fabric type change.
				dispatcherDeps: {
					adapterPool,
					workspace: workspaceAdapter,
					sandboxBasePath,
					resolveModel: makeResolveModel(db, credentialResolver),
					mcpBridgeRegistry,
					mcpBaseUrl,
					// AO2: pass the production mounter so routine-dispatched sessions mount.
					mounter,
				},
			}),
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
			const broadcaster = new WsBroadcaster(eventBus, createDbSubscribeAuthorizer(db));
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
