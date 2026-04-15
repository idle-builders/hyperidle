import { resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { HyperIdleDb } from "./connection.js";
import * as schema from "./schema.js";

/** In-memory SQLite with all tables via Drizzle migrations. */
export function createTestDb(): HyperIdleDb {
	const sqlite = new Database(":memory:");
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	const db = drizzle(sqlite, { schema });

	const migrationsFolder = resolve(__dirname, "../drizzle");
	migrate(db, { migrationsFolder });

	return db;
}
