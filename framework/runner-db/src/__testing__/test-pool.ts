import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { RunnerDb } from "../connection.js";
import * as schema from "../schema.js";

function resolveDirname(): string {
	const cjsDirname = Reflect.get(globalThis, "__dirname") as string | undefined;
	return cjsDirname ?? fileURLToPath(new URL(".", import.meta.url));
}

const MIGRATIONS_FOLDER = resolve(resolveDirname(), "../../drizzle");

export interface PooledInstance {
	readonly client: PGlite;
	readonly db: RunnerDb;
}

async function allocateInstance(): Promise<PooledInstance> {
	const client = new PGlite();
	await client.waitReady;
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return { client, db };
}

async function truncateAllTables(db: RunnerDb): Promise<void> {
	const result = await db.execute(
		sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '__drizzle_migrations' ORDER BY tablename`,
	);
	const rows = (result as { rows: Array<{ tablename: string }> }).rows;
	if (rows.length === 0) return;
	const tableList = rows.map((r) => `"${r.tablename}"`).join(", ");
	await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`));
}

interface PoolState {
	primary: PooledInstance | null;
	primaryInUse: boolean;
	warmed: boolean;
}

const POOL_KEY = "__hyperidle_runner_db_test_pool__";

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
	state.primary = await allocateInstance();
	state.warmed = true;
}

export async function checkout(): Promise<PooledInstance> {
	const state = getState();
	if (!state.primary) await warmPool();
	if (!state.primary) throw new Error("runner-db test pool not warmed");

	if (state.primaryInUse) return allocateInstance();

	state.primaryInUse = true;
	await truncateAllTables(state.primary.db);
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
