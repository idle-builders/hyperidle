/**
 * H4: Postgres adapter using drizzle-orm/postgres-js.
 *
 * @lore The `postgres` package is a connection pool by design; its `max`
 * option is the pool size. Drizzle's postgres-js driver wraps this client,
 * so pool configuration lives on the underlying `postgres(...)` call.
 * Official docs: https://orm.drizzle.team/docs/connect-postgresql
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as pgSchema from "./schema.pg.js";

/** Default connection pool size per the H4 spec. */
export const DEFAULT_PG_POOL_SIZE = 10 as const;

export interface PgDbOptions {
	readonly url: string;
	readonly maxConnections?: number;
}

export type HyperIdlePgDb = ReturnType<typeof drizzle<typeof pgSchema>>;

export interface PgDbHandle {
	readonly db: HyperIdlePgDb;
	/** Underlying postgres.js client — exposed for pool introspection in tests. */
	readonly client: Sql;
	close(): Promise<void>;
}

/** Validate and resolve a pool-size setting against the documented default. */
export function parsePgPoolSize(input: number | undefined): number {
	if (input === undefined) return DEFAULT_PG_POOL_SIZE;
	if (!Number.isInteger(input) || input <= 0) {
		throw new Error(`Invalid pool size: ${input}. Must be a positive integer.`);
	}
	return input;
}

/**
 * Create a Postgres-backed HyperIdleDb with the configured pool size.
 * The caller is responsible for calling `close()` on shutdown.
 */
export function createPgDb(opts: PgDbOptions): PgDbHandle {
	if (!opts.url) {
		throw new Error("createPgDb requires a non-empty DATABASE_URL");
	}
	const max = parsePgPoolSize(opts.maxConnections);
	const client = postgres(opts.url, { max });
	const db = drizzle(client, { schema: pgSchema });
	return {
		db,
		client,
		close: async () => {
			await client.end({ timeout: 5 });
		},
	};
}
