import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { HyperIdleDb } from "./connection.js";
import * as schema from "./schema.js";
import { seed } from "./seed.js";

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, "../drizzle");

export function createTestDb(): HyperIdleDb {
	const sqlite = new Database(":memory:");
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db;
}

export async function createSeededTestDb(): Promise<HyperIdleDb> {
	const db = createTestDb();
	await seed(db);
	return db;
}
