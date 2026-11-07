// @lore: Hono notFound — two layers mount on same /api router; parent notFound fires, not sub-app's; composeApiApplication builds the canonical 404 on root app

import * as fs from "node:fs";
import * as path from "node:path";
import { type ServerType, serve, upgradeWebSocket } from "@hono/node-server";
import {
	applyFactoryCoreState,
	composeApiApplication,
	health,
	installedPluginsDir,
	registerCoreDomainServices,
} from "@hyperidle/core-api";
import { disposeApp, registerAppDisposers } from "@hyperidle/core-api/app";
import { bootCoreApi, type CoreApiBoot, type SignIn } from "@hyperidle/core-api/boot";
import { createPgliteDb, createPostgresDb, type DbHandle, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { WebSocketServer } from "ws";
import { resolveProfile } from "./profiles.js";

export interface CreateServerDeps {
	readonly db?: HyperIdleDb;
	/**
	 * Interface to bind the listening socket to. Omitted → `@hono/node-server`
	 * binds EVERY interface, which is what the hosted deployment needs (the
	 * container must be reachable from its ingress).
	 */
	readonly hostname?: string;
	/**
	 * The plugins that ship with the server, one folder each. Omitted →
	 * `HYPERIDLE_BUNDLED_PLUGINS_DIR`, else the repo's own `plugins/` (the
	 * server image carries the repo, so it is there too).
	 */
	readonly bundledPluginsDir?: string;
	/** Where people sign in to join this server. Omitted → nobody can join. */
	readonly signIn?: SignIn;
}

export interface ServerHandle {
	readonly httpServer: ServerType;
	readonly dispose: () => Promise<void>;
	/** Call any registered action in-process as a specific actor — for multi-actor integration test scenarios. */
	readonly callActionAs: NonNullable<CoreApiBoot["callActionAs"]>;
	/** Mint a WebSocket upgrade token for a specific actor — for integration tests that connect as non-default users. */
	readonly mintWsTokenFor: NonNullable<CoreApiBoot["mintWsTokenFor"]>;
	/** WebSocket connection hub — exposes broadcast so tests can push nudges without going through the server's own clock. */
	readonly wsHub: CoreApiBoot["wsHub"];
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
		pluginsBaseDir = installedPluginsDir(dbUrl);
	}

	// @lore: factory bootstrap — applyFactoryCoreState inserts system:propagation actor; idempotent; must run before any write
	await applyFactoryCoreState(db);

	const eventBus = new EventBus();

	const hasSecret = Boolean(process.env.HYPERIDLE_CREDENTIAL_KEY ?? process.env.HYPERIDLE_API_KEY);
	if (!hasSecret) {
		// biome-ignore lint/suspicious/noConsole: intentional boot-time warning before observability adapter is constructed
		console.warn(
			"[HyperIdle] No HYPERIDLE_CREDENTIAL_KEY/HYPERIDLE_API_KEY set — connection token writes will be refused (MISSING_ROOT_SECRET) until a secret is configured.",
		);
	}

	const coreApi = await bootCoreApi({
		db,
		eventBus,
		upgradeWebSocket,
		...(pluginsBaseDir ? { pluginsBaseDir } : {}),
		bundledPluginsDir: resolveBundledPluginsDir(deps),
		...(deps.signIn ? { signIn: deps.signIn } : {}),
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

	if (!coreApi.callActionAs)
		throw new Error("callActionAs not available — server was built without db");
	if (!coreApi.mintWsTokenFor)
		throw new Error("mintWsTokenFor not available — server was built without WS support");
	return {
		httpServer,
		dispose,
		callActionAs: coreApi.callActionAs,
		mintWsTokenFor: coreApi.mintWsTokenFor,
		wsHub: coreApi.wsHub,
	};
}
