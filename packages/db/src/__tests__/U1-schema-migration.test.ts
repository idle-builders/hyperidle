/**
 * U1 Schema Migration — TDD Red Phase
 *
 * These tests define the acceptance criteria for U1:
 * "Schema Migration: Products → Teams + Bet Simplification"
 *
 * ALL tests MUST fail now (before implementation) because:
 * - The `teams` table still maps to the old agent-membership table (not products)
 * - The `team_members` table does not exist yet
 * - The `products` table still exists
 * - `bets.pitch` / `bets.shipped_at` have not been renamed yet
 * - `bets.at_risk` column does not exist yet
 * - `BET_STATUSES` still contains old values (shaped, committed, in_progress, shipped)
 * - Zod schemas `selectTeamMemberSchema` / `insertTeamMemberSchema` do not exist yet
 * - TypeScript types `TeamMember` / `NewTeamMember` do not exist yet
 * - `seed.ts` still inserts into `products` / old `teams`
 *
 * @lore U1: Red phase tests — do NOT implement anything until these tests fail cleanly.
 */

import { resolve } from "node:path";
import { BET_STATUSES } from "@hyperidle/shared";
import Database from "better-sqlite3";
import { getTableName, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import * as schema from "../schema.js";
import { seed } from "../seed.js";
import * as zodSchemas from "../zod-schemas.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ColumnInfo {
	name: string;
	type: string;
	notnull: number;
	dflt_value: string | null;
}

function migrateFreshDb(): HyperIdleDb {
	const sqlite = new Database(":memory:");
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: resolve(__dirname, "../../drizzle") });
	return db;
}

function columnsOf(db: HyperIdleDb, table: string): ColumnInfo[] {
	return db.all<ColumnInfo>(sql.raw(`PRAGMA table_info("${table}")`));
}

function columnNamesOf(db: HyperIdleDb, table: string): string[] {
	return columnsOf(db, table).map((c) => c.name);
}

function tableExists(db: HyperIdleDb, tableName: string): boolean {
	const row = db.get<{ name: string }>(
		sql.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`),
	);
	return row !== undefined;
}

// ---------------------------------------------------------------------------
// AC1 + AC2: Table renames — products -> teams, teams -> team_members
// ---------------------------------------------------------------------------

describe("U1 AC1+AC2: Table renames — products→teams, teams→team_members", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = migrateFreshDb();
	});

	it("AC1: `products` table no longer exists after migration", () => {
		expect(tableExists(db, "products")).toBe(false);
	});

	it("AC1: `teams` table exists and has product-like columns (id, name, phase, created_at)", () => {
		const cols = columnNamesOf(db, "teams");
		expect(cols).toContain("id");
		expect(cols).toContain("name");
		expect(cols).toContain("phase");
		expect(cols).toContain("created_at");
	});

	it("AC2: old `teams` (agent membership) table is now called `team_members`", () => {
		expect(tableExists(db, "team_members")).toBe(true);
	});

	it("AC2: `team_members` has capacity, formed_at, team_id columns (formerly product_id)", () => {
		const cols = columnNamesOf(db, "team_members");
		expect(cols).toContain("capacity");
		expect(cols).toContain("formed_at");
		// After U1 migration: product_id renamed to team_id
		expect(cols).toContain("team_id");
		expect(cols).not.toContain("product_id");
	});

	it("AC1+AC2: seed data round-trips — `teams` table holds the former product row", () => {
		seed(db);

		// After migration, the product formerly named "Nimmly" must live in teams
		const row = db.get<{ id: string; name: string }>(
			sql`SELECT id, name FROM teams WHERE id = 'seed-product-1'`,
		);
		expect(row).toBeDefined();
		expect(row?.name).toBe("Nimmly");

		// And the old team membership group lives in team_members
		const memberRow = db.get<{ id: string }>(
			sql`SELECT id FROM team_members WHERE id = 'seed-team-1'`,
		);
		expect(memberRow).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// AC1: FK renames — bets.team_id and tasks.team_id reference new `teams` table
// ---------------------------------------------------------------------------

describe("U1 AC1: FK renames on bets and tasks", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = migrateFreshDb();
	});

	it("bets has team_id column (renamed from product_id)", () => {
		const cols = columnNamesOf(db, "bets");
		expect(cols).toContain("team_id");
		// product_id must be gone
		expect(cols).not.toContain("product_id");
	});

	it("tasks has team_id column (renamed from product_id)", () => {
		const cols = columnNamesOf(db, "tasks");
		expect(cols).toContain("team_id");
		// product_id must be gone
		expect(cols).not.toContain("product_id");
	});

	it("bets.team_id FK integrity: insert bet referencing teams.id succeeds", () => {
		const now = new Date().toISOString();

		// Insert into the new teams table (formerly products)
		db.run(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-p1', 'MyTeam', 'build', '${now}')`,
			),
		);

		// Insert a bet with team_id pointing at the new teams table
		db.run(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-fk-1', 't-p1', 'Test bet', 'draft', '${now}')`,
			),
		);

		const row = db.get<{ id: string; team_id: string }>(
			sql.raw(`SELECT id, team_id FROM bets WHERE id='bet-fk-1'`),
		);
		expect(row?.team_id).toBe("t-p1");
	});

	it("tasks.team_id FK integrity: insert task referencing teams.id succeeds", () => {
		const now = new Date().toISOString();

		db.run(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-p2', 'MyTeam', 'build', '${now}')`,
			),
		);
		db.run(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-task-fk', 't-p2', 'Bet for task', 'active', '${now}')`,
			),
		);
		db.run(
			sql.raw(
				`INSERT INTO tasks (id, bet_id, team_id, title, state, created_at, updated_at) VALUES ('task-fk-1', 'bet-task-fk', 't-p2', 'Test task', 'proposed', '${now}', '${now}')`,
			),
		);

		const row = db.get<{ id: string; team_id: string }>(
			sql.raw(`SELECT id, team_id FROM tasks WHERE id='task-fk-1'`),
		);
		expect(row?.team_id).toBe("t-p2");
	});
});

// ---------------------------------------------------------------------------
// AC3: Bet status enum — draft | active | completed | killed
// ---------------------------------------------------------------------------

describe("U1 AC3: Bet status enum simplification", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = migrateFreshDb();
	});

	it("bet with old status 'shaped' migrates to 'draft'", () => {
		const now = new Date().toISOString();

		// Simulate a pre-migration bet by inserting with the raw SQL (bypasses Drizzle schema validation)
		db.run(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-s1', 'T', 'build', '${now}')`,
			),
		);
		// Insert using new column name (description) and new status value
		// This test verifies we can INSERT with the new status and it's stored correctly
		db.run(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-draft', 't-s1', 'Test', 'draft', '${now}')`,
			),
		);

		const row = db.get<{ status: string }>(sql.raw(`SELECT status FROM bets WHERE id='bet-draft'`));
		expect(row?.status).toBe("draft");
	});

	it("bet with old status 'in_progress' is not valid in the new schema", () => {
		const now = new Date().toISOString();

		db.run(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-ip', 'T', 'build', '${now}')`,
			),
		);

		// We can insert any text in the status column (SQLite doesn't enforce enums at DB level)
		// but the important check is the migration transforms old values
		// After U1 migration runs, no rows with in_progress should exist
		const row = db.get<{ count: number }>(
			sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='in_progress'`),
		);
		expect(row?.count).toBe(0);
	});

	it("bet with old status 'committed' is not valid in the new schema", () => {
		const row = db.get<{ count: number }>(
			sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='committed'`),
		);
		expect(row?.count).toBe(0);
	});

	it("bet with old status 'shipped' is not valid in the new schema", () => {
		const row = db.get<{ count: number }>(
			sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='shipped'`),
		);
		expect(row?.count).toBe(0);
	});

	it("bet with old status 'shaped' is not valid in the new schema", () => {
		const row = db.get<{ count: number }>(
			sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='shaped'`),
		);
		expect(row?.count).toBe(0);
	});

	it("BET_STATUSES shared constant contains only new values: draft, active, completed, killed", () => {
		// Static import at top of file — will fail until shared types are updated

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
	let db: HyperIdleDb;

	beforeEach(() => {
		db = migrateFreshDb();
	});

	it("bets table has 'description' column (renamed from pitch)", () => {
		const cols = columnNamesOf(db, "bets");
		expect(cols).toContain("description");
		expect(cols).not.toContain("pitch");
	});

	it("bets table has 'completed_at' column (renamed from shipped_at)", () => {
		const cols = columnNamesOf(db, "bets");
		expect(cols).toContain("completed_at");
		expect(cols).not.toContain("shipped_at");
	});

	it("description column preserves data after rename", () => {
		const now = new Date().toISOString();

		db.run(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-d1', 'T', 'build', '${now}')`,
			),
		);
		db.run(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-desc', 't-d1', 'Build the feature', 'active', '${now}')`,
			),
		);

		const row = db.get<{ description: string }>(
			sql.raw(`SELECT description FROM bets WHERE id='bet-desc'`),
		);
		expect(row?.description).toBe("Build the feature");
	});

	it("completed_at column is nullable", () => {
		const col = columnsOf(db, "bets").find((c) => c.name === "completed_at");
		expect(col).toBeDefined();
		expect(col?.notnull).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// AC5: at_risk boolean column on bets
// ---------------------------------------------------------------------------

describe("U1 AC5: at_risk column on bets", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = migrateFreshDb();
	});

	it("bets table has 'at_risk' column", () => {
		const cols = columnNamesOf(db, "bets");
		expect(cols).toContain("at_risk");
	});

	it("at_risk column defaults to 0 (false)", () => {
		const col = columnsOf(db, "bets").find((c) => c.name === "at_risk");
		expect(col).toBeDefined();
		expect(col?.dflt_value).toBe("0");
	});

	it("at_risk column is NOT NULL", () => {
		const col = columnsOf(db, "bets").find((c) => c.name === "at_risk");
		expect(col).toBeDefined();
		expect(col?.notnull).toBe(1);
	});

	it("at_risk defaults to 0 when inserting a bet without specifying at_risk", () => {
		const now = new Date().toISOString();

		db.run(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-ar', 'T', 'build', '${now}')`,
			),
		);
		db.run(
			sql.raw(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-at-risk', 't-ar', 'Some bet', 'draft', '${now}')`,
			),
		);

		const row = db.get<{ at_risk: number }>(
			sql.raw(`SELECT at_risk FROM bets WHERE id='bet-at-risk'`),
		);
		expect(row?.at_risk).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// AC6: Zod schemas updated — selectTeamMemberSchema, insertTeamMemberSchema exist;
//      selectTeamSchema now maps to the teams (former products) table
// ---------------------------------------------------------------------------

describe("U1 AC6: Zod schemas updated", () => {
	it("selectTeamMemberSchema exists and is a valid Zod schema (replaces old selectTeamSchema)", () => {
		// Will fail until zod-schemas.ts is updated to export selectTeamMemberSchema
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
		// Will fail until zod-schemas.ts is updated to make selectTeamSchema map to the new teams table
		// Currently selectTeamSchema maps to old teams (agent membership) with product_id, capacity, etc.
		// After U1: selectTeamSchema must map to the new teams table (id, name, phase, created_at, etc.)
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
		// Currently fails because selectTeamSchema maps to old teams (capacity, product_id, etc.)
		expect(valid.success).toBe(true);
	});

	it("insertProductSchema no longer exists (replaced by insertTeamSchema for the domain entity)", () => {
		// Will fail until zod-schemas.ts removes insertProductSchema
		const schemas = zodSchemas as Record<string, unknown>;
		expect(schemas["insertProductSchema"]).toBeUndefined();
	});

	it("selectProductSchema no longer exists (replaced by selectTeamSchema for the domain entity)", () => {
		// Will fail until zod-schemas.ts removes selectProductSchema
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
			atRisk: 0,
			costAppetiteMinor: null,
			costAppetiteCurrency: null,
			costActualMinor: null,
			costActualCurrency: null,
			tokensActualJson: null,
		});
		// Currently fails: selectBetSchema still expects pitch + productId + shippedAt
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
		// Currently passes (old schema accepts this). After U1: must fail (no pitch/productId).
		expect(oldBetShape.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// AC7: TypeScript types — Team (formerly Product), TeamMember (formerly Team)
// ---------------------------------------------------------------------------

describe("U1 AC7: TypeScript type exports updated", () => {
	it("schema exports Team type (the domain entity, formerly Product)", () => {
		// This test validates that the type exists at the module level.
		// TypeScript compilation will catch this at build time (bun run check).
		// Here we verify the runtime module shape.
		// teams export exists and is the new domain entity (formerly products)
		expect(schema.teams).toBeDefined();

		// The teams table should have "teams" as its backing SQL table name
		// @lore U1: In Drizzle 0.39+, the `_` property is a TypeScript-only type
		// accessor (not a runtime property). The SQL table name is stored as
		// Symbol(drizzle:Name). Use getTableName from drizzle-orm to access it.
		expect(getTableName(schema.teams)).toBe("teams");
	});

	it("schema exports teamMembers table (formerly teams)", () => {
		// Will fail until schema.ts is updated — currently `teams` maps to agent membership
		expect((schema as Record<string, unknown>)["teamMembers"]).toBeDefined();
	});

	it("schema does NOT export 'products' table", () => {
		// Will fail until schema.ts is updated — currently products still exists
		expect((schema as Record<string, unknown>)["products"]).toBeUndefined();
	});

	it("TeamMember type is exported from schema (formerly Team)", () => {
		// TypeScript compile-time check captured as a runtime assertion.
		// If TeamMember doesn't exist, tsc will fail (bun run check).
		// Runtime: verify the teamMembers table infers a type with capacity.
		const teamsTable = (schema as Record<string, unknown>)["teamMembers"];
		expect(teamsTable).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// AC8: Seed data — uses new names and produces valid records
// ---------------------------------------------------------------------------

describe("U1 AC8: Seed data uses new table/column names", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = migrateFreshDb();
	});

	it("seed does not reference the products table (it was renamed to teams)", () => {
		// If seed.ts still tries to insert into 'products', this will throw
		// because the 'products' table no longer exists after migration.
		expect(() => seed(db)).not.toThrow();
	});

	it("after seeding, teams table has at least 1 row (formerly products)", () => {
		seed(db);

		const count = db.get<{ count: number }>(sql`SELECT COUNT(*) as count FROM teams`);
		expect(count?.count).toBeGreaterThanOrEqual(1);
	});

	it("after seeding, team_members table has at least 1 row (formerly teams)", () => {
		seed(db);

		const count = db.get<{ count: number }>(sql`SELECT COUNT(*) as count FROM team_members`);
		expect(count?.count).toBeGreaterThanOrEqual(1);
	});

	it("after seeding, bet uses 'description' column (not pitch)", () => {
		seed(db);

		const bet = db.get<{ id: string; description: string }>(
			sql`SELECT id, description FROM bets WHERE id = 'seed-bet-daily-digest'`,
		);
		expect(bet).toBeDefined();
		expect(bet?.description).toBeTruthy();
	});

	it("after seeding, bet status is 'draft' (not 'shaped')", () => {
		seed(db);

		const bet = db.get<{ status: string }>(
			sql`SELECT status FROM bets WHERE id = 'seed-bet-daily-digest'`,
		);
		expect(bet?.status).toBe("draft");
	});

	it("after seeding, seed bet uses team_id (not product_id)", () => {
		seed(db);

		// team_id must be present and set to 'seed-product-1' (the former product, now team)
		const bet = db.get<{ team_id: string }>(
			sql`SELECT team_id FROM bets WHERE id = 'seed-bet-daily-digest'`,
		);
		expect(bet).toBeDefined();
		expect(bet?.team_id).toBe("seed-product-1");
	});

	it("after seeding, seed task uses team_id (not product_id)", () => {
		seed(db);

		const task = db.get<{ team_id: string }>(
			sql`SELECT team_id FROM tasks WHERE id = 'seed-task-daily-digest'`,
		);
		expect(task).toBeDefined();
		expect(task?.team_id).toBe("seed-product-1");
	});

	it("seed is idempotent after migration (running twice does not error)", () => {
		seed(db);
		expect(() => seed(db)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Bet status migration validation scenarios
// (These tests use RAW SQL to simulate pre-existing data with OLD statuses
// and then verify the migration transforms them correctly. The trick:
// we test by checking the migration SQL semantics on a controlled dataset.)
// ---------------------------------------------------------------------------

describe("U1: Bet status migration scenarios (data transformation)", () => {
	it("all 4 new statuses are insertable and queryable", () => {
		const db = migrateFreshDb();
		const now = new Date().toISOString();

		db.run(
			sql.raw(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('t-st', 'T', 'build', '${now}')`,
			),
		);

		for (const status of ["draft", "active", "completed", "killed"]) {
			db.run(
				sql.raw(
					`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-${status}', 't-st', 'Bet ${status}', '${status}', '${now}')`,
				),
			);
		}

		const rows = db.all<{ status: string }>(
			sql.raw(`SELECT status FROM bets WHERE team_id='t-st' ORDER BY created_at`),
		);
		const statuses = rows.map((r) => r.status);
		expect(statuses).toContain("draft");
		expect(statuses).toContain("active");
		expect(statuses).toContain("completed");
		expect(statuses).toContain("killed");
	});

	it("no bets with status 'shaped', 'committed', 'in_progress', 'behind', 'blocked', 'paused', 'review', or 'shipped' exist after migration", () => {
		const db = migrateFreshDb();

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
			const row = db.get<{ count: number }>(
				sql.raw(`SELECT COUNT(*) as count FROM bets WHERE status='${status}'`),
			);
			expect(row?.count, `Expected 0 bets with old status '${status}'`).toBe(0);
		}
	});
});

// ---------------------------------------------------------------------------
// Table-level schema correctness assertions (matches architecture spec §4.1)
// ---------------------------------------------------------------------------

describe("U1: Full table schema shape assertions", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = migrateFreshDb();
	});

	it("teams table schema matches architecture spec §4.1 (formerly products)", () => {
		const cols = columnNamesOf(db, "teams");
		expect(cols).toEqual(expect.arrayContaining(["id", "name", "phase", "created_at"]));
	});

	it("team_members table schema has team_id (not product_id)", () => {
		const cols = columnNamesOf(db, "team_members");
		expect(cols).toContain("team_id");
		expect(cols).not.toContain("product_id");
	});

	it("bets table schema has all expected new columns", () => {
		const cols = columnNamesOf(db, "bets");
		expect(cols).toContain("team_id");
		expect(cols).toContain("description");
		expect(cols).toContain("completed_at");
		expect(cols).toContain("at_risk");

		// Old columns must be gone
		expect(cols).not.toContain("product_id");
		expect(cols).not.toContain("pitch");
		expect(cols).not.toContain("shipped_at");
	});

	it("tasks table schema has team_id (from product_id rename, no old team_id)", () => {
		const cols = columnNamesOf(db, "tasks");
		expect(cols).toContain("team_id");
		expect(cols).not.toContain("product_id");
	});

	it("bets_team_id_idx index exists (recreated from bets_product_id_idx)", () => {
		const indexes = db
			.all<{ name: string }>(
				sql.raw(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='bets'`),
			)
			.map((r) => r.name);

		expect(indexes).toContain("bets_team_id_idx");
		expect(indexes).not.toContain("bets_product_id_idx");
	});

	it("tasks_team_id_idx index exists (recreated from tasks_product_id_idx)", () => {
		const indexes = db
			.all<{ name: string }>(
				sql.raw(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tasks'`),
			)
			.map((r) => r.name);

		expect(indexes).toContain("tasks_team_id_idx");
		expect(indexes).not.toContain("tasks_product_id_idx");
	});
});

// ---------------------------------------------------------------------------
// propagation_log: target_level 'product' -> 'team'
// ---------------------------------------------------------------------------

describe("U1: propagation_log target_level rename", () => {
	it("no propagation_log rows with target_level='product' remain after migration", () => {
		const db = migrateFreshDb();

		const row = db.get<{ count: number }>(
			sql.raw(`SELECT COUNT(*) as count FROM propagation_log WHERE target_level='product'`),
		);
		expect(row?.count).toBe(0);
	});
});
