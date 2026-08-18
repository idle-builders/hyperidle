import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { resolvePostgresSsl, sanitizePostgresUrl } from "./pg-ssl.js";
import * as schema from "./schema.js";

// @lore Phase 2 PGlite migration: the unified HyperIdleDb type covers both
// PGlite (laptop / test) and postgres-js (VPS / cloud). Both Drizzle drivers
// satisfy PgDatabase<PgQueryResultHKT, typeof schema> — the common supertype
// lets callers remain driver-agnostic. See plans/pglite-migration for rationale.

/** Unified Drizzle DB type: satisfied by both PGlite and postgres-js drivers. */
export type HyperIdleDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** A DB handle with lifecycle management. */
export interface DbHandle {
	readonly db: HyperIdleDb;
	close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pool-size helpers (preserved from pg-connection.ts — F7 critique)
// ---------------------------------------------------------------------------

/** Default connection pool size. */
export const DEFAULT_PG_POOL_SIZE = 10 as const;

/** Environment variable operators set to override the pool size. */
export const PG_POOL_SIZE_ENV = "PG_POOL_SIZE" as const;

/** Validate and resolve a pool-size setting against the documented default. */
export function parsePgPoolSize(input: number | string | undefined): number {
	if (input === undefined || input === "") return DEFAULT_PG_POOL_SIZE;
	const n = typeof input === "string" ? Number(input) : input;
	if (!Number.isInteger(n) || n <= 0) {
		throw new Error(`Invalid pool size: ${input}. Must be a positive integer.`);
	}
	return n;
}

// ---------------------------------------------------------------------------
// PGlite factory (laptop profile + tests)
// ---------------------------------------------------------------------------

/**
 * Create a PGlite-backed HyperIdleDb. Uses an on-disk data directory for the
 * laptop profile. For in-memory usage pass `":memory:"` or omit `dataDir`.
 */
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

// ---------------------------------------------------------------------------
// Postgres-js factory (VPS / cloud profiles)
// ---------------------------------------------------------------------------

/**
 * Create a Postgres-backed HyperIdleDb with the configured pool size.
 * The caller is responsible for calling `close()` on shutdown.
 */
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
