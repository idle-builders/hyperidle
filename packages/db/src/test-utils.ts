import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { HyperIdleDb } from "./connection.js";
import * as schema from "./schema.js";

// @lore Phase 2: createTestDb is now async PGlite. All tests that call it must
// be async (beforeEach + await). SQLite test-utils were removed because the
// schema is now PG-only (pgTable). PGlite runs real Postgres semantics in WASM
// so tests exercise the same dialect as production.

// @lore perf: Per-worker PGlite instance pool. PGlite WASM cold-start (~850ms)
// + migrations (~150ms) = ~1s per createTestDb() call. With ~350 calls across
// the suite that's ~350s sequential overhead. The pool pattern:
// - Pre-warms one instance on first call (cold WASM + migrations, ~1s).
// - `close()` TRUNCATEs the instance and returns it to the pool (~5ms).
// - `createTestDb()` takes from the pool if available (~0ms overhead).
//   Otherwise allocates a new instance with warm WASM (~700ms).
// - Tests that call createTestDb() multiple times without close() (e.g.,
//   per-user isolation tests that spin up multiple app instances) each
//   receive a separate PGlite instance, preserving full isolation. This is
//   the rare case; the common `beforeEach/afterEach` pattern reuses a single
//   pooled instance for the file's lifetime.
// - In-memory PGlite instances are GC'd with the worker — they do not leak.
// - TRUNCATE uses pg_tables with CASCADE so FK-ordered teardown is automatic.

// @lore R6: An earlier version of this file attempted to reclaim still-open
// ("stale live") PGlite instances when the pool was empty, to avoid PGlite's
// internal WASM global lock. That approach broke per-user isolation tests
// (e.g. hints.test.ts AC8) which hold two live db handles simultaneously —
// reclaiming one handle and giving it to the second caller merged both apps
// onto the same physical database, defeating isolation. The simpler correct
// approach: always allocate fresh when the pool is empty. Tests that don't
// call close() leave their instance alive until the worker is GC'd — acceptable
// because PGlite in-memory instances are tiny and worker lifetime is bounded.

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

// ---------------------------------------------------------------------------
// Per-worker instance pool
// ---------------------------------------------------------------------------

interface PooledInstance {
	readonly client: PGlite;
	readonly db: HyperIdleDb;
}

/** Available (TRUNCATED, ready-to-use) instances. */
const pool: PooledInstance[] = [];

/** All allocated PGlite clients, for cleanup on worker exit. */
const allClients: PGlite[] = [];

// @lore: PGlite WASM keeps the Node event loop alive even after all tests
// finish, preventing vitest fork workers from exiting. Without this handler,
// workers become orphaned processes (100+ observed after multi-worktree runs).
// Detect parent exit via IPC disconnect and force-shutdown.
if (typeof process.send === "function") {
	process.on("disconnect", () => {
		for (const client of allClients) {
			try {
				client.close();
			} catch {
				// Best-effort — process is exiting anyway
			}
		}
		process.exit(0);
	});
}

/**
 * Create a new PGlite instance and run all migrations.
 * First call cold-starts the WASM (~850ms). Subsequent calls reuse the
 * already-loaded WASM module (~700ms) — still fast compared to cold start.
 */
async function allocateInstance(): Promise<PooledInstance> {
	const client = new PGlite();
	await client.waitReady;
	allClients.push(client);
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: migrationsFolder() });
	return { client, db };
}

/**
 * TRUNCATE all public user tables to isolate test state.
 * Excludes the Drizzle migrations tracking table.
 * Uses CASCADE so FK-referencing tables are truncated in the right order.
 */
async function truncateAllTables(db: HyperIdleDb): Promise<void> {
	// @lore HyperIdleDb uses the abstract base PgQueryResultHKT, which resolves
	// db.execute() to PgRaw<unknown>. The runtime shape for PGlite is always
	// Results<T> = { rows: Row<T>[], ... }. The cast is unavoidable here because
	// HyperIdleDb must cover both PGlite and postgres-js drivers (both satisfy the
	// base PgDatabase<PgQueryResultHKT> contract). Making HyperIdleDb generic over
	// the HKT would propagate the type parameter to every caller — a larger change
	// than this file warrants. See connection.ts for the design rationale.
	const result = await db.execute(
		sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '__drizzle_migrations' ORDER BY tablename`,
	);
	const rows = (result as { rows: Array<{ tablename: string }> }).rows;
	if (rows.length === 0) return;

	const tableList = rows.map((r) => `"${r.tablename}"`).join(", ");
	await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`));
}

/**
 * Return a TestDbHandle backed by a pooled PGlite instance.
 *
 * If a pre-TRUNCATED instance is available in the pool, it is returned
 * immediately (~0ms overhead). Otherwise a new instance is allocated:
 * - First call per worker: cold WASM + migrations (~1s)
 * - Subsequent allocations: warm WASM + migrations (~700ms)
 *
 * `close()` TRUNCATEs the instance and returns it to the pool for reuse.
 *
 * Tests that call `createTestDb()` multiple times without calling `close()`
 * in between (e.g., per-user isolation tests that spin up multiple app
 * instances) each receive a separate PGlite instance, preserving full
 * isolation. Each instance is GC'd with the worker — in-memory PGlite
 * instances do not leak.
 *
 * Signature is identical to the original per-call factory so no test files
 * need changes.
 */
/**
 * Close all PGlite instances allocated by this worker.
 * Drains the pool and terminates every client so the event loop can exit.
 */
export async function closeAllInstances(): Promise<void> {
	const clients = allClients.splice(0);
	pool.length = 0;
	await Promise.allSettled(clients.map((c) => c.close()));
}

export async function createTestDb(): Promise<TestDbHandle> {
	// Take from pool if available (already TRUNCATED and ready)
	const pooled = pool.pop();

	let instance: PooledInstance;
	if (pooled) {
		// Fast path: clean pooled instance, no WASM allocation needed.
		instance = pooled;
	} else {
		// No clean pooled instance — allocate fresh.
		// @lore R6: We intentionally do NOT reclaim stale live instances here.
		// The original approach tried to reclaim open instances to avoid a PGlite
		// WASM global lock, but that breaks per-user isolation tests that hold two
		// live db handles simultaneously (e.g. hints.test.ts AC8). The simpler
		// correct approach is to always allocate fresh when the pool is empty.
		// Tests that don't call close() just leak the instance until the worker
		// is GC'd — acceptable because PGlite in-memory instances are tiny and
		// the worker lifetime is bounded by the test run.
		instance = await allocateInstance();
	}

	const { db } = instance;
	return {
		db,
		runMigrations: async () => {
			await migrate(db, { migrationsFolder: migrationsFolder() });
		},
		close: async () => {
			// TRUNCATE and return to pool for reuse by the next test.
			await truncateAllTables(instance.db);
			pool.push(instance);
		},
	};
}
