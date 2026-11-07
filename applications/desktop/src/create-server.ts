import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { type ServerType, serve, upgradeWebSocket } from "@hono/node-server";
import {
	composeApiApplication,
	health,
	installedPluginsDir,
	registerCoreDomainServices,
} from "@hyperidle/core-api";
import { disposeApp, registerAppDisposers } from "@hyperidle/core-api/app";
import { bootCoreApi } from "@hyperidle/core-api/boot";
import { createPgliteDb, type DbHandle, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { WebSocketServer } from "ws";
// @lore: ws — ships no type declarations; @types/ws must be in devDependencies alongside ws; stale local dist masks missing @types on a clean npm ci

export interface CreateServerDeps {
	readonly db?: HyperIdleDb;
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
 * the assigned port, then releasing it. Used so the server URL is known before
 * `serve()` binds — callers that need the port for runner bootstrapping read it
 * after `createServer` resolves.
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
		pluginsBaseDir = installedPluginsDir(dbUrl);
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

	const listenPort = port === 0 ? await resolveFreeLoopbackPort(deps.hostname) : port;

	const coreApi = await bootCoreApi({
		db,
		eventBus,
		upgradeWebSocket,
		...(pluginsBaseDir ? { pluginsBaseDir } : {}),
		...(bundledPluginsDir ? { bundledPluginsDir } : {}),
		serviceBootstrap: (ctx) => registerCoreDomainServices(ctx),
	});

	const app = composeApiApplication({
		middleware: coreApi.middleware,
		preAuthRegistrars: [coreApi.registerPreAuthRoutes],
		apps: [coreApi.app],
	});
	// Backward-compat: /health without auth, outside the /api tree.
	app.route("/", health);

	registerAppDisposers(app, [...coreApi.disposers]);

	const staticDir = process.env.HYPERIDLE_STATIC_DIR;
	let resolvedStaticDir: string | null = null;
	if (staticDir) {
		resolvedStaticDir = path.resolve(staticDir);
		if (!fs.existsSync(path.join(resolvedStaticDir, "index.html"))) {
			resolvedStaticDir = null;
		}
	}

	const staticFetch = resolvedStaticDir
		? createStaticHandler(resolvedStaticDir, app.fetch)
		: app.fetch;

	const wss = new WebSocketServer({ noServer: true });

	const httpServer = serve({
		fetch: staticFetch,
		port: listenPort,
		...(deps.hostname === undefined ? {} : { hostname: deps.hostname }),
		websocket: { server: wss },
	});

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

			await runPhase("app-domain", () => disposeApp(app));
			await runPhase("websocket", () => {
				coreApi.disposeWebSocket();
				// An open live connection would keep the HTTP server from ever closing.
				for (const client of wss.clients) client.terminate();
				wss.close();
			});
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

	return { httpServer, dispose };
}
