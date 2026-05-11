import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HyperIdleDb } from "./connection.js";
import * as schema from "./schema.js";

/**
 * In-memory SQLite with all tables via Drizzle migrations.
 *
 * @lore api-contract: Uses bun:sqlite (Bun's built-in SQLite) instead of
 * better-sqlite3 (a native Node.js addon). better-sqlite3 requires dlopen of
 * a compiled .node file, which Bun does not support (ABI mismatch). Drizzle
 * has a first-class bun-sqlite adapter with the same query API. The result is
 * cast to HyperIdleDb because both BunSQLiteDatabase and BetterSQLite3Database
 * extend BaseSQLiteDatabase<'sync', void, TSchema> — structurally identical
 * query interfaces. Production code continues to use better-sqlite3 via
 * createDb(); only tests use bun:sqlite.
 * Vite transform must skip this module: add `bun:sqlite` to server.deps.external
 * in packages/db/vitest.config.ts so Vite does not attempt to resolve the
 * `bun:` protocol specifier, allowing Bun's runtime to handle it natively.
 */
export function createTestDb(): HyperIdleDb {
	const sqlite = new Database(":memory:");
	sqlite.run("PRAGMA journal_mode = WAL");
	sqlite.run("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });

	const migrationsFolder = resolve(__dirname, "../drizzle");
	migrate(db, { migrationsFolder });

	// Cast is safe: BunSQLiteDatabase and BetterSQLite3Database both extend
	// BaseSQLiteDatabase<'sync', void, schema> with identical query interfaces.
	return db as unknown as HyperIdleDb;
}
