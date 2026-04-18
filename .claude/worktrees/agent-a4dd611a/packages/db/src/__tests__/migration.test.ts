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
		const tableNames = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' AND name NOT LIKE 'd1%' ORDER BY name`,
			)
			.map((r) => r.name);

		expect(tableNames).toEqual(
			expect.arrayContaining([
				"agents",
				"agent_skills",
				"bets",
				"factory_settings",
				"file_leases",
				"items",
				"knowledge_edit_log",
				"knowledge_items",
				"messages",
				"products",
				"responses",
				"routines",
				"sessions",
				"tasks",
				"teams",
				"threads",
			]),
		);
		expect(tableNames.length).toBeGreaterThanOrEqual(16);
	});

	it("migrated database supports CRUD with Drizzle ORM", () => {
		db = migrateFreshDb({ foreignKeys: true });
		const now = new Date().toISOString();
		db.insert(schema.products)
			.values({ id: "test-prod", name: "Test", phase: "build", createdAt: now })
			.run();

		const result = db.select().from(schema.products).all();
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ id: "test-prod", name: "Test" });
	});

	it("migrated database has all five knowledge_items indexes", () => {
		const indexes = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_items' AND name NOT LIKE 'sqlite_%'`,
			)
			.map((r) => r.name);

		expect(indexes.length).toBeGreaterThanOrEqual(5);

		const indexedColumns = new Set<string>();
		for (const idx of indexes) {
			const cols = db.all<{ name: string }>(sql.raw(`PRAGMA index_info("${idx}")`));
			for (const col of cols) {
				indexedColumns.add(col.name);
			}
		}

		expect(indexedColumns).toContain("layer");
		expect(indexedColumns).toContain("scope_id");
		expect(indexedColumns).toContain("kind");
		expect(indexedColumns).toContain("topic");
		expect(indexedColumns).toContain("status");
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
