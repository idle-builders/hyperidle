import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as pgSchema from "./schema.js";

// @lore pglite runs real Postgres queries inside a WASM binary; drizzle's
// pglite driver lets our Postgres migrations execute inside the test
// sandbox without a running cluster. Operators still have the real-PG
// smoke path via `DATABASE_URL` in pg-connection.ts.
// Docs: https://orm.drizzle.team/docs/connect-pglite

export type HyperIdlePgliteDb = PgliteDatabase<typeof pgSchema>;

export interface PgTestDbHandle {
	readonly db: HyperIdlePgliteDb;
	readonly client: PGlite;
	runPgMigrations(db: HyperIdlePgliteDb): Promise<void>;
	close(): Promise<void>;
}

export interface PgTestDbOptions {
	/** Apply pg migrations after the client opens. Default: false. */
	readonly migrate?: boolean;
}

/** Folder where the Postgres migration set lives. */
function pgMigrationsFolder(): string {
	return resolve(__dirname, "../drizzle");
}

/** Apply the full pg migration set to a pglite-backed Drizzle instance. */
async function applyPgMigrations(db: HyperIdlePgliteDb): Promise<void> {
	await migrate(db, { migrationsFolder: pgMigrationsFolder() });
}

/** Construct a fresh in-memory pglite database wrapped with Drizzle. */
export async function createPgTestDb(options: PgTestDbOptions = {}): Promise<PgTestDbHandle> {
	const client = new PGlite();
	await client.waitReady;
	const db = drizzle(client, { schema: pgSchema });
	if (options.migrate) {
		await applyPgMigrations(db);
	}
	return {
		db,
		client,
		runPgMigrations: applyPgMigrations,
		close: async () => {
			await client.close();
		},
	};
}
