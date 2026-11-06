import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema.js";

export type RunnerDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export type RunnerWriteExecutor =
	| RunnerDb
	| Parameters<Parameters<RunnerDb["transaction"]>[0]>[0];

export interface RunnerDbHandle {
	readonly db: RunnerDb;
	close(): Promise<void>;
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
