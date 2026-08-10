import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { HyperIdleDb } from "../connection.js";
import * as schema from "../schema.js";

// ---------------------------------------------------------------------------
// Tracing
// ---------------------------------------------------------------------------

const TRACE_FILE = process.env.VITEST_TRACE_FILE;

function trace(event: string, durationMs: number, meta?: Record<string, unknown>): void {
	if (!TRACE_FILE) return;
	const entry = {
		ts: Date.now(),
		pid: process.pid,
		event,
		ms: Math.round(durationMs * 10) / 10,
		...meta,
	};
	try {
		appendFileSync(TRACE_FILE, `${JSON.stringify(entry)}\n`);
	} catch {}
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function resolveDirname(): string {
	const cjsDirname = Reflect.get(globalThis, "__dirname") as string | undefined;
	return cjsDirname ?? fileURLToPath(new URL(".", import.meta.url));
}

const MIGRATIONS_FOLDER = resolve(resolveDirname(), "../../drizzle");

export interface PooledInstance {
	readonly client: PGlite;
	readonly db: HyperIdleDb;
}

async function allocateInstance(): Promise<PooledInstance> {
	const t0 = performance.now();
	const client = new PGlite();
	await client.waitReady;
	const wasmMs = performance.now() - t0;
	const db = drizzle(client, { schema });
	const t1 = performance.now();
	await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	const migrateMs = performance.now() - t1;
	trace("allocate", performance.now() - t0, {
		wasm: Math.round(wasmMs),
		migrate: Math.round(migrateMs),
	});
	return { client, db };
}

async function truncateAllTables(db: HyperIdleDb): Promise<void> {
	const t0 = performance.now();
	const result = await db.execute(
		sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '__drizzle_migrations' ORDER BY tablename`,
	);
	const rows = (result as { rows: Array<{ tablename: string }> }).rows;
	if (rows.length === 0) {
		trace("truncate", performance.now() - t0, { tables: 0 });
		return;
	}
	const tableList = rows.map((r) => `"${r.tablename}"`).join(", ");
	await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`));
	trace("truncate", performance.now() - t0, { tables: rows.length });
}

// ---------------------------------------------------------------------------
// Pool — one instance per test FILE, pre-warmed at startup
//
// @lore pool-does-not-span-files: the comment here used to claim this pool
// "survives vitest's per-file module reloads" and that one PGlite instance is
// "reused across all 40-50 test files that thread processes". That is NOT what
// happens. The service project runs with `isolate: true`, which gives every test
// file a fresh execution context — so `globalThis` is fresh too, `warmPool()`
// sees `warmed: false`, and each file allocates its own instance.
//
// Measured (VITEST_TRACE_FILE, three files, same pid): three `allocate` events,
// ~1.47s each — 1.18s PGlite WASM boot + 0.30s migration. Across the 324-file
// service lane that is ~476s, which matches vitest's own reported
// `setup 472.89s` and is roughly HALF the lane's total CPU time.
//
// The pooling below is still live and correct WITHIN a file (checkout/checkin
// across that file's tests, with a truncate between). It just does not, and
// currently cannot, span files.
//
// Fixing it means taking PGlite out of process — one server per worker that
// files connect to over a socket, so a file pays a connect (~ms) instead of a
// WASM boot — or pointing the lane at a real Postgres in CI, which
// `createPostgresDb` in ../connection.ts already supports. `isolate: false` is
// NOT the fix: it is load-bearing against ES-module mock leakage (see the
// integration-isolation lore in vitest.integration.config.ts).
// ---------------------------------------------------------------------------

interface PoolState {
	primary: PooledInstance | null;
	primaryInUse: boolean;
	warmed: boolean;
}

const POOL_KEY = "__hyperidle_test_pool__";

function getState(): PoolState {
	const g = globalThis as Record<string, unknown>;
	if (!g[POOL_KEY]) {
		g[POOL_KEY] = { primary: null, primaryInUse: false, warmed: false };
	}
	return g[POOL_KEY] as PoolState;
}

export async function warmPool(): Promise<void> {
	const state = getState();
	if (state.warmed) return;
	const t0 = performance.now();
	state.primary = await allocateInstance();
	state.warmed = true;
	trace("warmPool", performance.now() - t0, { size: 1 });
}

export async function checkout(): Promise<PooledInstance> {
	const t0 = performance.now();
	const state = getState();

	if (!state.primary) {
		await warmPool();
	}

	if (!state.primary) {
		throw new Error("pool not warmed");
	}

	if (state.primaryInUse) {
		trace("checkout:fallback", 0, {});
		return allocateInstance();
	}

	state.primaryInUse = true;
	await truncateAllTables(state.primary.db);
	trace("checkout", performance.now() - t0, { source: "pool" });
	return state.primary;
}

export function checkin(instance: PooledInstance): void {
	const state = getState();
	if (instance === state.primary) {
		state.primaryInUse = false;
	} else {
		instance.client.close();
	}
}

export async function closeAll(): Promise<void> {
	const state = getState();
	if (state.primary) {
		await state.primary.client.close();
		state.primary = null;
	}
	state.primaryInUse = false;
	state.warmed = false;
}

if (typeof process.send === "function") {
	process.on("disconnect", () => {
		const state = getState();
		if (state.primary) {
			try {
				state.primary.client.close();
			} catch {}
		}
		process.exit(0);
	});
}
