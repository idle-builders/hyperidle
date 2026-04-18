import type { HyperIdleDb } from "@hyperidle/db";
import * as dbSchema from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { serve } from "bun";
import { createApp } from "./app.js";
import { registerWsRoute, wsHandler } from "./routes/ws.js";

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
		registerWebSocket: (apiRouter) => {
			wsDispose = registerWsRoute(apiRouter, eventBus);
		},
	});

	const server = serve({
		fetch: app.fetch,
		port,
		websocket: wsHandler,
	});

	const dispose = (): void => {
		if (wsDispose) {
			wsDispose();
			wsDispose = null;
		}
		server.stop();
	};

	return { server, dispose };
}
