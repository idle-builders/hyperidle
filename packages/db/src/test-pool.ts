import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { HyperIdleDb } from "./connection.js";
import * as schema from "./schema.js";

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
		appendFileSync(TRACE_FILE, JSON.stringify(entry) + "\n");
	} catch {}
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function resolveDirname(): string {
	const cjsDirname = Reflect.get(globalThis, "__dirname") as string | undefined;
	return cjsDirname ?? fileURLToPath(new URL(".", import.meta.url));
}

const MIGRATIONS_FOLDER = resolve(resolveDirname(), "../drizzle");

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
// Pool — one instance per worker, pre-warmed at startup
// ---------------------------------------------------------------------------

let primary: PooledInstance | null = null;
let primaryInUse = false;
let warmed = false;

export async function warmPool(): Promise<void> {
	if (warmed) return;
	const t0 = performance.now();
	primary = await allocateInstance();
	warmed = true;
	trace("warmPool", performance.now() - t0, { size: 1 });
}

export async function checkout(): Promise<PooledInstance> {
	const t0 = performance.now();

	if (!primary) {
		await warmPool();
	}

	if (primaryInUse) {
		// Rare path: test needs a second handle (multi-user isolation).
		// Allocate on demand — slow but correct.
		trace("checkout:fallback", 0, {});
		return allocateInstance();
	}

	primaryInUse = true;
	await truncateAllTables(primary!.db);
	trace("checkout", performance.now() - t0, { source: "pool" });
	return primary!;
}

export function checkin(instance: PooledInstance): void {
	if (instance === primary) {
		primaryInUse = false;
	} else {
		// Fallback instance — close it
		instance.client.close();
	}
}

export async function closeAll(): Promise<void> {
	if (primary) {
		await primary.client.close();
		primary = null;
	}
	primaryInUse = false;
	warmed = false;
}

// Cleanup on worker exit
if (typeof process.send === "function") {
	process.on("disconnect", () => {
		if (primary) {
			try {
				primary.client.close();
			} catch {}
		}
		process.exit(0);
	});
}
