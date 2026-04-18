/**
 * H4 test harness: in-memory Postgres via `@electric-sql/pglite`
 * (WASM Postgres, supported by drizzle-orm/pglite out of the box).
 *
 * @lore pglite runs real Postgres queries inside a WASM binary, so our
 * Postgres migrations and schema can be exercised inside the test sandbox
 * even without a running Postgres server. A real-Postgres smoke path is
 * still possible via `DATABASE_URL`; see `packages/db/src/pg-connection.ts`.
 * Docs: https://orm.drizzle.team/docs/connect-pglite
 */

import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { type PgliteDatabase, drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as pgSchema from "./schema.pg.js";

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
	return resolve(__dirname, "../drizzle-pg");
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
