import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import journal from "../../drizzle/meta/_journal.json";
import { createTestDb } from "../__testing__/test-utils.js";
import { teams } from "../schema.js";

describe("migrations bring a fresh database to the current schema", () => {
	test("applies migrations to a fresh in-memory PGlite database", async ({ db }) => {
		// `_l1_snapshot_*` tables are migration artifacts, excluded from the canonical table list.
		const result = await db.execute(
			`SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_l1_snapshot_%' ORDER BY tablename` as Parameters<
				typeof db.execute
			>[0],
		);
		const tableNames = (result as { rows: Array<{ name: string }> }).rows.map((r) => r.name);

		expect(tableNames).toEqual(
			expect.arrayContaining([
				"users",
				"documents",
				"messages",
				"subscriptions",
				"sessions",
				"tasks",
				"teams",
				"threads",
			]),
		);
		expect(tableNames.length).toBeGreaterThanOrEqual(12);
	});

	test("migrated database supports CRUD with Drizzle ORM", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({
			id: "test-prod",
			name: "Test",
			createdAt: now,
		});

		const result = await db.select().from(teams);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			id: "test-prod",
			name: "Test",
			createdAt: now,
		});
	});

	test("migrated database has document indexes", async ({ db }) => {
		const docResult = await db.execute(
			`SELECT indexname FROM pg_indexes WHERE tablename = 'documents' AND schemaname = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		const docIndexes = (docResult as { rows: Array<{ indexname: string }> }).rows.map(
			(r) => r.indexname,
		);

		// PK + scope + status + updated_at + slot + parent + parent_position + last_used
		expect(docIndexes.length).toBeGreaterThanOrEqual(3);
	});

	test("journal timestamps are strictly monotonically increasing", () => {
		expect(journal.entries.length).toBeGreaterThan(0);

		for (let i = 1; i < journal.entries.length; i++) {
			const prev = journal.entries[i - 1];
			const curr = journal.entries[i];
			if (!(prev && curr)) continue;
			expect(
				curr.when > prev.when,
				`Migration ${curr.tag} (idx ${curr.idx}, when=${curr.when}) has a timestamp ≤ ${prev.tag} (idx ${prev.idx}, when=${prev.when}). ` +
					"Drizzle skips migrations whose timestamp is ≤ the last applied migration. " +
					"This WILL break upgrades for existing users.",
			).toBe(true);
		}
	});

	test("migration is idempotent (running twice does not error)", { timeout: 60_000 }, async () => {
		const handle = await createTestDb();
		try {
			await handle.runMigrations();

			const result = await handle.db.execute(
				`SELECT COUNT(*) AS n FROM pg_tables WHERE schemaname = 'public'` as Parameters<
					typeof handle.db.execute
				>[0],
			);
			const rows = (result as { rows: Array<{ n: string | number }> }).rows;
			expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(14);
		} finally {
			await handle.close();
		}
	});
});
