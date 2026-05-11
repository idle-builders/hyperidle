import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { HyperIdleDb } from "./connection.js";
import * as schema from "./schema.js";

/**
 * In-memory SQLite with all tables via Drizzle migrations.
 *
 * @lore api-contract: The test runtime is heterogeneous:
 *   - Locally (macOS, Bun): vitest workers run under Bun's runtime, which
 *     cannot dlopen better-sqlite3 (ERR_DLOPEN_FAILED, no native addon ABI).
 *   - CI (Linux, GitHub Actions, oven-sh/setup-bun): vitest forks Node.js
 *     child processes via child_process.fork(). These workers use Node's ESM
 *     loader which rejects `bun:` protocol imports with "Only URLs with a
 *     scheme in: file, data, and node are supported".
 *
 * Solution: detect the runtime via `typeof globalThis.Bun !== "undefined"` and
 * use `createRequire` to load the appropriate adapter synchronously (CJS
 * require avoids ESM protocol restrictions). bun:sqlite for Bun workers,
 * better-sqlite3 for Node workers. Both adapters present the same synchronous
 * query interface; the result is cast to HyperIdleDb.
 */
export function createTestDb(): HyperIdleDb {
	const nodeRequire = createRequire(import.meta.url);
	const isBun = typeof globalThis.Bun !== "undefined";

	if (isBun) {
		const { Database } = nodeRequire("bun:sqlite") as typeof import("bun:sqlite");
		const { drizzle } = nodeRequire(
			"drizzle-orm/bun-sqlite",
		) as typeof import("drizzle-orm/bun-sqlite");
		const { migrate } = nodeRequire(
			"drizzle-orm/bun-sqlite/migrator",
		) as typeof import("drizzle-orm/bun-sqlite/migrator");

		const sqlite = new Database(":memory:");
		sqlite.run("PRAGMA journal_mode = WAL");
		sqlite.run("PRAGMA foreign_keys = ON");
		const db = drizzle(sqlite, { schema });
		const migrationsFolder = resolve(__dirname, "../drizzle");
		migrate(db, { migrationsFolder });
		return db as unknown as HyperIdleDb;
	}

	// Node.js worker path (CI): use better-sqlite3
	const BetterSqlite = nodeRequire("better-sqlite3") as typeof import("better-sqlite3");
	const Database =
		BetterSqlite.default ?? (BetterSqlite as unknown as typeof import("better-sqlite3").default);
	const { drizzle } = nodeRequire(
		"drizzle-orm/better-sqlite3",
	) as typeof import("drizzle-orm/better-sqlite3");
	const { migrate } = nodeRequire(
		"drizzle-orm/better-sqlite3/migrator",
	) as typeof import("drizzle-orm/better-sqlite3/migrator");

	const sqlite = new Database(":memory:");
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	const migrationsFolder = resolve(__dirname, "../drizzle");
	migrate(db, { migrationsFolder });
	return db;
}
