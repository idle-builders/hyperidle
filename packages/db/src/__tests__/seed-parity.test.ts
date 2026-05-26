import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import { createPgTestDb } from "../pg-test-utils.js";
import * as pgSchema from "../schema.pg.js";
import { seed } from "../seed.js";
import { createTestDb } from "../test-utils.js";

// @lore `seedPg` does not yet exist as of I3 red phase. Per plan §3.8 the
// implementation extracts the seed fixtures into a shared `seed-fixtures.ts`
// and exposes a `seedPg(db)` function that takes a pglite-backed Drizzle
// instance and writes the same logical fixtures. We dynamic-import so the
// test file can load (and report assertion failures) before the module
// exists; once implemented, the import resolves and all assertions run.
type SeedPgFn = (
	db: ReturnType<typeof createPgTestDb> extends Promise<infer T> ? T["db"] : never,
) => Promise<void>;
let seedPg: SeedPgFn;
try {
	const mod = (await import("../seed-pg.js")) as { seedPg: SeedPgFn };
	seedPg = mod.seedPg;
} catch {
	seedPg = (() => {
		throw new Error("seedPg not yet implemented (I3 red phase)");
	}) as SeedPgFn;
}

/**
 * I3 — seed parity acceptance tests.
 *
 * Per AC (TRACK-I.md L163) the PG seed must produce the same logical fixture
 * set as the SQLite seed: same agent IDs, team IDs, bet IDs, task IDs,
 * routine IDs, and the same count of knowledge items. Per plan §3.8 we
 * achieve this by extracting the shape-neutral fixtures into a shared
 * module and writing them via two thin coercion wrappers (one per dialect).
 */

interface RowCount {
	count: number;
}

async function pgCount(
	client: ReturnType<typeof createPgTestDb> extends Promise<infer T> ? T : never,
	table: string,
): Promise<number> {
	const rows = await client.client.query<RowCount>(`SELECT COUNT(*)::int as count FROM ${table}`);
	return rows.rows[0]?.count ?? 0;
}

function sqliteCount(db: HyperIdleDb, table: string): number {
	const row = db.get<RowCount>(sql.raw(`SELECT COUNT(*) as count FROM ${table}`));
	return row?.count ?? 0;
}

async function pgIds<T extends { id: string }>(
	client: ReturnType<typeof createPgTestDb> extends Promise<infer T2> ? T2 : never,
	table: string,
): Promise<string[]> {
	const rows = await client.client.query<T>(`SELECT id FROM ${table} ORDER BY id`);
	return rows.rows.map((r) => r.id).sort();
}

function sqliteIds(db: HyperIdleDb, table: string): string[] {
	const rows = db.all<{ id: string }>(sql.raw(`SELECT id FROM ${table} ORDER BY id`));
	return rows.map((r) => r.id).sort();
}

describe("I3: SQLite/PG seed parity", () => {
	let sqliteDb: HyperIdleDb;
	let pgHandle: Awaited<ReturnType<typeof createPgTestDb>>;

	beforeEach(async () => {
		sqliteDb = createTestDb();
		seed(sqliteDb);
		pgHandle = await createPgTestDb({ migrate: true });
		await seedPg(pgHandle.db);
		return async () => {
			await pgHandle.close();
		};
	});

	it("produces the same set of user IDs", async () => {
		// @lore P2: agents → users table
		const sq = sqliteIds(sqliteDb, "users");
		const pg = await pgIds(pgHandle, "users");
		expect(pg).toEqual(sq);
	});

	it("produces the same set of team IDs", async () => {
		const sq = sqliteIds(sqliteDb, "teams");
		const pg = await pgIds(pgHandle, "teams");
		expect(pg).toEqual(sq);
	});

	it("produces the same set of bet IDs", async () => {
		const sq = sqliteIds(sqliteDb, "bets");
		const pg = await pgIds(pgHandle, "bets");
		expect(pg).toEqual(sq);
	});

	it("produces the same set of task IDs", async () => {
		const sq = sqliteIds(sqliteDb, "tasks");
		const pg = await pgIds(pgHandle, "tasks");
		expect(pg).toEqual(sq);
	});

	it("produces the same set of routine IDs", async () => {
		const sq = sqliteIds(sqliteDb, "routines");
		const pg = await pgIds(pgHandle, "routines");
		expect(pg).toEqual(sq);
	});

	it("produces the same number of knowledge items", async () => {
		const sq = sqliteCount(sqliteDb, "knowledge_items");
		const pg = await pgCount(pgHandle, "knowledge_items");
		expect(pg).toBe(sq);
		expect(pg).toBeGreaterThanOrEqual(1);
	});

	it("produces the same number of products", async () => {
		const sq = sqliteCount(sqliteDb, "products");
		const pg = await pgCount(pgHandle, "products");
		expect(pg).toBe(sq);
	});

	it("produces ≥1 row in each major reference table on the PG side", async () => {
		// @lore P2: agents → users
		for (const table of ["users", "teams", "products", "bets", "tasks", "routines"]) {
			const n = await pgCount(pgHandle, table);
			expect(n, `${table} should have ≥1 row`).toBeGreaterThanOrEqual(1);
		}
	});

	it("PG seed exposes the exported pgSchema (sanity check)", () => {
		// Sanity: ensure the test imports resolved. @lore P2: agents → users
		expect(pgSchema.users).toBeDefined();
	});
});
