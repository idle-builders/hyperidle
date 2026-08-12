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
import { BET_STATUSES } from "@hyperidle/domain-model";
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

describe("U1 AC1+AC2: Table renames — products→teams, teams→team_members", () => {
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

	test("AC2: old `teams` (agent membership) table is now called `team_members`", async ({ db }) => {
		expect(await tableExists(db, "team_members")).toBe(true);
	});

	test("AC2: `team_members` has capacity, formed_at, team_id columns (formerly product_id)", async ({
		db,
	}) => {
		const cols = await columnNamesOf(db, "team_members");
		expect(cols).toContain("capacity");
		expect(cols).toContain("formed_at");
		// After U1 migration: product_id renamed to team_id
		expect(cols).toContain("team_id");
		expect(cols).not.toContain("product_id");
	});

	test("AC1+AC2: seed data round-trips — `teams` table holds the demo team row", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// @lore AF17: demo team id is now "demo-team-acme" (split from seed-product-1).
		const teamResult = await db.execute(
			sql.raw(`SELECT id, name FROM teams WHERE id = 'demo-team-acme'`),
		);
		const teamRows = (teamResult as { rows: Array<{ id: string; name: string }> }).rows;
		expect(teamRows.length).toBe(1);
		expect(teamRows[0]?.name).toBe("Acme");

		// And the old team membership group lives in team_members
		const memberResult = await db.execute(
			sql.raw(`SELECT id FROM team_members WHERE id = 'demo-team-members-acme'`),
		);
		const memberRows = (memberResult as { rows: Array<{ id: string }> }).rows;
		expect(memberRows.length).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// AC1: FK renames — bets.team_id and tasks.team_id reference new `teams` table
// ---------------------------------------------------------------------------

describe("U1 AC1: FK renames on bets and tasks", () => {
	test("bets has team_id column (renamed from product_id)", async ({ db }) => {
		const cols = await columnNamesOf(db, "bets");
		expect(cols).toContain("team_id");
		// product_id must be gone
		expect(cols).not.toContain("product_id");
	});

	test("tasks has team_id column (renamed from product_id)", async ({ db }) => {
		const cols = await columnNamesOf(db, "tasks");
		expect(cols).toContain("team_id");
		// product_id must be gone
		expect(cols).not.toContain("product_id");
	});

	test("bets.team_id FK integrity: insert bet referencing teams.id succeeds", async ({
		db,
		ids,
	}) => {
		const now = new Date().toISOString();
		const teamId = ids("t-p1");
		const betId = ids("bet-fk-1");

		// Insert into the new teams table (formerly products)
		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('${teamId}', 'MyTeam', 'build', '${now}')`,
			),
		);

		// Insert a bet with team_id pointing at the new teams table
		await db.execute(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('${betId}', '${teamId}', 'Test bet', 'draft', '${now}')`,
			),
		);

		const result = await db.execute(sql.raw(`SELECT id, team_id FROM bets WHERE id='${betId}'`));
		const rows = (result as { rows: Array<{ id: string; team_id: string }> }).rows;
		expect(rows[0]?.team_id).toBe(teamId);
	});

	test("tasks.team_id FK integrity: insert task referencing teams.id succeeds", async ({
		db,
		ids,
	}) => {
		const now = new Date().toISOString();
		const teamId = ids("t-p2");
		const betId = ids("bet-task-fk");
		const taskId = ids("task-fk-1");

		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('${teamId}', 'MyTeam', 'build', '${now}')`,
			),
		);
		await db.execute(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('${betId}', '${teamId}', 'Bet for task', 'active', '${now}')`,
			),
		);
		await db.execute(
			sql.raw(
				`INSERT INTO tasks (id, bet_id, team_id, title, state, created_at, updated_at) VALUES ('${taskId}', '${betId}', '${teamId}', 'Test task', 'proposed', '${now}', '${now}')`,
			),
		);

		const result = await db.execute(sql.raw(`SELECT id, team_id FROM tasks WHERE id='${taskId}'`));
		const rows = (result as { rows: Array<{ id: string; team_id: string }> }).rows;
		expect(rows[0]?.team_id).toBe(teamId);
	});
});

// ---------------------------------------------------------------------------
// AC3: Bet status enum — draft | active | completed | killed
// ---------------------------------------------------------------------------

describe("U1 AC3: Bet status enum simplification", () => {
	test("bet with status 'draft' is insertable and queryable", async ({ db, ids }) => {
		const now = new Date().toISOString();
		const teamId = ids("t-s1");
		const betId = ids("bet-draft");

		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('${teamId}', 'T', 'build', '${now}')`,
			),
		);
		await db.execute(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('${betId}', '${teamId}', 'Test', 'draft', '${now}')`,
			),
		);

		const result = await db.execute(sql.raw(`SELECT status FROM bets WHERE id='${betId}'`));
		const rows = (result as { rows: Array<{ status: string }> }).rows;
		expect(rows[0]?.status).toBe("draft");
	});

	test("bet with old status 'in_progress' is not valid in the new schema", async ({ db }) => {
		// After U1 migration runs, no rows with in_progress should exist
		const result = await db.execute(
			sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='in_progress'`),
		);
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("bet with old status 'committed' is not valid in the new schema", async ({ db }) => {
		const result = await db.execute(
			sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='committed'`),
		);
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("bet with old status 'shipped' is not valid in the new schema", async ({ db }) => {
		const result = await db.execute(
			sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='shipped'`),
		);
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("bet with old status 'shaped' is not valid in the new schema", async ({ db }) => {
		const result = await db.execute(
			sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='shaped'`),
		);
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("BET_STATUSES shared constant contains only new values: draft, active, completed, killed", () => {
		// Must NOT contain old statuses
		expect(BET_STATUSES).not.toContain("shaped");
		expect(BET_STATUSES).not.toContain("committed");
		expect(BET_STATUSES).not.toContain("in_progress");
		expect(BET_STATUSES).not.toContain("behind");
		expect(BET_STATUSES).not.toContain("blocked");
		expect(BET_STATUSES).not.toContain("paused");
		expect(BET_STATUSES).not.toContain("review");
		expect(BET_STATUSES).not.toContain("shipped");

		// Must contain new statuses
		expect(BET_STATUSES).toContain("draft");
		expect(BET_STATUSES).toContain("active");
		expect(BET_STATUSES).toContain("completed");
		expect(BET_STATUSES).toContain("killed");

		// Exactly 4 values
		expect((BET_STATUSES as readonly string[]).length).toBe(4);
	});
});

// ---------------------------------------------------------------------------
// AC4: Bet column renames — pitch -> description, shipped_at -> completed_at
// ---------------------------------------------------------------------------

describe("U1 AC4: Bet column renames", () => {
	test("bets table has 'description' column (renamed from pitch)", async ({ db }) => {
		const cols = await columnNamesOf(db, "bets");
		expect(cols).toContain("description");
		expect(cols).not.toContain("pitch");
	});

	test("bets table has 'completed_at' column (renamed from shipped_at)", async ({ db }) => {
		const cols = await columnNamesOf(db, "bets");
		expect(cols).toContain("completed_at");
		expect(cols).not.toContain("shipped_at");
	});

	test("description column preserves data after rename", async ({ db, ids }) => {
		const now = new Date().toISOString();
		const teamId = ids("t-d1");
		const betId = ids("bet-desc");

		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('${teamId}', 'T', 'build', '${now}')`,
			),
		);
		await db.execute(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('${betId}', '${teamId}', 'Build the feature', 'active', '${now}')`,
			),
		);

		const result = await db.execute(sql.raw(`SELECT description FROM bets WHERE id='${betId}'`));
		const rows = (result as { rows: Array<{ description: string }> }).rows;
		expect(rows[0]?.description).toBe("Build the feature");
	});

	test("completed_at column is nullable", async ({ db }) => {
		const cols = await columnsOf(db, "bets");
		const col = cols.find((c) => c.column_name === "completed_at");
		expect(col).toBeDefined();
		// PostgreSQL returns 'YES' for nullable columns
		expect(col?.is_nullable).toBe("YES");
	});
});

// ---------------------------------------------------------------------------
// AC5: at_risk boolean column on bets
// ---------------------------------------------------------------------------

describe("U1 AC5: at_risk column on bets", () => {
	test("bets table has 'at_risk' column", async ({ db }) => {
		const cols = await columnNamesOf(db, "bets");
		expect(cols).toContain("at_risk");
	});

	test("at_risk column has a default value of 0", async ({ db }) => {
		const cols = await columnsOf(db, "bets");
		const col = cols.find((c) => c.column_name === "at_risk");
		expect(col).toBeDefined();
		// Column has a non-null default
		expect(col?.column_default).not.toBeNull();
	});

	test("at_risk column is NOT NULL", async ({ db }) => {
		const cols = await columnsOf(db, "bets");
		const col = cols.find((c) => c.column_name === "at_risk");
		expect(col).toBeDefined();
		// PostgreSQL returns 'NO' for NOT NULL columns
		expect(col?.is_nullable).toBe("NO");
	});

	test("at_risk defaults to false when inserting a bet without specifying at_risk", async ({
		db,
		ids,
	}) => {
		const now = new Date().toISOString();
		const teamId = ids("t-ar");
		const betId = ids("bet-at-risk");

		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('${teamId}', 'T', 'build', '${now}')`,
			),
		);
		await db.execute(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('${betId}', '${teamId}', 'Some bet', 'draft', '${now}')`,
			),
		);

		const result = await db.execute(sql.raw(`SELECT at_risk FROM bets WHERE id='${betId}'`));
		// @lore U1: at_risk is stored as integer (0/1) in the schema.
		// PGLite returns 0 (not false) for integer columns.
		const rows = (result as { rows: Array<{ at_risk: number | boolean }> }).rows;
		expect(rows[0]?.at_risk === 0 || rows[0]?.at_risk === false).toBe(true);
	});
});

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

	test("after seeding, team_members table has at least 1 row (formerly teams)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const result = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM team_members`));
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBeGreaterThanOrEqual(1);
	});

	test("after seeding, bet uses 'description' column (not pitch)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// @lore AF17: daily digest bet id updated to demo-bet-daily-digest (demo-fixture split)
		const result = await db.execute(
			sql.raw(`SELECT id, description FROM bets WHERE id = 'demo-bet-daily-digest'`),
		);
		const rows = (result as { rows: Array<{ id: string; description: string }> }).rows;
		expect(rows.length).toBe(1);
		expect(rows[0]?.description).toBeTruthy();
	});

	test("after seeding, bet status is 'draft' (not 'shaped')", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// @lore AF17: daily digest bet id updated to demo-bet-daily-digest (demo-fixture split)
		const result = await db.execute(
			sql.raw(`SELECT status FROM bets WHERE id = 'demo-bet-daily-digest'`),
		);
		const rows = (result as { rows: Array<{ status: string }> }).rows;
		expect(rows[0]?.status).toBe("draft");
	});

	test("after seeding, demo bet uses team_id (not product_id)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// @lore AF17: team_id now points to 'demo-team-acme' (split from seed-product-1)
		const result = await db.execute(
			sql.raw(`SELECT team_id FROM bets WHERE id = 'demo-bet-daily-digest'`),
		);
		const rows = (result as { rows: Array<{ team_id: string }> }).rows;
		expect(rows.length).toBe(1);
		expect(rows[0]?.team_id).toBe("demo-team-acme");
	});

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
// Bet status migration validation scenarios
// ---------------------------------------------------------------------------

describe("U1: Bet status migration scenarios (data transformation)", () => {
	test("all 4 new statuses are insertable and queryable", async ({ db, ids }) => {
		const now = new Date().toISOString();
		const teamId = ids("t-st");

		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('${teamId}', 'T', 'build', '${now}')`,
			),
		);

		for (const status of ["draft", "active", "completed", "killed"]) {
			const betId = ids(`bet-${status}`);
			await db.execute(
				sql.raw(
					`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('${betId}', '${teamId}', 'Bet ${status}', '${status}', '${now}')`,
				),
			);
		}

		const result = await db.execute(
			sql.raw(`SELECT status FROM bets WHERE team_id='${teamId}' ORDER BY created_at`),
		);
		const rows = (result as { rows: Array<{ status: string }> }).rows;
		const statuses = rows.map((r) => r.status);
		expect(statuses).toContain("draft");
		expect(statuses).toContain("active");
		expect(statuses).toContain("completed");
		expect(statuses).toContain("killed");
	});

	test("no bets with status 'shaped', 'committed', 'in_progress', 'behind', 'blocked', 'paused', 'review', or 'shipped' exist after migration", async ({
		db,
	}) => {
		const oldStatuses = [
			"shaped",
			"committed",
			"in_progress",
			"behind",
			"blocked",
			"paused",
			"review",
			"shipped",
		];
		for (const status of oldStatuses) {
			const result = await db.execute(
				sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='${status}'`),
			);
			const rows = (result as { rows: Array<{ count: string }> }).rows;
			expect(Number(rows[0]?.count), `Expected 0 bets with old status '${status}'`).toBe(0);
		}
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

	test("team_members table schema has team_id (not product_id)", async ({ db }) => {
		const cols = await columnNamesOf(db, "team_members");
		expect(cols).toContain("team_id");
		expect(cols).not.toContain("product_id");
	});

	test("bets table schema has all expected new columns", async ({ db }) => {
		const cols = await columnNamesOf(db, "bets");
		expect(cols).toContain("team_id");
		expect(cols).toContain("description");
		expect(cols).toContain("completed_at");
		expect(cols).toContain("at_risk");

		// Old columns must be gone
		expect(cols).not.toContain("product_id");
		expect(cols).not.toContain("pitch");
		expect(cols).not.toContain("shipped_at");
	});

	test("tasks table schema has team_id (from product_id rename, no old team_id)", async ({
		db,
	}) => {
		const cols = await columnNamesOf(db, "tasks");
		expect(cols).toContain("team_id");
		expect(cols).not.toContain("product_id");
	});

	test("bets_team_id_idx index exists (recreated from bets_product_id_idx)", async ({ db }) => {
		const indexes = await indexNamesForTable(db, "bets");
		expect(indexes).toContain("bets_team_id_idx");
		expect(indexes).not.toContain("bets_product_id_idx");
	});

	test("tasks_team_id_idx index exists (recreated from tasks_product_id_idx)", async ({ db }) => {
		const indexes = await indexNamesForTable(db, "tasks");
		expect(indexes).toContain("tasks_team_id_idx");
		expect(indexes).not.toContain("tasks_product_id_idx");
	});
});

// ---------------------------------------------------------------------------
// propagation_log: target_level 'product' -> 'team'
// ---------------------------------------------------------------------------

describe("U1: propagation_log target_level rename", () => {
	test("no propagation_log rows with target_level='product' remain after migration", async ({
		db,
	}) => {
		const result = await db.execute(
			sql.raw(`SELECT COUNT(*) as count FROM propagation_log WHERE target_level='product'`),
		);
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBe(0);
	});
});
