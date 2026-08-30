/**
 * U1 Schema Migration — Verification Tests
 *
 * These tests verify the U1 acceptance criteria:
 * "Schema Migration: Products → Teams + Bet Simplification"
 *
 * @lore U1: Rewritten from better-sqlite3 to PGLite (async) after the Phase 2
 * PGLite migration. All `db.run()`, `db.get()`, `db.all()` SQLite patterns
 * replaced with `await db.execute(sql.raw(...))` and PGLite-specific queries
 * (pg_tables, information_schema.columns, pg_indexes instead of sqlite_master,
 * PRAGMA table_info).
 *
 * @lore AU29: relocated verbatim from `framework/db/src/__tests__/` (task D) —
 * it is a seed-then-migrate suite, and its arrangement is the seeds
 * (`runFactoryBootstrap` + `seedDemoWorld`, both now living in this package).
 * AC6 (Zod schema exports) and AC7 (schema table exports) needed the WHOLE
 * `schema`/`zod-schemas` namespace object (including checking symbols are
 * ABSENT) — a same-package deep import inside `framework/db` before the move,
 * but a `db:schema-ns` crossing (the one-door surface `tools/governance/README.md`
 * forbids even for tests) once cross-package. Those two describe blocks never
 * touched a database, so they stayed behind as
 * `framework/db/src/__tests__/U1-schema-exports.test.ts`, a plain unit test
 * with same-package relative imports.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import { seedDemoWorld } from "../demo-fixture.js";
import { runFactoryBootstrap } from "../factory-bootstrap-runner.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PgColumnsRow {
	column_name: string;
	is_nullable: string;
	column_default: string | null;
}

/**
 * Query information_schema.columns for a given table.
 * Returns rows with column_name, is_nullable, column_default.
 */
async function columnsOf(db: HyperIdleDb, table: string): Promise<PgColumnsRow[]> {
	const result = await db.execute(
		sql.raw(
			`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position`,
		),
	);
	return (result as { rows: PgColumnsRow[] }).rows;
}

async function columnNamesOf(db: HyperIdleDb, table: string): Promise<string[]> {
	const cols = await columnsOf(db, table);
	return cols.map((c) => c.column_name);
}

async function tableExists(db: HyperIdleDb, tableName: string): Promise<boolean> {
	const result = await db.execute(
		sql.raw(`SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = '${tableName}'`),
	);
	const rows = (result as { rows: unknown[] }).rows;
	return rows.length > 0;
}

async function indexNamesForTable(db: HyperIdleDb, table: string): Promise<string[]> {
	const result = await db.execute(
		sql.raw(
			`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = '${table}'`,
		),
	);
	const rows = (result as { rows: Array<{ indexname: string }> }).rows;
	return rows.map((r) => r.indexname);
}

// ---------------------------------------------------------------------------
// AC1 + AC2: Table renames — products -> teams, teams -> team_members
// ---------------------------------------------------------------------------

// @lore AU44 B1: U1 AC2 tests (teams→team_members) removed — team_members dissolved back into teams
describe("U1 AC1: Table renames — products→teams", () => {
	test("AC1: `products` table no longer exists after migration", async ({ db }) => {
		expect(await tableExists(db, "products")).toBe(false);
	});

	test("AC1: `teams` table exists and has product-like columns (id, name, phase, created_at)", async ({
		db,
	}) => {
		const cols = await columnNamesOf(db, "teams");
		expect(cols).toContain("id");
		expect(cols).toContain("name");
		expect(cols).toContain("phase");
		expect(cols).toContain("created_at");
	});

	// @lore AU44 B1: team_members no longer exists (dissolved into teams); capacity/formed_at now on teams
	test("AC1: `team_members` table does not exist after AU44 B1", async ({ db }) => {
		expect(await tableExists(db, "team_members")).toBe(false);
	});

	test("AC1: `teams` table has capacity and formed_at columns (folded from team_members)", async ({
		db,
	}) => {
		const cols = await columnNamesOf(db, "teams");
		expect(cols).toContain("capacity");
		expect(cols).toContain("formed_at");
	});

	test("AC1: seed data round-trips — `teams` table holds the demo team row", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// @lore AF17: demo team id is now "demo-team-acme" (split from seed-product-1).
		const teamResult = await db.execute(
			sql.raw(`SELECT id, name FROM teams WHERE id = 'demo-team-acme'`),
		);
		const teamRows = (teamResult as { rows: Array<{ id: string; name: string }> }).rows;
		expect(teamRows.length).toBe(1);
		expect(teamRows[0]?.name).toBe("Acme");
	});
});

// ---------------------------------------------------------------------------
// AC1: FK rename — tasks.team_id references the `teams` table
// ---------------------------------------------------------------------------

describe("U1 AC1: FK rename on tasks", () => {
	test("tasks has team_id column (renamed from product_id)", async ({ db }) => {
		const cols = await columnNamesOf(db, "tasks");
		expect(cols).toContain("team_id");
		// product_id must be gone
		expect(cols).not.toContain("product_id");
	});

	// @lore BB1: bets table dropped — tasks FK test no longer inserts a parent bet row;
	// tasks are now root tasks (parentTaskId: null) or children of other tasks.
	test("tasks.team_id FK integrity: insert task referencing teams.id succeeds", async ({ db }) => {
		const now = new Date().toISOString();

		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-p2', 'MyTeam', 'build', '${now}')`,
			),
		);
		await db.execute(
			sql.raw(
				`INSERT INTO tasks (id, parent_task_id, team_id, title, state, created_at, updated_at) VALUES ('task-fk-1', NULL, 't-p2', 'Test task', 'proposed', '${now}', '${now}')`,
			),
		);

		const result = await db.execute(sql.raw(`SELECT id, team_id FROM tasks WHERE id='task-fk-1'`));
		const rows = (result as { rows: Array<{ id: string; team_id: string }> }).rows;
		expect(rows[0]?.team_id).toBe("t-p2");
	});
});


// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// AC8: Seed data — uses new names and produces valid records
// ---------------------------------------------------------------------------

describe("U1 AC8: Seed data uses new table/column names", () => {
	test("seed does not reference the products table (it was renamed to teams)", async ({ db }) => {
		await expect(runFactoryBootstrap(db).then(() => seedDemoWorld(db))).resolves.not.toThrow();
	});

	test("after seeding, teams table has at least 1 row (formerly products)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const result = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM teams`));
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBeGreaterThanOrEqual(1);
	});

	// @lore AU44 B1: team_members dissolved into teams — test removed

	test("after seeding, demo task uses team_id (not product_id)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// @lore AF17: task id updated to demo-task-daily-digest; team_id points to demo-team-acme
		const result = await db.execute(
			sql.raw(`SELECT team_id FROM tasks WHERE id = 'demo-task-daily-digest'`),
		);
		const rows = (result as { rows: Array<{ team_id: string }> }).rows;
		expect(rows.length).toBe(1);
		expect(rows[0]?.team_id).toBe("demo-team-acme");
	});

	test("seed is idempotent after migration (running twice does not error)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);
		await expect(runFactoryBootstrap(db).then(() => seedDemoWorld(db))).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Table-level schema correctness assertions (matches architecture spec §4.1)
// ---------------------------------------------------------------------------

describe("U1: Full table schema shape assertions", () => {
	test("teams table schema matches architecture spec §4.1 (formerly products)", async ({ db }) => {
		const cols = await columnNamesOf(db, "teams");
		expect(cols).toEqual(expect.arrayContaining(["id", "name", "phase", "created_at"]));
	});

	// @lore AU44 B1: team_members dissolved into teams — test removed

	test("tasks table schema has team_id (from product_id rename, no old team_id)", async ({
		db,
	}) => {
		const cols = await columnNamesOf(db, "tasks");
		expect(cols).toContain("team_id");
		expect(cols).not.toContain("product_id");
	});

	test("tasks_team_id_idx index exists (recreated from tasks_product_id_idx)", async ({ db }) => {
		const indexes = await indexNamesForTable(db, "tasks");
		expect(indexes).toContain("tasks_team_id_idx");
		expect(indexes).not.toContain("tasks_product_id_idx");
	});
});

// propagation_log: table dropped in AU44 batch6 (AU20 Ruling 2).
// The test for 'target_level rename' is deleted — the table is gone.
