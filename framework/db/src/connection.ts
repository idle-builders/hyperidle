import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { resolvePostgresSsl, sanitizePostgresUrl } from "./pg-ssl.js";
import * as schema from "./schema.js";

// @lore: HyperIdleDb — both PGlite and postgres-js satisfy PgDatabase<PgQueryResultHKT, typeof schema>; callers remain driver-agnostic
export type HyperIdleDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
	readonly db: HyperIdleDb;
	close(): Promise<void>;
}

export const DEFAULT_PG_POOL_SIZE = 10 as const;
export const PG_POOL_SIZE_ENV = "PG_POOL_SIZE" as const;

export function parsePgPoolSize(input: number | string | undefined): number {
	if (input === undefined || input === "") return DEFAULT_PG_POOL_SIZE;
	const n = typeof input === "string" ? Number(input) : input;
	if (!Number.isInteger(n) || n <= 0) {
		throw new Error(`Invalid pool size: ${input}. Must be a positive integer.`);
	}
	return n;
}

export async function createPgliteDb(dataDir: string): Promise<DbHandle> {
	const client = new PGlite(dataDir);
	await client.waitReady;
	const db = drizzlePglite(client, { schema });
	return {
		db,
		close: async () => {
			await client.close();
		},
	};
}

export function createPostgresDb(url: string, opts?: { maxConnections?: number }): DbHandle {
	if (!url) {
		throw new Error("createPostgresDb requires a non-empty DATABASE_URL");
	}
	const procEnvPoolSize = globalThis.process?.env?.[PG_POOL_SIZE_ENV];
	const poolSize = opts?.maxConnections ?? parsePgPoolSize(procEnvPoolSize) ?? DEFAULT_PG_POOL_SIZE;
	const client = postgres(sanitizePostgresUrl(url), {
		max: poolSize,
		ssl: resolvePostgresSsl(url),
	});
	const db = drizzlePostgres(client, { schema });
	return {
		db,
		close: async () => {
			await client.end({ timeout: 5 });
		},
	};
}
