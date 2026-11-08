import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type RunnerDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export type RunnerWriteExecutor = RunnerDb | Parameters<Parameters<RunnerDb["transaction"]>[0]>[0];

export interface RunnerDbHandle {
	readonly db: RunnerDb;
	close(): Promise<void>;
}

export function createPostgresRunnerDb(url: string): RunnerDbHandle {
	if (!url) throw new Error("createPostgresRunnerDb requires a non-empty URL");
	const client = postgres(url, { max: 1 });
	const db = drizzlePostgres(client, { schema });
	return {
		db,
		close: async () => {
			await client.end();
		},
	};
}

export async function createPgliteRunnerDb(dataDir: string): Promise<RunnerDbHandle> {
	const client = new PGlite(dataDir);
	await client.waitReady;
	const db = drizzle(client, { schema });
	return {
		db,
		close: async () => {
			await client.close();
		},
	};
}

function resolveDirname(): string {
	const cjsDirname = Reflect.get(globalThis, "__dirname") as string | undefined;
	return cjsDirname ?? fileURLToPath(new URL(".", import.meta.url));
}

/**
 * Create a PGlite runner-db and apply the bundled migrations in one step.
 * Use this when the caller does not apply migrations externally first
 * (the standalone runner calls applyRunnerMigrations on-disk first; server
 * integrations use this helper instead so they get a migrated DB without
 * knowing the migrations folder path).
 */
export async function createAndMigrateRunnerDb(dataDir: string): Promise<RunnerDbHandle> {
	const client = new PGlite(dataDir);
	await client.waitReady;
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: resolve(resolveDirname(), "../drizzle") });
	return {
		db,
		close: async () => {
			await client.close();
		},
	};
}
