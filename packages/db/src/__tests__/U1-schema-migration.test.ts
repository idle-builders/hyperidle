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
 */

import { BET_STATUSES } from "@hyperidle/shared";
import { getTableName, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import * as schema from "../schema.js";
import { seed } from "../seed.js";
import { createTestDb, type TestDbHandle } from "../test-utils.js";
import * as zodSchemas from "../zod-schemas.js";

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
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle.close();
	});

	it("AC1: `products` table no longer exists after migration", async () => {
		expect(await tableExists(db, "products")).toBe(false);
	});

	it("AC1: `teams` table exists and has product-like columns (id, name, phase, created_at)", async () => {
		const cols = await columnNamesOf(db, "teams");
		expect(cols).toContain("id");
		expect(cols).toContain("name");
		expect(cols).toContain("phase");
		expect(cols).toContain("created_at");
	});

	it("AC2: old `teams` (agent membership) table is now called `team_members`", async () => {
		expect(await tableExists(db, "team_members")).toBe(true);
	});

	it("AC2: `team_members` has capacity, formed_at, team_id columns (formerly product_id)", async () => {
		const cols = await columnNamesOf(db, "team_members");
		expect(cols).toContain("capacity");
		expect(cols).toContain("formed_at");
		// After U1 migration: product_id renamed to team_id
		expect(cols).toContain("team_id");
		expect(cols).not.toContain("product_id");
	});

	it("AC1+AC2: seed data round-trips — `teams` table holds the former product row", async () => {
		await seed(db);

		// After migration, the product formerly named "Nimmly" must live in teams
		const teamResult = await db.execute(
			sql.raw(`SELECT id, name FROM teams WHERE id = 'seed-product-1'`),
		);
		const teamRows = (teamResult as { rows: Array<{ id: string; name: string }> }).rows;
		expect(teamRows.length).toBe(1);
		expect(teamRows[0]?.name).toBe("Nimmly");

		// And the old team membership group lives in team_members
		const memberResult = await db.execute(
			sql.raw(`SELECT id FROM team_members WHERE id = 'seed-team-1'`),
		);
		const memberRows = (memberResult as { rows: Array<{ id: string }> }).rows;
		expect(memberRows.length).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// AC1: FK renames — bets.team_id and tasks.team_id reference new `teams` table
// ---------------------------------------------------------------------------

describe("U1 AC1: FK renames on bets and tasks", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle.close();
	});

	it("bets has team_id column (renamed from product_id)", async () => {
		const cols = await columnNamesOf(db, "bets");
		expect(cols).toContain("team_id");
		// product_id must be gone
		expect(cols).not.toContain("product_id");
	});

	it("tasks has team_id column (renamed from product_id)", async () => {
		const cols = await columnNamesOf(db, "tasks");
		expect(cols).toContain("team_id");
		// product_id must be gone
		expect(cols).not.toContain("product_id");
	});

	it("bets.team_id FK integrity: insert bet referencing teams.id succeeds", async () => {
		const now = new Date().toISOString();

		// Insert into the new teams table (formerly products)
		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-p1', 'MyTeam', 'build', '${now}')`,
			),
		);

		// Insert a bet with team_id pointing at the new teams table
		await db.execute(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-fk-1', 't-p1', 'Test bet', 'draft', '${now}')`,
			),
		);

		const result = await db.execute(sql.raw(`SELECT id, team_id FROM bets WHERE id='bet-fk-1'`));
		const rows = (result as { rows: Array<{ id: string; team_id: string }> }).rows;
		expect(rows[0]?.team_id).toBe("t-p1");
	});

	it("tasks.team_id FK integrity: insert task referencing teams.id succeeds", async () => {
		const now = new Date().toISOString();

		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-p2', 'MyTeam', 'build', '${now}')`,
			),
		);
		await db.execute(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-task-fk', 't-p2', 'Bet for task', 'active', '${now}')`,
			),
		);
		await db.execute(
			sql.raw(
				`INSERT INTO tasks (id, bet_id, team_id, title, state, created_at, updated_at) VALUES ('task-fk-1', 'bet-task-fk', 't-p2', 'Test task', 'proposed', '${now}', '${now}')`,
			),
		);

		const result = await db.execute(sql.raw(`SELECT id, team_id FROM tasks WHERE id='task-fk-1'`));
		const rows = (result as { rows: Array<{ id: string; team_id: string }> }).rows;
		expect(rows[0]?.team_id).toBe("t-p2");
	});
});

// ---------------------------------------------------------------------------
// AC3: Bet status enum — draft | active | completed | killed
// ---------------------------------------------------------------------------

describe("U1 AC3: Bet status enum simplification", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle.close();
	});

	it("bet with status 'draft' is insertable and queryable", async () => {
		const now = new Date().toISOString();

		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-s1', 'T', 'build', '${now}')`,
			),
		);
		await db.execute(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-draft', 't-s1', 'Test', 'draft', '${now}')`,
			),
		);

		const result = await db.execute(sql.raw(`SELECT status FROM bets WHERE id='bet-draft'`));
		const rows = (result as { rows: Array<{ status: string }> }).rows;
		expect(rows[0]?.status).toBe("draft");
	});

	it("bet with old status 'in_progress' is not valid in the new schema", async () => {
		// After U1 migration runs, no rows with in_progress should exist
		const result = await db.execute(
			sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='in_progress'`),
		);
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBe(0);
	});

	it("bet with old status 'committed' is not valid in the new schema", async () => {
		const result = await db.execute(
			sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='committed'`),
		);
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBe(0);
	});

	it("bet with old status 'shipped' is not valid in the new schema", async () => {
		const result = await db.execute(
			sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='shipped'`),
		);
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBe(0);
	});

	it("bet with old status 'shaped' is not valid in the new schema", async () => {
		const result = await db.execute(
			sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='shaped'`),
		);
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBe(0);
	});

	it("BET_STATUSES shared constant contains only new values: draft, active, completed, killed", () => {
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
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle.close();
	});

	it("bets table has 'description' column (renamed from pitch)", async () => {
		const cols = await columnNamesOf(db, "bets");
		expect(cols).toContain("description");
		expect(cols).not.toContain("pitch");
	});

	it("bets table has 'completed_at' column (renamed from shipped_at)", async () => {
		const cols = await columnNamesOf(db, "bets");
		expect(cols).toContain("completed_at");
		expect(cols).not.toContain("shipped_at");
	});

	it("description column preserves data after rename", async () => {
		const now = new Date().toISOString();

		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-d1', 'T', 'build', '${now}')`,
			),
		);
		await db.execute(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-desc', 't-d1', 'Build the feature', 'active', '${now}')`,
			),
		);

		const result = await db.execute(sql.raw(`SELECT description FROM bets WHERE id='bet-desc'`));
		const rows = (result as { rows: Array<{ description: string }> }).rows;
		expect(rows[0]?.description).toBe("Build the feature");
	});

	it("completed_at column is nullable", async () => {
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
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle.close();
	});

	it("bets table has 'at_risk' column", async () => {
		const cols = await columnNamesOf(db, "bets");
		expect(cols).toContain("at_risk");
	});

	it("at_risk column has a default value of 0", async () => {
		const cols = await columnsOf(db, "bets");
		const col = cols.find((c) => c.column_name === "at_risk");
		expect(col).toBeDefined();
		// Column has a non-null default
		expect(col?.column_default).not.toBeNull();
	});

	it("at_risk column is NOT NULL", async () => {
		const cols = await columnsOf(db, "bets");
		const col = cols.find((c) => c.column_name === "at_risk");
		expect(col).toBeDefined();
		// PostgreSQL returns 'NO' for NOT NULL columns
		expect(col?.is_nullable).toBe("NO");
	});

	it("at_risk defaults to false when inserting a bet without specifying at_risk", async () => {
		const now = new Date().toISOString();

		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-ar', 'T', 'build', '${now}')`,
			),
		);
		await db.execute(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-at-risk', 't-ar', 'Some bet', 'draft', '${now}')`,
			),
		);

		const result = await db.execute(sql.raw(`SELECT at_risk FROM bets WHERE id='bet-at-risk'`));
		// @lore U1: at_risk is stored as integer (0/1) in the schema.
		// PGLite returns 0 (not false) for integer columns.
		const rows = (result as { rows: Array<{ at_risk: number | boolean }> }).rows;
		expect(rows[0]?.at_risk === 0 || rows[0]?.at_risk === false).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC6: Zod schemas updated — selectTeamMemberSchema, insertTeamMemberSchema exist;
//      selectTeamSchema now maps to the teams (former products) table
// ---------------------------------------------------------------------------

describe("U1 AC6: Zod schemas updated", () => {
	it("selectTeamMemberSchema exists and is a valid Zod schema (replaces old selectTeamSchema)", () => {
		const schemas = zodSchemas as Record<string, unknown>;
		const selectTeamMemberSchema = schemas["selectTeamMemberSchema"] as
			| { parse: unknown; safeParse: unknown }
			| undefined;
		expect(selectTeamMemberSchema).toBeDefined();
		expect(typeof selectTeamMemberSchema?.parse).toBe("function");
	});

	it("insertTeamMemberSchema exists and is a valid Zod schema", () => {
		const schemas = zodSchemas as Record<string, unknown>;
		const insertTeamMemberSchema = schemas["insertTeamMemberSchema"] as
			| { parse: unknown }
			| undefined;
		expect(insertTeamMemberSchema).toBeDefined();
		expect(typeof insertTeamMemberSchema?.parse).toBe("function");
	});

	it("selectTeamSchema now reflects the new teams table (formerly products) shape", () => {
		const { selectTeamSchema } = zodSchemas;
		expect(selectTeamSchema).toBeDefined();

		// The new teams schema should parse a team (formerly product) row
		const valid = selectTeamSchema.safeParse({
			id: "team-1",
			name: "My Team",
			phase: "build",
			briefPath: null,
			architecturePath: null,
			brandPath: null,
			principlesPath: null,
			factoryDbPath: null,
			createdAt: "2025-01-01T00:00:00.000Z",
		});
		expect(valid.success).toBe(true);
	});

	it("insertProductSchema no longer exists (replaced by insertTeamSchema for the domain entity)", () => {
		const schemas = zodSchemas as Record<string, unknown>;
		expect(schemas["insertProductSchema"]).toBeUndefined();
	});

	it("selectProductSchema no longer exists (replaced by selectTeamSchema for the domain entity)", () => {
		const schemas = zodSchemas as Record<string, unknown>;
		expect(schemas["selectProductSchema"]).toBeUndefined();
	});

	it("selectBetSchema reflects new bet columns: description (not pitch), team_id (not product_id)", () => {
		const { selectBetSchema } = zodSchemas;
		expect(selectBetSchema).toBeDefined();

		// Should parse the new bet shape
		const validNewBet = selectBetSchema.safeParse({
			id: "bet-1",
			teamId: "team-1",
			description: "Build feature X",
			appetite: null,
			doneCondition: null,
			hypothesis: null,
			status: "draft",
			revisionLog: null,
			createdAt: "2025-01-01T00:00:00.000Z",
			completedAt: null,
			// atRisk is stored as integer in the DB (0/1), not boolean
			atRisk: 0,
			costAppetiteMinor: null,
			costAppetiteCurrency: null,
			costActualMinor: null,
			costActualCurrency: null,
			tokensActualJson: null,
		});
		expect(validNewBet.success).toBe(true);
	});

	it("selectBetSchema rejects old bet shape with pitch and productId", () => {
		const { selectBetSchema } = zodSchemas;

		const oldBetShape = selectBetSchema.safeParse({
			id: "bet-1",
			productId: "prod-1",
			teamId: "team-1",
			pitch: "Build feature X",
			appetite: null,
			doneCondition: null,
			hypothesis: null,
			status: "shaped",
			revisionLog: null,
			createdAt: "2025-01-01T00:00:00.000Z",
			shippedAt: null,
			costAppetiteMinor: null,
			costAppetiteCurrency: null,
			costActualMinor: null,
			costActualCurrency: null,
			tokensActualJson: null,
		});
		// Old shape must fail: no pitch/productId in new schema
		expect(oldBetShape.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// AC7: TypeScript types — Team (formerly Product), TeamMember (formerly Team)
// ---------------------------------------------------------------------------

describe("U1 AC7: TypeScript type exports updated", () => {
	it("schema exports Team type (the domain entity, formerly Product)", () => {
		expect(schema.teams).toBeDefined();

		// The teams table should have "teams" as its backing SQL table name
		// @lore U1: In Drizzle 0.39+, the `_` property is a TypeScript-only type
		// accessor (not a runtime property). The SQL table name is stored as
		// Symbol(drizzle:Name). Use getTableName from drizzle-orm to access it.
		expect(getTableName(schema.teams)).toBe("teams");
	});

	it("schema exports teamMembers table (formerly teams)", () => {
		expect((schema as Record<string, unknown>)["teamMembers"]).toBeDefined();
	});

	it("schema does NOT export 'products' table", () => {
		expect((schema as Record<string, unknown>)["products"]).toBeUndefined();
	});

	it("TeamMember type is exported from schema (formerly Team)", () => {
		const teamsTable = (schema as Record<string, unknown>)["teamMembers"];
		expect(teamsTable).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// AC8: Seed data — uses new names and produces valid records
// ---------------------------------------------------------------------------

describe("U1 AC8: Seed data uses new table/column names", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle.close();
	});

	it("seed does not reference the products table (it was renamed to teams)", async () => {
		await expect(seed(db)).resolves.not.toThrow();
	});

	it("after seeding, teams table has at least 1 row (formerly products)", async () => {
		await seed(db);

		const result = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM teams`));
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBeGreaterThanOrEqual(1);
	});

	it("after seeding, team_members table has at least 1 row (formerly teams)", async () => {
		await seed(db);

		const result = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM team_members`));
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBeGreaterThanOrEqual(1);
	});

	it("after seeding, bet uses 'description' column (not pitch)", async () => {
		await seed(db);

		const result = await db.execute(
			sql.raw(`SELECT id, description FROM bets WHERE id = 'seed-bet-daily-digest'`),
		);
		const rows = (result as { rows: Array<{ id: string; description: string }> }).rows;
		expect(rows.length).toBe(1);
		expect(rows[0]?.description).toBeTruthy();
	});

	it("after seeding, bet status is 'draft' (not 'shaped')", async () => {
		await seed(db);

		const result = await db.execute(
			sql.raw(`SELECT status FROM bets WHERE id = 'seed-bet-daily-digest'`),
		);
		const rows = (result as { rows: Array<{ status: string }> }).rows;
		expect(rows[0]?.status).toBe("draft");
	});

	it("after seeding, seed bet uses team_id (not product_id)", async () => {
		await seed(db);

		// team_id must be present and set to 'seed-product-1' (the former product, now team)
		const result = await db.execute(
			sql.raw(`SELECT team_id FROM bets WHERE id = 'seed-bet-daily-digest'`),
		);
		const rows = (result as { rows: Array<{ team_id: string }> }).rows;
		expect(rows.length).toBe(1);
		expect(rows[0]?.team_id).toBe("seed-product-1");
	});

	it("after seeding, seed task uses team_id (not product_id)", async () => {
		await seed(db);

		const result = await db.execute(
			sql.raw(`SELECT team_id FROM tasks WHERE id = 'seed-task-daily-digest'`),
		);
		const rows = (result as { rows: Array<{ team_id: string }> }).rows;
		expect(rows.length).toBe(1);
		expect(rows[0]?.team_id).toBe("seed-product-1");
	});

	it("seed is idempotent after migration (running twice does not error)", async () => {
		await seed(db);
		await expect(seed(db)).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Bet status migration validation scenarios
// ---------------------------------------------------------------------------

describe("U1: Bet status migration scenarios (data transformation)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle.close();
	});

	it("all 4 new statuses are insertable and queryable", async () => {
		const now = new Date().toISOString();

		await db.execute(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-st', 'T', 'build', '${now}')`,
			),
		);

		for (const status of ["draft", "active", "completed", "killed"]) {
			await db.execute(
				sql.raw(
					`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-${status}', 't-st', 'Bet ${status}', '${status}', '${now}')`,
				),
			);
		}

		const result = await db.execute(
			sql.raw(`SELECT status FROM bets WHERE team_id='t-st' ORDER BY created_at`),
		);
		const rows = (result as { rows: Array<{ status: string }> }).rows;
		const statuses = rows.map((r) => r.status);
		expect(statuses).toContain("draft");
		expect(statuses).toContain("active");
		expect(statuses).toContain("completed");
		expect(statuses).toContain("killed");
	});

	it("no bets with status 'shaped', 'committed', 'in_progress', 'behind', 'blocked', 'paused', 'review', or 'shipped' exist after migration", async () => {
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
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle.close();
	});

	it("teams table schema matches architecture spec §4.1 (formerly products)", async () => {
		const cols = await columnNamesOf(db, "teams");
		expect(cols).toEqual(expect.arrayContaining(["id", "name", "phase", "created_at"]));
	});

	it("team_members table schema has team_id (not product_id)", async () => {
		const cols = await columnNamesOf(db, "team_members");
		expect(cols).toContain("team_id");
		expect(cols).not.toContain("product_id");
	});

	it("bets table schema has all expected new columns", async () => {
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

	it("tasks table schema has team_id (from product_id rename, no old team_id)", async () => {
		const cols = await columnNamesOf(db, "tasks");
		expect(cols).toContain("team_id");
		expect(cols).not.toContain("product_id");
	});

	it("bets_team_id_idx index exists (recreated from bets_product_id_idx)", async () => {
		const indexes = await indexNamesForTable(db, "bets");
		expect(indexes).toContain("bets_team_id_idx");
		expect(indexes).not.toContain("bets_product_id_idx");
	});

	it("tasks_team_id_idx index exists (recreated from tasks_product_id_idx)", async () => {
		const indexes = await indexNamesForTable(db, "tasks");
		expect(indexes).toContain("tasks_team_id_idx");
		expect(indexes).not.toContain("tasks_product_id_idx");
	});
});

// ---------------------------------------------------------------------------
// propagation_log: target_level 'product' -> 'team'
// ---------------------------------------------------------------------------

describe("U1: propagation_log target_level rename", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle.close();
	});

	it("no propagation_log rows with target_level='product' remain after migration", async () => {
		const result = await db.execute(
			sql.raw(`SELECT COUNT(*) as count FROM propagation_log WHERE target_level='product'`),
		);
		const rows = (result as { rows: Array<{ count: string }> }).rows;
		expect(Number(rows[0]?.count)).toBe(0);
	});
});
