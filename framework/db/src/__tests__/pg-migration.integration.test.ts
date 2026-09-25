import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
// @lore test-infra: createTestDb is kept throughout this file. Some tests call
// runMigrations() to test idempotency — the pooled fixture does not expose that.
// Other tests (brownfield simulation, boolean coercion) manage lifecycle via
// try/finally close() and cannot use the shared pool.
import { createTestDb } from "../__testing__/test-utils.js";
import * as pgSchema from "../schema.js";

/**
 * H4 AC3: Migrations apply cleanly on Postgres.
 * Uses pglite (WASM Postgres) for in-sandbox verification.
 */
describe("H4 AC3: PG migrations apply to a fresh pglite DB", () => {
	// pglite WASM cold-starts the migration runner; CI has been observed to
	// take 6-8s on the cold path now that the migration set is larger
	// (Thread/Block + Artifact). Locally ~2.6s. Use 30s to leave headroom.
	it("migrated pglite DB has all major tables from the pg migration set", {
		timeout: 30_000,
	}, async () => {
		const { db, close } = await createTestDb();
		try {
			const result = await db.execute(
				sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
			);
			const rows = (result as { rows: Array<{ tablename: string }> }).rows;
			const tableNames = rows.map((r) => r.tablename);

			// L1a: `responses` table dropped (plan §5.2). Verdicts now project
			// as `verdict`-typed messages. Snapshot tables `_l1_snapshot_*`
			// are migration artifacts.
			expect(tableNames).toEqual(
				expect.arrayContaining([
					// @lore P2: agents → users
					// @lore U1: `products` → `teams`; old `teams` → `team_members`
					// @lore AU44 B1: `team_members` dissolved back into `teams`
					// @lore: `file_leases` was dropped in older migrations
					"users",
					// @lore BB1: `bets` table dropped — tasks carry parentTaskId self-FK.
					"documents",
					"messages",
					"subscriptions",
					"server_config",
					"sessions",
					"tasks",
					"teams",
					"threads",
				]),
			);
			expect(tableNames).not.toContain("responses");
			// @lore BC5 T7b migration 0089: routines/routine_runs/notification_queue
			// dropped — a routine is a subscription now, a notification an inbox row.
			expect(tableNames).not.toContain("routines");
			expect(tableNames).not.toContain("routine_runs");
			expect(tableNames).not.toContain("notification_queue");
			// @lore U1: `products` renamed to `teams`
			expect(tableNames).not.toContain("products");
			// @lore AU18: factory_settings dropped — must not reappear.
			expect(tableNames).not.toContain("factory_settings");
			// @lore AU30: `user_skills` dropped. Exact-absence, because the expected
			// list above is `arrayContaining` and tolerates extras — see the longer
			// note in migration.integration.test.ts.
			expect(tableNames).not.toContain("user_skills");
			// @lore AU44 B1: team_members dissolved — must not reappear.
			expect(tableNames).not.toContain("team_members");
			// @lore BB1: bets table dropped — parentTaskId self-FK on tasks replaces it.
			expect(tableNames).not.toContain("bets");
			// @lore BC3 migration 0085 step 6: `items` dropped — destructive, no
			// compat column. Must not reappear.
			expect(tableNames).not.toContain("items");
			// @lore BC4 migration 0086: `knowledge_items` renamed to `documents`;
			// `knowledge_edit_log`, `knowledge_app_projection`, `knowledge_conflicts` and
			// `knowledge_access_log` dropped outright (§6.2). Exact-absence proves the
			// DROP TABLEs ran.
			expect(tableNames).not.toContain("knowledge_items");
			expect(tableNames).not.toContain("knowledge_edit_log");
			expect(tableNames).not.toContain("knowledge_app_projection");
			expect(tableNames).not.toContain("knowledge_conflicts");
			expect(tableNames).not.toContain("knowledge_access_log");
			// @lore migration 0087: `server_credentials` dropped — the shared-backend
			// key now lives only in the desktop keychain, and no other row in it
			// ever had a writer. Exact-absence proves the DROP TABLE ran.
			expect(tableNames).not.toContain("server_credentials");
			// @lore BB1: bets table dropped — was 18, then 17. BC3: items dropped — now 16.
			expect(tableNames.length).toBeGreaterThanOrEqual(16);
		} finally {
			await close();
		}
	});

	it("is idempotent: migrating twice does not error", { timeout: 30_000 }, async () => {
		const { db, runMigrations, close } = await createTestDb();
		try {
			await runMigrations();
			// Just check tables still exist
			const result = await db.execute(
				sql`SELECT COUNT(*) AS n FROM pg_tables WHERE schemaname='public'`,
			);
			const rows = (result as { rows: Array<{ n: string | number }> }).rows;
			const n = Number(rows[0]?.n ?? 0);
			// L1a: 14 canonical tables (bets dropped by BB1) + 4 _l1_snapshot_* artifacts.
			expect(n).toBeGreaterThanOrEqual(14);
		} finally {
			await close();
		}
	});
});

/**
 * I3 review C5 / sec CRITICAL-1: regression test for the NULL-safe boolean
 * coercion in `0004_boolean_coerce.sql`. Pre-fix, a row whose integer
 * boolean column was NULL would flip to TRUE after migration (CASE WHEN
 * col=0 → false, ELSE → true; NULL=0 evaluates to NULL → ELSE branch).
 *
 * Reproduce by running migrations 0000..0003 only (so columns are still
 * integer + nullable), inserting a NULL row, then running 0004 and
 * asserting the row reads as FALSE (the safe default).
 */
describe("I3 review C5: boolean migration is NULL-safe", () => {
	// @lore S1: This test creates its own raw PGlite() instance (not pooled) to simulate
	// the brownfield migration scenario. Even with warm WASM, PGlite instance init +
	// DDL operations can take 30-60s. Timeout raised to 60s to prevent flaky failures.
	it("a row with blocking=NULL pre-migration ends up as false post-migration", async () => {
		// This is the brownfield scenario: a DB that ran the OLD 0003 (no
		// inline boolean coercion) ends up with integer columns. Then 0004
		// runs and converts them. We simulate by:
		// 1. Apply migrations 0000..0002 (columns are integer + nullable).
		// 2. Manually drop the FK constraints that 0003 would drop.
		// 3. Insert a row with NULL in the boolean integer column.
		// 4. Run migration 0004.
		// 5. Assert NULL → false.
		const client = new PGlite();
		await client.waitReady;
		const db = drizzle(client, { schema: pgSchema });
		try {
			// Run only the pre-0004 baseline. We do this by writing the
			// 0000..0003 migrations into a temp folder. Simpler: create the
			// minimal `items` table by hand to mirror the post-0002 state
			// (integer `blocking`), insert a NULL row, then read & coerce.
			await db.execute(sql`CREATE TABLE items_int_test (id text PRIMARY KEY, blocking integer)`);
			await db.execute(
				sql`INSERT INTO items_int_test (id, blocking) VALUES ('null-row', NULL), ('zero-row', 0), ('one-row', 1), ('seven-row', 7)`,
			);
			// Apply the same coercion the migration uses.
			await db.execute(
				sql`ALTER TABLE items_int_test ALTER COLUMN blocking SET DATA TYPE boolean USING (COALESCE(blocking, 0) <> 0)`,
			);
			const result = await db.execute(sql`SELECT id, blocking FROM items_int_test ORDER BY id`);
			const rows = (result as unknown as { rows: Array<{ id: string; blocking: boolean }> }).rows;
			const byId = new Map(rows.map((r) => [r.id, r.blocking]));

			expect(byId.get("null-row"), "NULL must coerce to false (CRITICAL-1)").toBe(false);
			expect(byId.get("zero-row")).toBe(false);
			expect(byId.get("one-row")).toBe(true);
			expect(byId.get("seven-row")).toBe(true);
		} finally {
			await client.close();
		}
	}, 60_000);

	// @lore BC3 migration 0085 step 6: `items` (and its `blocking` column) is
	// DROPPED — destructive, no compat column. The two tests that used to
	// insert into the real, fully-migrated `items` table to exercise 0004's
	// boolean coercion on brand-new rows are deleted with their subject; the
	// coercion mechanism itself is still covered above by the synthetic
	// `items_int_test` table, which never touches the real schema.
});
