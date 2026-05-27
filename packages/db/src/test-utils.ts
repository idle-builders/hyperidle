import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { HyperIdleDb } from "./connection.js";
import * as schema from "./schema.js";

// @lore Phase 2: createTestDb is now async PGlite. All tests that call it must
// be async (beforeEach + await). SQLite test-utils were removed because the
// schema is now PG-only (pgTable). PGlite runs real Postgres semantics in WASM
// so tests exercise the same dialect as production.

/** Folder where the Postgres migration set lives. */
function migrationsFolder(): string {
	return resolve(__dirname, "../drizzle");
}

export interface TestDbHandle {
	readonly db: HyperIdleDb;
	/** Re-apply migrations (idempotency testing). */
	runMigrations(): Promise<void>;
	close(): Promise<void>;
}

/**
 * Create a fresh in-memory PGlite database with all migrations applied.
 * Each call returns an isolated DB — safe for parallel test runs.
 */
export async function createTestDb(): Promise<TestDbHandle> {
	const client = new PGlite();
	await client.waitReady;
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: migrationsFolder() });
	return {
		db,
		runMigrations: async () => {
			await migrate(db, { migrationsFolder: migrationsFolder() });
		},
		close: async () => {
			await client.close();
		},
	};
}
