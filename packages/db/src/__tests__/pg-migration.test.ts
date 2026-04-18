import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createPgTestDb } from "../pg-test-utils.js";

/**
 * H4 AC3: Migrations apply cleanly on Postgres.
 * Uses pglite (WASM Postgres) for in-sandbox verification.
 */
describe("H4 AC3: PG migrations apply to a fresh pglite DB", () => {
	it("migrated pglite DB has all major tables from the pg migration set", async () => {
		const { db, close } = await createPgTestDb({ migrate: true });
		try {
			const result = await db.execute(
				sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
			);
			const rows = (result as { rows: Array<{ tablename: string }> }).rows;
			const tableNames = rows.map((r) => r.tablename);

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
		} finally {
			await close();
		}
	});

	it("is idempotent: migrating twice does not error", async () => {
		const { db, runPgMigrations, close } = await createPgTestDb({ migrate: true });
		try {
			await runPgMigrations(db);
			// Just check tables still exist
			const result = await db.execute(
				sql`SELECT COUNT(*) AS n FROM pg_tables WHERE schemaname='public'`,
			);
			const rows = (result as { rows: Array<{ n: string | number }> }).rows;
			const n = Number(rows[0]?.n ?? 0);
			expect(n).toBeGreaterThanOrEqual(16);
		} finally {
			await close();
		}
	});
});
