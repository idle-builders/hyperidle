import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import { products } from "../schema.js";
import { createTestDb, type TestDbHandle } from "../test-utils.js";

// @lore Phase 2: migration.test.ts now tests PGlite migrations. SQLite migration
// tests were removed because the schema is now PG-only. The journal timestamp
// check is preserved as it validates the migration file integrity independent
// of the DB engine.

describe("A2: Migration", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	}, 30_000);

	afterEach(async () => {
		await handle.close();
	});

	it("applies migrations to a fresh in-memory PGlite database", async () => {
		// L1a: `responses` table dropped; verdicts now project as
		// `verdict`-typed messages (plan §5.2). Snapshot tables
		// `_l1_snapshot_*` are migration artifacts, excluded from the
		// canonical table list.
		const result = await db.execute(
			`SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_l1_snapshot_%' ORDER BY tablename` as Parameters<
				typeof db.execute
			>[0],
		);
		const tableNames = (result as { rows: Array<{ name: string }> }).rows.map((r) => r.name);

		expect(tableNames).toEqual(
			expect.arrayContaining([
				// @lore P2: agents → users, agent_skills → user_skills
				"users",
				"user_skills",
				"bets",
				"factory_settings",
				"items",
				"knowledge_edit_log",
				"knowledge_items",
				"messages",
				"products",
				"routines",
				"sessions",
				"tasks",
				"teams",
				"threads",
			]),
		);
		expect(tableNames).not.toContain("responses");
		expect(tableNames.length).toBeGreaterThanOrEqual(15);
	});

	it("migrated database supports CRUD with Drizzle ORM", async () => {
		const now = new Date().toISOString();
		await db
			.insert(products)
			.values({ id: "test-prod", name: "Test", phase: "build", createdAt: now });

		const result = await db.select().from(products);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ id: "test-prod", name: "Test" });
	});

	it("migrated database has kernel and fabric knowledge indexes", async () => {
		// @lore O2: layer, scope_id, kind indexes removed from knowledge_items kernel table.
		// They now live on knowledge_strategy_fabric extension table.
		const kiResult = await db.execute(
			`SELECT indexname FROM pg_indexes WHERE tablename = 'knowledge_items' AND schemaname = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		const kiIndexes = (kiResult as { rows: Array<{ indexname: string }> }).rows.map(
			(r) => r.indexname,
		);

		// Kernel table should have at least 3 indexes (PK + topic + status/updated_at)
		expect(kiIndexes.length).toBeGreaterThanOrEqual(3);

		// Strategy fabric table should have indexes too
		const ksfResult = await db.execute(
			`SELECT indexname FROM pg_indexes WHERE tablename = 'knowledge_strategy_fabric' AND schemaname = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		const ksfIndexes = (ksfResult as { rows: Array<{ indexname: string }> }).rows.map(
			(r) => r.indexname,
		);

		expect(ksfIndexes.length).toBeGreaterThanOrEqual(1);
	});

	it("journal timestamps are strictly monotonically increasing", () => {
		const journalPath = resolve(__dirname, "../../drizzle/meta/_journal.json");
		const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
			entries: Array<{ idx: number; when: number; tag: string }>;
		};

		expect(journal.entries.length).toBeGreaterThan(0);

		for (let i = 1; i < journal.entries.length; i++) {
			const prev = journal.entries[i - 1];
			const curr = journal.entries[i];
			if (!prev || !curr) continue;
			expect(
				curr.when > prev.when,
				`Migration ${curr.tag} (idx ${curr.idx}, when=${curr.when}) has a timestamp ≤ ${prev.tag} (idx ${prev.idx}, when=${prev.when}). ` +
					"Drizzle skips migrations whose timestamp is ≤ the last applied migration. " +
					"This WILL break upgrades for existing users.",
			).toBe(true);
		}
	});

	it("migration is idempotent (running twice does not error)", async () => {
		await handle.runMigrations();

		const result = await db.execute(
			`SELECT COUNT(*) AS n FROM pg_tables WHERE schemaname = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		const rows = (result as { rows: Array<{ n: string | number }> }).rows;
		expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(15);
	});
});
