/**
 * `desktop`'s own composition root (AU31 §5.3).
 *
 * @lore AU31 §5.3: `desktop` used to boot its embedded server by importing
 * `@hyperidle/remote-server/create-server` — an `application → application`
 * crossing (forbidden: a composition root reaches a layer's public face,
 * never another application). No third neutral composition package exists
 * either (AU26 ruling, upheld), so this file duplicates
 * `applications/remote-server/src/create-server.ts`'s recipe rather than
 * sharing it: same three layer-face boots (`bootAgentExecution` →
 * `bootCoreApi` → `bootAgentOrchestration`), same `@hyperidle/http-middleware`
 * `composeApiApplication` mount helper (the ONE piece that genuinely is
 * shared — it names no layer), same disposal ordering. Only the environment
 * facts differ: `topology: "local"` (in-process CLI harness discovery, a real
 * local sandbox — `desktop` runs agents on the user's own machine) and
 * `hostname: "127.0.0.1"` (S-9.2: the desktop app is never reachable from the
 * local network).
 *
 * If the two composition roots' recipes ever need to diverge further, that is
 * the point of duplicating them: each Application owns its own boot sequence
 * outright, with no shared module for a drift to hide behind.
 */

import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { type ServerType, serve, upgradeWebSocket } from "@hono/node-server";
import { bootAgentExecution } from "@hyperidle/agent-execution";
import {
	type ApplicationProvisionSessionDeps,
	bootAgentOrchestration,
	createInProcessCoreApiTransport,
	type RunOrchestrationHarnessRuntimeAdapter,
	type RunOrchestrationReturnStatusToolAdapter,
} from "@hyperidle/agent-orchestration";
import {
	buildAgentOrchestrationPort,
	createInProcessAgentOrchestrationTransport,
	DEFAULT_REAPER_STALE_AFTER_MS,
	health,
	registerAgentLayerServices,
	registerCoreDomainServices,
} from "@hyperidle/core-api";
import { disposeApp, registerAppDisposers } from "@hyperidle/core-api/app";
import { bootCoreApi } from "@hyperidle/core-api/boot";
import type { CredentialResolver } from "@hyperidle/credential-access";
import { createPgliteDb, createPostgresDb, type DbHandle, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { resolveProfile } from "@hyperidle/host-process";
import { composeApiApplication } from "@hyperidle/http-middleware";
import { WebSocketServer } from "ws";
// @lore AU26: `ws` ships NO type declarations of its own — see
// `applications/remote-server/src/create-server.ts`'s twin `@lore` for the
// full CI-vs-local reproduction story. `@types/ws` lives in this package's
// devDependencies alongside the `ws` runtime dependency for the same reason.

export interface CreateServerDeps {
	readonly db?: HyperIdleDb;
	readonly topology: "local" | "disabled";
	readonly sandboxBasePath?: string;
	readonly hostname?: string;
}

/**
 * @lore AH1 §3 / N1: same shape as `remote-server`'s own `ServerHandle` — see
 * that file's doc comment for why `credentialResolver` rides the handle, and
 * why its type comes from `@hyperidle/credential-access` rather than
 * `@hyperidle/credentials`.
 */
export interface ServerHandle {
	readonly httpServer: ServerType;
	readonly dispose: () => Promise<void>;
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

function createStaticHandler(
	dir: string,
	appFetch: (req: Request, env?: unknown) => Response | Promise<Response>,
): (req: Request, env?: unknown) => Response | Promise<Response> {
	const indexPath = path.join(dir, "index.html");

	return (req: Request, env?: unknown): Response | Promise<Response> => {
		const url = new URL(req.url);
		if (url.pathname.startsWith("/api")) {
			return appFetch(req, env);
		}
		const filePath = path.join(dir, url.pathname);
		if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
			const ext = path.extname(filePath);
			return new Response(fs.readFileSync(filePath), {
				headers: { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" },
			});
		}
		return new Response(fs.readFileSync(indexPath), {
			headers: { "Content-Type": "text/html" },
		});
	};
}

/**
 * @lore CWD-mismatch: same reasoning as `remote-server`'s twin — resolve a
 * relative PGlite path against the repo root, not the process CWD.
 */
function resolvePglitePath(rawPath: string): string {
	if (rawPath === ":memory:" || path.isAbsolute(rawPath)) {
		return rawPath;
	}
	const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
	return path.resolve(repoRoot, rawPath);
}

/**
 * Resolve a concrete OS-assigned loopback port by briefly binding `:0`, reading
 * the assigned port, then releasing it. Used so `mcpBaseUrl` can carry the real
 * port BEFORE `serve()` binds — the CLI-harness MCP bridge dials that URL.
 */
async function resolveFreeLoopbackPort(hostname: string | undefined): Promise<number> {
	return await new Promise<number>((resolve, reject) => {
		const probe = net.createServer();
		probe.once("error", reject);
		probe.listen(0, hostname ?? "127.0.0.1", () => {
			const address = probe.address();
			const resolvedPort = typeof address === "object" && address !== null ? address.port : 0;
			probe.close((closeErr) => (closeErr ? reject(closeErr) : resolve(resolvedPort)));
		});
	});
}

export async function createServer(port: number, deps: CreateServerDeps): Promise<ServerHandle> {
	// @lore AU31 §8 overlap 1 (AU29's own db:util handoff): kept byte-for-byte
	// identical to `remote-server`'s own DB-open block — see that file's
	// matching `@lore`.
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

	const hasSecret = Boolean(process.env.HYPERIDLE_CREDENTIAL_KEY ?? process.env.HYPERIDLE_API_KEY);
	if (!hasSecret) {
		// biome-ignore lint/suspicious/noConsole: intentional boot-time warning before observability adapter is constructed
		console.warn(
			"[HyperIdle] No HYPERIDLE_CREDENTIAL_KEY/HYPERIDLE_API_KEY set — credential writes will be refused (MISSING_ROOT_SECRET). Agents cannot resolve keys until a secret is configured.",
		);
	}

	const sandboxBasePath =
		deps.sandboxBasePath ??
		process.env.HYPERIDLE_WORKSPACES_DIR ??
		path.join(os.tmpdir(), "hyperidle-workspaces");
	// `mcpBaseUrl` must carry the REAL listening port: CLI harnesses dial
	// `${mcpBaseUrl}/api/mcp/:token` for their tool bridge. `serve()` binds
	// further below, so when the caller asks for an OS-assigned port (0) we
	// resolve a concrete free loopback port up front and use it for BOTH the
	// bridge URL and the listener. Otherwise `mcpBaseUrl` would be
	// `http://…:0` — an unreachable bridge, leaving every CLI-harness session
	// with no HyperIdle MCP tools.
	const mcpHost = deps.hostname ?? "localhost";
	const listenPort = port === 0 ? await resolveFreeLoopbackPort(deps.hostname) : port;
	const mcpBaseUrl = `http://${mcpHost}:${listenPort}`;

	const agentExecution = await bootAgentExecution({ topology: deps.topology, mcpBaseUrl });

	// @lore AU31 §3.2: the transport TYPE is derived from the layer face
	// function's own signature rather than imported by name from
	// `@hyperidle/api-contract` — see `remote-server`'s twin `@lore`.
	let realCoreApiTransport: ReturnType<typeof createInProcessCoreApiTransport> | undefined;
	const coreApiTransport: ReturnType<typeof createInProcessCoreApiTransport> = async (req) => {
		if (!realCoreApiTransport) {
			throw new Error("CoreApiPort transport called before the composed app was built.");
		}
		return realCoreApiTransport(req);
	};
	let realAgentOrchestrationTransport:
		| Parameters<typeof buildAgentOrchestrationPort>[0]
		| undefined;
	const agentOrchestrationTransport: Parameters<typeof buildAgentOrchestrationPort>[0] = async (
		req,
	) => {
		if (!realAgentOrchestrationTransport) {
			throw new Error("AgentOrchestrationTransport called before the composed app was built.");
		}
		return realAgentOrchestrationTransport(req);
	};
	const agentOrchestrationPort = buildAgentOrchestrationPort(agentOrchestrationTransport);

	// @lore AU36 D5: same deferred-binding idiom as the transports above —
	// `bootCoreApi` runs BEFORE `bootAgentOrchestration`, so the redetect
	// callback closes over a binding filled once the orchestration boot (and
	// thus its `inheritedReach`) exists. Any real redetect happens strictly
	// after that (route handlers only run on the composed app).
	let realInheritedReachRefresh: (() => Promise<void>) | undefined;
	const onHarnessRedetect: () => Promise<void> = () => {
		if (!realInheritedReachRefresh) {
			throw new Error("onHarnessRedetect called before the composed app was built.");
		}
		return realInheritedReachRefresh();
	};

	const coreApi = await bootCoreApi({
		db,
		eventBus,
		agentOrchestration: agentOrchestrationPort,
		upgradeWebSocket,
		adapterPool: agentExecution.adapters.pool,
		onHarnessRedetect,
		serviceBootstrap: (ctx) => {
			return [
				...registerCoreDomainServices({ ...ctx, canProvision: true }),
				...registerAgentLayerServices({ ...ctx, canProvision: true }),
			];
		},
	});

	const harnessRuntimeAdapter: RunOrchestrationHarnessRuntimeAdapter =
		agentExecution.adapters.harnessRuntime;
	const returnStatusToolAdapter: RunOrchestrationReturnStatusToolAdapter = {
		forRegistry: (registry) => agentExecution.adapters.returnStatusTool.forRegistry(registry),
	};

	const runtimeSessionDeps = {
		db,
		eventBus,
		adapterPool: agentExecution.adapters.pool,
		workspace: agentExecution.adapters.sandbox,
	} satisfies ApplicationProvisionSessionDeps;

	if (!coreApi.upgradeTokenStore) {
		// `upgradeWebSocket` is always supplied above, so `bootCoreApi` always
		// builds a token store — this can only fire if that wiring regresses.
		throw new Error(
			"bootCoreApi did not build an upgradeTokenStore despite upgradeWebSocket being supplied.",
		);
	}
	const agentOrchestration = await bootAgentOrchestration({
		db,
		eventBus,
		sessionStream: { upgradeWebSocket, upgradeTokens: coreApi.upgradeTokenStore },
		// AU36 D4: desktop is always topology "local" (boot-server.ts) — boot
		// awaits the initial reach probe, so facts are cached by serve time.
		probeInheritedReach: deps.topology === "local",
		runtime: {
			harnessRuntime: harnessRuntimeAdapter,
			returnStatusTool: returnStatusToolAdapter,
			coreApiTransport,
			session: runtimeSessionDeps,
			sandboxBasePath,
			resolveModel: coreApi.resolveModel,
			worker: {
				pool: agentExecution.adapters.pool,
				// @lore AU31/AU34: passed straight through (not re-wrapped with a
				// named `WorkerRegisterMessage` parameter annotation) — an
				// Application has no declared reach to `@hyperidle/harness-protocol`
				// (governance `crossing-import`); the function value already carries
				// that type, so forwarding it structurally needs no import.
				createWorkerAdapter: agentExecution.adapters.createWorkerAdapter,
			},
			reapers: {
				sandboxes: { sandboxBasePath },
				routines: { staleAfterMs: DEFAULT_REAPER_STALE_AFTER_MS },
			},
			resolveProvisioningOwnerUserId: coreApi.resolveProvisioningOwnerUserId,
		},
	});
	// AU36 D5: close the deferred binding — redetect now reaches the reach cache.
	realInheritedReachRefresh = () => agentOrchestration.inheritedReach.refresh();

	const app = composeApiApplication({
		middleware: coreApi.middleware,
		preAuthRegistrars: [
			coreApi.registerPreAuthRoutes,
			agentOrchestration.registerPreAuthRoutes,
			agentExecution.mountMcpRouter,
		],
		apps: [coreApi.app, agentOrchestration.app],
	});
	// Backward-compat: /health without auth, outside the /api tree.
	app.route("/", health);

	realAgentOrchestrationTransport = createInProcessAgentOrchestrationTransport(app);
	realCoreApiTransport = createInProcessCoreApiTransport(app);

	registerAppDisposers(app, [
		...coreApi.disposers,
		agentOrchestration.dispose,
		agentExecution.dispose,
	]);

	await coreApi.runConfigurationBackfill(agentOrchestration.serviceConnectionsReader);

	// Serve the Electron renderer's built assets when HYPERIDLE_STATIC_DIR is
	// set — `main.ts` sets it before calling `startServer()`.
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

	const wss = new WebSocketServer({ noServer: true });

	const httpServer = serve({
		fetch: staticFetch,
		port: listenPort,
		...(deps.hostname === undefined ? {} : { hostname: deps.hostname }),
		websocket: { server: wss },
	});

	// @lore Binding is only synchronous when NO hostname is given — see
	// `remote-server`'s twin `@lore`. `desktop` always passes a hostname
	// (loopback), so this await is load-bearing here, not defensive.
	await new Promise<void>((resolve, reject) => {
		if (httpServer.listening) {
			resolve();
			return;
		}
		function settle(error?: Error): void {
			httpServer.removeListener("listening", onListening);
			httpServer.removeListener("error", onFailure);
			if (error) reject(error);
			else resolve();
		}
		function onListening(): void {
			settle();
		}
		function onFailure(error: Error): void {
			settle(error);
		}
		httpServer.once("listening", onListening);
		httpServer.once("error", onFailure);
	});

	let disposePromise: Promise<void> | null = null;
	const dispose = (): Promise<void> => {
		if (disposePromise) return disposePromise;
		disposePromise = (async () => {
			const failures: Array<{ phase: string; cause: unknown }> = [];
			const runPhase = async (phase: string, cleanup: () => void | Promise<void>) => {
				try {
					await cleanup();
				} catch (cause) {
					failures.push({ phase, cause });
				}
			};

			await runPhase("run-runtime", () => agentOrchestration.disposeRuntime?.());
			await runPhase("app-domain", () => disposeApp(app));
			await runPhase("websocket", () => coreApi.disposeWebSocket());
			await runPhase(
				"http",
				() =>
					new Promise<void>((resolve, reject) => {
						httpServer.close((error?: Error) => {
							if (error) reject(error);
							else resolve();
						});
					}),
			);
			if (dbHandle) {
				await runPhase("owned-db", () => dbHandle.close());
			}

			if (failures.length > 0) {
				throw new AggregateError(failures, "Server disposal failed");
			}
		})();
		return disposePromise;
	};

	// biome-ignore lint/style/noNonNullAssertion: `db` is always set above (either the injected fixture or a freshly opened handle)
	return { httpServer, dispose, credentialResolver: coreApi.credentialResolver! };
}
