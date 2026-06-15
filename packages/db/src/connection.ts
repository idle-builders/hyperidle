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

/**
 * Resolve the pool size from, in order: explicit `maxConnections`,
 * `PG_POOL_SIZE` env var, then the documented default.
 */
export function resolvePgPoolSize(opts: {
	readonly maxConnections?: number;
	readonly env?: Record<string, string | undefined>;
}): number {
	if (opts.maxConnections !== undefined) {
		return parsePgPoolSize(opts.maxConnections);
	}
	// @lore N-phase2: @types/node (root devDep) is included via tsconfig "types":["node"],
	// so globalThis.process is already typed — no cast needed. The optional chain
	// preserves the runtime guard for non-Node runtimes where process may be absent.
	const procEnv = globalThis.process?.env ?? {};
	const env = opts.env ?? procEnv;
	const raw = env[PG_POOL_SIZE_ENV];
	return parsePgPoolSize(raw);
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

export interface PgDbOptions {
	readonly url: string;
	readonly maxConnections?: number;
	/**
	 * Environment map to read `PG_POOL_SIZE` from when `maxConnections`
	 * is not supplied. Defaults to `process.env`.
	 */
	readonly env?: Record<string, string | undefined>;
}

export interface PgDbHandle extends DbHandle {
	/** Effective pool size after resolving options + env. */
	readonly poolSize: number;
}

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

/**
 * Create a Postgres-backed HyperIdleDb, exposing the resolved pool size.
 * Preserves the `createPgDb` interface from pg-connection.ts for callers
 * that need `poolSize` (e.g. health checks, tests).
 */
export function createPgDb(opts: PgDbOptions): PgDbHandle {
	if (!opts.url) {
		throw new Error("createPgDb requires a non-empty DATABASE_URL");
	}
	const poolSize = resolvePgPoolSize({
		maxConnections: opts.maxConnections,
		env: opts.env,
	});
	const client = postgres(sanitizePostgresUrl(opts.url), {
		max: poolSize,
		ssl: resolvePostgresSsl(opts.url),
	});
	const db = drizzlePostgres(client, { schema });
	return {
		db,
		poolSize,
		close: async () => {
			await client.end({ timeout: 5 });
		},
	};
}
