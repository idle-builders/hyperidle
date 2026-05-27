import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as pgSchema from "./schema.js";

// @lore The `postgres` package is a connection pool by design; its `max`
// option is the pool size. Drizzle's postgres-js driver wraps this client,
// so pool configuration lives on the underlying `postgres(...)` call.
// Docs: https://orm.drizzle.team/docs/connect-postgresql

/** Default connection pool size per the H4 spec. */
export const DEFAULT_PG_POOL_SIZE = 10 as const;

/** Environment variable operators set to override the pool size. */
export const PG_POOL_SIZE_ENV = "PG_POOL_SIZE" as const;

export interface PgDbOptions {
	readonly url: string;
	readonly maxConnections?: number;
	/**
	 * Environment map to read `PG_POOL_SIZE` from when `maxConnections`
	 * is not supplied. Defaults to `process.env`.
	 */
	readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

export type HyperIdlePgDb = ReturnType<typeof drizzle<typeof pgSchema>>;

export interface PgDbHandle {
	readonly db: HyperIdlePgDb;
	readonly client: Sql;
	/** Effective pool size after resolving options + env. */
	readonly poolSize: number;
	close(): Promise<void>;
}

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
	readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): number {
	if (opts.maxConnections !== undefined) {
		return parsePgPoolSize(opts.maxConnections);
	}
	const env = opts.env ?? process.env;
	const raw = env[PG_POOL_SIZE_ENV];
	return parsePgPoolSize(raw);
}

/**
 * Create a Postgres-backed HyperIdleDb with the configured pool size.
 * The caller is responsible for calling `close()` on shutdown.
 */
export function createPgDb(opts: PgDbOptions): PgDbHandle {
	if (!opts.url) {
		throw new Error("createPgDb requires a non-empty DATABASE_URL");
	}
	const poolSize = resolvePgPoolSize({
		maxConnections: opts.maxConnections,
		env: opts.env,
	});
	const client = postgres(opts.url, { max: poolSize });
	const db = drizzle(client, { schema: pgSchema });
	return {
		db,
		client,
		poolSize,
		close: async () => {
			await client.end({ timeout: 5 });
		},
	};
}
