import * as fs from "node:fs";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import * as dbSchema from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { serve } from "bun";
import { createApp, disposeApp } from "./app.js";
import { registerWsRoute, wsHandler } from "./routes/ws.js";
import { createDbSubscribeAuthorizer, WsBroadcaster } from "./services/ws-broadcaster.js";

/**
 * Handle returned from `createBunServer` so callers can shut the server down
 * cleanly in tests + graceful shutdown.
 */
export interface BunServerHandle {
	readonly server: ReturnType<typeof serve>;
	readonly dispose: () => void;
}

/**
 * Open the production SQLite database using Bun's native `bun:sqlite` driver.
 *
 * @lore I1: Bun cannot dlopen better-sqlite3 (see
 * https://github.com/oven-sh/bun/issues/4290), so production (which always
 * runs under Bun) uses bun:sqlite via `drizzle-orm/bun-sqlite`. The schema
 * and query API are identical to the Node/test path (better-sqlite3), so
 * we can return a `HyperIdleDb` by structural compatibility without
 * forcing unsafe casts anywhere except this one boundary.
 */
async function openProductionDb(dbPath: string): Promise<HyperIdleDb> {
	const { Database: BunDatabase } = await import("bun:sqlite");
	const { drizzle: bunDrizzle } = await import("drizzle-orm/bun-sqlite");
	const sqlite = new BunDatabase(dbPath);
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	// The bun-sqlite Drizzle driver has the same query surface (insert,
	// select, update, transaction, etc.) as better-sqlite3; cast once here
	// so the rest of the server (which is typed against better-sqlite3's
	// `HyperIdleDb`) works unchanged.
	return bunDrizzle(sqlite, { schema: dbSchema.schema }) as unknown as HyperIdleDb;
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
	appFetch: (req: Request) => Response | Promise<Response>,
): (req: Request) => Response | Promise<Response> {
	const indexPath = path.join(dir, "index.html");

	return (req: Request): Response | Promise<Response> => {
		const url = new URL(req.url);

		// /api routes always go to the Hono app
		if (url.pathname.startsWith("/api")) {
			return appFetch(req);
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
 * Create a Bun server with the full domain app + WebSocket support.
 *
 * Reads the DB path from `DATABASE_URL` (falling back to `./hyperidle.db`),
 * builds a fresh `EventBus`, and wires them into `createApp`. The WebSocket
 * route is registered via the `registerWebSocket` hook on `AppOptions` so the
 * production boot path and integration tests share a single `createApp`.
 *
 * Pass port 0 for a random available port (useful in tests).
 *
 * @lore I1 S1-S5: the previous `createFullApp` factory mounted only
 * `/health`, `/api/health`, and `/api/ws` — every domain route returned 404
 * in production. Converging on `createApp` is the fix; any future divergence
 * would re-introduce the same bug.
 */
export async function createBunServer(port: number): Promise<BunServerHandle> {
	const dbPath = process.env.DATABASE_URL ?? "./hyperidle.db";
	const db = await openProductionDb(dbPath);
	const eventBus = new EventBus();

	let wsDispose: (() => void) | null = null;
	const app = createApp({
		db,
		eventBus,
		registerWebSocket: (apiRouter, tokenStore) => {
			// L1 step9 (Adv-C1): production WS subscribe must enforce participant
			// authz on `thread:<id>` topics. The authorizer reads the threads
			// table on each subscribe call.
			const broadcaster = new WsBroadcaster(eventBus, createDbSubscribeAuthorizer(db));
			broadcaster.start();
			wsDispose = registerWsRoute(apiRouter, eventBus, tokenStore, broadcaster);
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

	const server = serve({
		fetch: staticFetch,
		port,
		websocket: wsHandler,
	});

	const dispose = (): void => {
		// @lore I1 M1: tear down event-bus subscriptions first so none of the
		// five createApp-registered handlers (session-review-creator,
		// policy-engine, builtin-routines, git-export, notification-dispatcher,
		// observability) outlive the server. If we called `server.stop()` or
		// the WS disposer first, `disposeApp` would still run, but background
		// handlers could observe events during shutdown against a torn-down
		// runtime. Order: domain handlers -> WS route -> Bun server.
		disposeApp(app);
		if (wsDispose) {
			wsDispose();
			wsDispose = null;
		}
		server.stop();
	};

	return { server, dispose };
}
