import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { HyperIdleDb } from "../connection.js";
import * as schema from "../schema.js";

// ---------------------------------------------------------------------------
// Tracing (opt-in via VITEST_TRACE_FILE env var)
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
	} catch {
		// Best-effort trace write — a failure here must never break the test run.
	}
}

// ---------------------------------------------------------------------------
// Dirname resolution
// ---------------------------------------------------------------------------

function resolveDirname(): string {
	const cjsDirname = Reflect.get(globalThis, "__dirname") as string | undefined;
	return cjsDirname ?? fileURLToPath(new URL(".", import.meta.url));
}

const DIRNAME = resolveDirname();

function migrationsFolder(): string {
	return resolve(DIRNAME, "../../drizzle");
}

// ---------------------------------------------------------------------------
// Pool: fixed set of pre-warmed PGlite instances
// ---------------------------------------------------------------------------

const POOL_SIZE = Number(process.env.VITEST_POOL_SIZE) || 2;

interface PooledInstance {
	readonly client: PGlite;
	readonly db: PgliteDatabase<typeof schema>;
}

interface Slot {
	instance: PooledInstance;
	checkedOut: boolean;
	checkedOutAt: number;
}

const slots: Slot[] = [];
let warmupDone = false;

async function allocateInstance(): Promise<PooledInstance> {
	const t0 = performance.now();
	const client = new PGlite();
	await client.waitReady;
	const wasmMs = performance.now() - t0;
	const db = drizzle(client, { schema });
	const t1 = performance.now();
	await migrate(db, { migrationsFolder: migrationsFolder() });
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

/**
 * Pre-warm the pool. Called from vitest-setup.ts at worker startup.
 * Allocates POOL_SIZE instances with migrations applied.
 */
export async function warmPool(): Promise<void> {
	if (warmupDone) return;
	const t0 = performance.now();
	const instances = await Promise.all(Array.from({ length: POOL_SIZE }, () => allocateInstance()));
	for (const instance of instances) {
		slots.push({ instance, checkedOut: false, checkedOutAt: 0 });
	}
	warmupDone = true;
	trace("warmPool", performance.now() - t0, { size: POOL_SIZE });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TestDbHandle {
	readonly db: HyperIdleDb;
	runMigrations(): Promise<void>;
	close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDbHandle> {
	const t0 = performance.now();

	let slot: Slot | undefined;

	// 1. Take a free slot
	slot = slots.find((s) => !s.checkedOut);

	// 2. No free slot — allocate a fresh instance.
	// @lore: isolation — concurrent tests hold two live handles; reclaiming first breaks isolation; fresh alloc safe (PGlite in-memory)
	if (!slot) {
		const instance = await allocateInstance();
		slot = { instance, checkedOut: false, checkedOutAt: 0 };
		slots.push(slot);
	}

	slot.checkedOut = true;
	slot.checkedOutAt = performance.now();

	await truncateAllTables(slot.instance.db);

	const source = warmupDone && slots.length > 0 ? "pool" : "fresh";
	trace("createTestDb", performance.now() - t0, { source });

	const capturedSlot = slot;
	return {
		db: capturedSlot.instance.db,
		runMigrations: async () => {
			await migrate(capturedSlot.instance.db, { migrationsFolder: migrationsFolder() });
		},
		close: () => {
			capturedSlot.checkedOut = false;
			return Promise.resolve();
		},
	};
}

export async function closeAllInstances(): Promise<void> {
	await Promise.allSettled(slots.map((s) => s.instance.client.close()));
	slots.length = 0;
	warmupDone = false;
}

// Cleanup on worker exit
if (typeof process.send === "function") {
	process.on("disconnect", () => {
		for (const s of slots) {
			try {
				s.instance.client.close();
			} catch {
				// Process is exiting either way — a close failure here is moot.
			}
		}
		process.exit(0);
	});
}
