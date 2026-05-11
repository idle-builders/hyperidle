import * as fs from "node:fs";
import * as path from "node:path";
import { type ServerType, serve, upgradeWebSocket } from "@hono/node-server";
import { createDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { WebSocketServer } from "ws";
import { createApp, disposeApp } from "./app.js";
import { registerWsRoute } from "./routes/ws.js";
import { createDbSubscribeAuthorizer, WsBroadcaster } from "./services/ws-broadcaster.js";

/**
 * Handle returned from `createServer` so callers can shut the server down
 * cleanly in tests + graceful shutdown.
 *
 * `httpServer` is typed as `ServerType` from @hono/node-server (which is
 * `http.Server | Http2Server | Http2SecureServer`). In practice, since we
 * do not pass HTTP/2 options to `serve()`, the runtime value is always
 * `http.Server`. We store `ServerType` to avoid an unsafe `as http.Server`
 * cast — `.close()` exists on all three union members.
 *
 * @lore N1: B1 (reviewer): do NOT use `as http.Server` cast. Use ServerType
 * directly — `.close()` exists on all union members.
 */
export interface ServerHandle {
	readonly httpServer: ServerType;
	readonly dispose: () => void;
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
 * @lore N1: production DB path now uses `createDb` from `@hyperidle/db`
 * (better-sqlite3) unconditionally. The `openProductionDb` function that used
 * Bun-specific SQLite drivers was removed — better-sqlite3 works under both
 * Node and Bun via Bun's native module dlopen support (fixed in Bun >=1.1.0).
 *
 * @lore I1 S1-S5: the previous `createFullApp` factory mounted only
 * `/health`, `/api/health`, and `/api/ws` — every domain route returned 404
 * in production. Converging on `createApp` is the fix; any future divergence
 * would re-introduce the same bug.
 */
export function createServer(port: number): ServerHandle {
	const dbPath = process.env.DATABASE_URL ?? "./hyperidle.db";
	const db = createDb(dbPath);
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
			wsDispose = registerWsRoute(apiRouter, eventBus, tokenStore, upgradeWebSocket, broadcaster);
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
		// runtime. Order: domain handlers -> WS route -> HTTP server.
		disposeApp(app);
		if (wsDispose) {
			wsDispose();
			wsDispose = null;
		}
		httpServer.close();
	};

	return { httpServer, dispose };
}
