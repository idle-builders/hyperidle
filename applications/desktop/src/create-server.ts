// @lore: desktop can't import @hyperidle/remote-server (app→app crossing); duplicates remote-server composition root; topology:"local" hostname:"127.0.0.1"

import * as fs from "node:fs";
import * as net from "node:net";
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
import { createPgliteDb, type DbHandle, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { WebSocketServer } from "ws";
// @lore: ws — ships no type declarations; @types/ws must be in devDependencies alongside ws; stale local dist masks missing @types on a clean npm ci

export interface CreateServerDeps {
	readonly db?: HyperIdleDb;
	readonly topology: "local" | "disabled";
	readonly sandboxBasePath?: string;
	readonly hostname?: string;
	/**
	 * The plugins that ship inside the app, one folder each. Omitted →
	 * `HYPERIDLE_BUNDLED_PLUGINS_DIR`, which `main.ts` sets (the packaged app's
	 * `Resources/plugins`, or the repo's `plugins/` in development). This file
	 * is bundled into `main.cjs`, so it cannot find the folder from its own path.
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

// @lore: resolvePglitePath — CWD differs between npm run dev and direct Node; resolve relative paths against repo root, not process.cwd()
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
	let dbHandle: DbHandle | null = null;
	let db: HyperIdleDb;
	let pluginsBaseDir: string | undefined;
	if (deps.db) {
		db = deps.db;
	} else {
		const rawDbUrl = process.env.DATABASE_URL ?? "./hyperidle-pg";
		const dbUrl = resolvePglitePath(rawDbUrl);
		dbHandle = await createPgliteDb(dbUrl);
		db = dbHandle.db;
		// NOT "plugins": beside a dev checkout's database that is the repo's own
		// plugin SOURCE directory, and install `rmSync`s the destination before
		// copying — so installing would delete the sources it was built from.
		pluginsBaseDir = path.join(path.dirname(dbUrl), "installed-plugins");
	}
	const bundledPluginsDir = deps.bundledPluginsDir ?? process.env.HYPERIDLE_BUNDLED_PLUGINS_DIR;
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

	// @lore: agentOrchestrationTransport — typed as Parameters<typeof buildAgentOrchestrationPort>[0]; avoids governance import to @hyperidle/api-contract
	let realAgentOrchestrationTransport:
		| Parameters<typeof buildAgentOrchestrationPort>[0]
		| undefined;
	const agentOrchestrationTransport: Parameters<typeof buildAgentOrchestrationPort>[0] = (req) => {
		if (!realAgentOrchestrationTransport) {
			throw new Error("AgentOrchestrationTransport called before the composed app was built.");
		}
		return realAgentOrchestrationTransport(req);
	};
	const agentOrchestrationPort = buildAgentOrchestrationPort(agentOrchestrationTransport);

	// @lore: onHarnessRedetect — deferred binding; bootCoreApi runs before bootAgentOrchestration; real refresh filled post-boot; handlers fire only on composed app
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
		...(bundledPluginsDir ? { bundledPluginsDir } : {}),
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
				// @lore: createWorkerAdapter — forwarded structurally; Application can't import @hyperidle/harness-protocol (governance crossing); function value carries type
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
		port: listenPort,
		...(deps.hostname === undefined ? {} : { hostname: deps.hostname }),
		websocket: { server: wss },
	});

	// @lore: @hono/node-server — with hostname, listen routes through dns.lookup and bind is async; httpServer.address() is null until listening event fires
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

	return { httpServer, dispose, actionTools };
}
