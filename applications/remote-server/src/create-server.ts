// @lore: Hono notFound — two layers mount on same /api router; parent notFound fires, not sub-app's; composeApiApplication builds the canonical 404 on root app

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ServerType, serve, upgradeWebSocket } from "@hono/node-server";
import { bootAgentExecution } from "@hyperidle/agent-execution";
import {
	type ApplicationProvisionSessionDeps,
	bootAgentOrchestration,
	type RunOrchestrationHarnessRuntimeAdapter,
	type RunOrchestrationReturnStatusToolAdapter,
} from "@hyperidle/agent-orchestration";
import {
	buildAgentOrchestrationPort,
	composeApiApplication,
	createInProcessAgentOrchestrationTransport,
	health,
	registerAgentLayerServices,
	registerCoreDomainServices,
} from "@hyperidle/core-api";
import { disposeApp, registerAppDisposers } from "@hyperidle/core-api/app";
import { bootCoreApi, type CoreApiBoot } from "@hyperidle/core-api/boot";
import { createPgliteDb, createPostgresDb, type DbHandle, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { WebSocketServer } from "ws";
import { resolveProfile } from "./profiles.js";

/**
 * Which shape of execution face this
 * composition wants — `"local"` (in-process CLI harness discovery + a real
 * local sandbox, `desktop`'s shape) or `"disabled"` (an empty pool, populated
 * only by remote workers registering over the worker WS route,
 * `remote-server`'s shape).
 */
export interface CreateServerDeps {
	readonly db?: HyperIdleDb;
	readonly topology: "local" | "disabled";
	readonly sandboxBasePath?: string;
	/**
	 * Interface to bind the listening socket to. Omitted → `@hono/node-server`
	 * binds EVERY interface, which is what the hosted deployment needs (the
	 * container must be reachable from its ingress).
	 */
	readonly hostname?: string;
	/**
	 * Test-only escape hatch: a pre-built execution face, used instead of
	 * calling `bootAgentExecution({ topology, mcpBaseUrl })` internally — same
	 * idiom as `test-utils.ts`'s `TestAppOptions.agentOrchestrationBoot`. Lets
	 * a harness-facing integration test inject a pool with tuned adapter
	 * options (e.g. `maxIterations`/`maxOutputTokens` for a fast, deterministic
	 * real-LLM call) that `topology` alone cannot express. `topology` is
	 * ignored when this is supplied.
	 */
	readonly agentExecutionBoot?: Awaited<ReturnType<typeof bootAgentExecution>>;
	/**
	 * The plugins that ship with the server, one folder each. Omitted →
	 * `HYPERIDLE_BUNDLED_PLUGINS_DIR`, else the repo's own `plugins/` (the
	 * server image carries the repo, so it is there too).
	 */
	readonly bundledPluginsDir?: string;
}

export interface ServerHandle {
	readonly httpServer: ServerType;
	readonly dispose: () => Promise<void>;
	readonly actionTools: CoreApiBoot["actionTools"];
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

function resolvePglitePath(rawPath: string): string {
	if (rawPath === ":memory:" || path.isAbsolute(rawPath)) {
		return rawPath;
	}
	const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
	return path.resolve(repoRoot, rawPath);
}

function resolveBundledPluginsDir(deps: CreateServerDeps): string {
	return (
		deps.bundledPluginsDir ??
		process.env.HYPERIDLE_BUNDLED_PLUGINS_DIR ??
		path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..", "plugins")
	);
}

export async function createServer(port: number, deps: CreateServerDeps): Promise<ServerHandle> {
	let dbHandle: DbHandle | null = null;
	let db: HyperIdleDb;
	let pluginsBaseDir: string | undefined;
	if (deps.db) {
		db = deps.db;
	} else {
		const profile = resolveProfile(process.env);
		const rawDbUrl = process.env.DATABASE_URL ?? profile.dbUrlDefault;
		const dbUrl = profile.dbDriver === "pglite" ? resolvePglitePath(rawDbUrl) : rawDbUrl;
		if (profile.dbDriver === "pglite") {
			dbHandle = await createPgliteDb(dbUrl);
		} else {
			dbHandle = createPostgresDb(dbUrl);
		}
		db = dbHandle.db;
		// NOT "plugins": beside a dev checkout's database that is the repo's own
		// plugin SOURCE directory, and install `rmSync`s the destination before
		// copying — so installing would delete the sources it was built from.
		pluginsBaseDir = path.join(path.dirname(dbUrl), "installed-plugins");
	}
	const eventBus = new EventBus();

	const hasSecret = Boolean(process.env.HYPERIDLE_CREDENTIAL_KEY ?? process.env.HYPERIDLE_API_KEY);
	if (!hasSecret) {
		// biome-ignore lint/suspicious/noConsole: intentional boot-time warning before observability adapter is constructed
		console.warn(
			"[HyperIdle] No HYPERIDLE_CREDENTIAL_KEY/HYPERIDLE_API_KEY set — connection token writes will be refused (MISSING_ROOT_SECRET) until a secret is configured.",
		);
	}

	const sandboxBasePath =
		deps.sandboxBasePath ??
		process.env.HYPERIDLE_WORKSPACES_DIR ??
		path.join(os.tmpdir(), "hyperidle-workspaces");
	const mcpBaseUrl = `http://localhost:${port}`;

	const agentExecution =
		deps.agentExecutionBoot ?? (await bootAgentExecution({ topology: deps.topology, mcpBaseUrl }));

	let realAgentOrchestrationTransport:
		| Parameters<typeof buildAgentOrchestrationPort>[0]
		| undefined;
	const agentOrchestrationTransport: Parameters<typeof buildAgentOrchestrationPort>[0] = (req) => {
		if (!realAgentOrchestrationTransport) {
			throw new Error("AgentOrchestrationPort transport called before the composed app was built.");
		}
		return realAgentOrchestrationTransport(req);
	};
	const agentOrchestrationPort = buildAgentOrchestrationPort(agentOrchestrationTransport);

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
		...(pluginsBaseDir ? { pluginsBaseDir } : {}),
		bundledPluginsDir: resolveBundledPluginsDir(deps),
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
		pluginMcpContributions: coreApi.pluginMcpContributions,
	} satisfies ApplicationProvisionSessionDeps;

	let actionTools = coreApi.actionTools;
	const agentOrchestration = await bootAgentOrchestration({
		db,
		eventBus,
		upgradeWebSocket,
		wsPush: (topic, envelope) => coreApi.wsHub.broadcast(topic, JSON.stringify(envelope)),
		probeInheritedReach: deps.topology === "local",
		runtime: {
			harnessRuntime: harnessRuntimeAdapter,
			returnStatusTool: returnStatusToolAdapter,
			actionTools: () => actionTools,
			editDocument: coreApi.editDocument,
			searchDocuments: coreApi.searchDocuments,
			session: runtimeSessionDeps,
			sandboxBasePath,
			worker: {
				pool: agentExecution.adapters.pool,
				createWorkerAdapter: agentExecution.adapters.createWorkerAdapter,
			},
			reapers: {
				sandboxes: { sandboxBasePath },
			},
			resolveProvisioningOwnerUserId: coreApi.resolveProvisioningOwnerUserId,
		},
	});
	actionTools = [...coreApi.actionTools, ...agentOrchestration.actionTools];
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

	registerAppDisposers(app, [
		...coreApi.disposers,
		agentOrchestration.dispose,
		agentExecution.dispose,
	]);
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
		port,
		...(deps.hostname === undefined ? {} : { hostname: deps.hostname }),
		websocket: { server: wss },
	});

	// @lore: @hono/node-server — with hostname, listen routes through dns.lookup and bind is async; httpServer.address() is null until listening event fires
	await new Promise<void>((resolve, reject) => {
		if (httpServer.listening) {
			resolve();
			return;
		}
		// Declarations, not consts: each handler removes the other, so neither
		// can be in its temporal dead zone when the first event fires.
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

	return {
		httpServer,
		dispose,
		actionTools,
	};
}
