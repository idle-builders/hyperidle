import { resolve } from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import * as schema from "../schema.js";

function migrateFreshDb(opts?: { foreignKeys?: boolean }): HyperIdleDb {
	const sqlite = new Database(":memory:");
	sqlite.pragma("journal_mode = WAL");
	if (opts?.foreignKeys) sqlite.pragma("foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: resolve(__dirname, "../../drizzle") });
	return db;
}

describe("A2: Migration", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = migrateFreshDb();
	});

	it("applies migrations to a fresh in-memory SQLite database", () => {
		// L1a: `responses` table dropped; verdicts now project as
		// `verdict`-typed messages (plan §5.2). Snapshot tables
		// `_l1_snapshot_*` are migration artifacts, excluded from the
		// canonical table list.
		const tableNames = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' AND name NOT LIKE 'd1%' AND name NOT LIKE '_l1_snapshot_%' ORDER BY name`,
			)
			.map((r) => r.name);

		expect(tableNames).toEqual(
			expect.arrayContaining([
				// @lore P2: agents → users, agent_skills → user_skills
				// @lore U1: `products` → `teams`; old `teams` → `team_members`
				// @lore: file_leases was dropped in earlier migrations
				"users",
				"user_skills",
				"bets",
				"factory_settings",
				"items",
				"knowledge_edit_log",
				"knowledge_items",
				"messages",
				"routines",
				"sessions",
				"tasks",
				"team_members",
				"teams",
				"threads",
			]),
		);
		expect(tableNames).not.toContain("responses");
		// @lore U1: `products` table renamed to `teams`
		expect(tableNames).not.toContain("products");
		expect(tableNames.length).toBeGreaterThanOrEqual(15);
	});

	it("migrated database supports CRUD with Drizzle ORM", () => {
		// @lore U1: `schema.products` renamed to `schema.teams` (domain entity).
		db = migrateFreshDb({ foreignKeys: true });
		const now = new Date().toISOString();
		db.insert(schema.teams)
			.values({ id: "test-prod", name: "Test", phase: "build", createdAt: now })
			.run();

		const result = db.select().from(schema.teams).all();
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ id: "test-prod", name: "Test" });
	});

	it("migrated database has kernel and fabric knowledge indexes", () => {
		// @lore O2: layer, scope_id, kind indexes removed from knowledge_items kernel table.
		// They now live on knowledge_strategy_fabric extension table.
		const kiIndexes = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_items' AND name NOT LIKE 'sqlite_%'`,
			)
			.map((r) => r.name);

		// Kernel table should have at least 3 indexes (topic, status, updated_at)
		expect(kiIndexes.length).toBeGreaterThanOrEqual(3);

		const kiIndexedColumns = new Set<string>();
		for (const idx of kiIndexes) {
			const cols = db.all<{ name: string }>(sql.raw(`PRAGMA index_info("${idx}")`));
			for (const col of cols) {
				kiIndexedColumns.add(col.name);
			}
		}

		expect(kiIndexedColumns).toContain("topic");
		expect(kiIndexedColumns).toContain("status");

		// Strategy fabric table should have layer and kind indexes
		const ksfIndexes = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_strategy_fabric' AND name NOT LIKE 'sqlite_%'`,
			)
			.map((r) => r.name);

		const ksfIndexedColumns = new Set<string>();
		for (const idx of ksfIndexes) {
			const cols = db.all<{ name: string }>(sql.raw(`PRAGMA index_info("${idx}")`));
			for (const col of cols) {
				ksfIndexedColumns.add(col.name);
			}
		}

		expect(ksfIndexedColumns).toContain("layer");
		expect(ksfIndexedColumns).toContain("kind");
	});

	it("migration is idempotent (running twice does not error)", () => {
		const migrationsFolder = resolve(__dirname, "../../drizzle");
		migrate(db, { migrationsFolder });

		const tableNames = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name`,
			)
			.map((r) => r.name);

		expect(tableNames.length).toBeGreaterThanOrEqual(16);
	});
});
