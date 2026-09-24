import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
// @lore test-infra: createTestDb is kept here specifically for the idempotency
// test that calls handle.runMigrations() — the pooled fixture does not expose
// runMigrations(). All other tests in this file use the fixture.
import { createTestDb } from "../__testing__/test-utils.js";
import { teams } from "../schema.js";

// @lore Phase 2: migration.test.ts now tests PGlite migrations. SQLite migration
// tests were removed because the schema is now PG-only. The journal timestamp
// check is preserved as it validates the migration file integrity independent
// of the DB engine.

describe("A2: Migration", () => {
	test("applies migrations to a fresh in-memory PGlite database", async ({ db }) => {
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
				// @lore P2: agents → users
				// @lore U1: `products` → `teams`; old `team_members` dissolved into `teams` (AU44 B1)
				// @lore: file_leases was dropped in earlier migrations
				"users",
				// @lore BB1: `bets` table dropped — tasks table now carries parentTaskId self-FK.
				// @lore AU18: `factory_settings` retired — `server_config` is its
				// typed singleton-row successor.
				"server_config",
				"documents",
				"messages",
				// @lore BC5 T7b migration 0089: `routines` renamed `subscriptions`.
				"subscriptions",
				"sessions",
				"tasks",
				"teams",
				"threads",
			]),
		);
		expect(tableNames).not.toContain("responses");
		// @lore U1: `products` table renamed to `teams`
		expect(tableNames).not.toContain("products");
		// @lore AU18: factory_settings dropped — must not reappear.
		expect(tableNames).not.toContain("factory_settings");
		// @lore AU30: `user_skills` dropped — the per-skill autonomy score sheet the
		// product removed. This exact-absence assertion is load-bearing: the expected
		// list above is `arrayContaining` (inclusion), so removing a name from it is a
		// no-op in both directions. A `0056_drop_user_skills.sql` with a missing or
		// mis-tagged `meta/_journal.json` entry is silently skipped by the migrator,
		// and check/lint/every other test stays green. This is the only assertion in
		// the repo that reads the real post-migration database and can say the drop
		// happened.
		expect(tableNames).not.toContain("user_skills");
		// @lore AU44 B1: `team_members` dissolved into `teams` in migration 0058.
		// Exact-absence proves the DROP TABLE in 0058 ran.
		expect(tableNames).not.toContain("team_members");
		// @lore BB1: `bets` table dropped — tasks carry parentTaskId self-FK now.
		// Exact-absence proves the DROP TABLE in the BB1 migration ran.
		expect(tableNames).not.toContain("bets");
		// @lore BC3 migration 0085 step 6: `items` dropped, destructive, no
		// compat column. Exact-absence proves the DROP TABLE ran.
		expect(tableNames).not.toContain("items");
		// @lore BC4 migration 0086: `knowledge_items` renamed to `documents`;
		// `knowledge_edit_log`, `knowledge_app_projection`, `knowledge_conflicts` and
		// `knowledge_access_log` dropped outright, folded onto `documents` or removed
		// with no replacement (§6.2). Exact-absence proves the DROP TABLEs ran.
		expect(tableNames).not.toContain("knowledge_items");
		expect(tableNames).not.toContain("knowledge_edit_log");
		expect(tableNames).not.toContain("knowledge_app_projection");
		expect(tableNames).not.toContain("knowledge_conflicts");
		expect(tableNames).not.toContain("knowledge_access_log");
		// @lore BC5 T7b migration 0089: `routines`/`routine_runs`/
		// `notification_queue` dropped outright, converted to `subscriptions`
		// (and `inbox`, added in 0088) with no replacement for the run-history
		// table. Exact-absence proves the DROP TABLEs ran.
		expect(tableNames).not.toContain("routines");
		expect(tableNames).not.toContain("routine_runs");
		expect(tableNames).not.toContain("notification_queue");
		expect(tableNames.length).toBeGreaterThanOrEqual(12);
	});

	test("migrated database supports CRUD with Drizzle ORM", async ({ db }) => {
		// @lore U1: `schema.products` renamed to `schema.teams` (domain entity).
		const now = new Date().toISOString();
		await db.insert(teams).values({
			id: "test-prod",
			name: "Test",
			createdAt: now,
			// @lore BB1: `activeBets` column dropped — WIP is counted live via
			// countTeamTasksInProgress. No insert needed.
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
		// @lore BC4 migration 0086: the O2 kernel/fabric split is gone — `knowledge_app_projection`
		// (the extension table these indexes used to live on) is dropped and folded onto
		// `documents` itself (§6.2), so there is one table and one index set to assert on.
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
		const journalPath = resolve(__dirname, "../../drizzle/meta/_journal.json");
		const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
			entries: Array<{ idx: number; when: number; tag: string }>;
		};

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

	// @lore test-infra: This test keeps createTestDb() because it needs
	// handle.runMigrations() to test idempotency. The pooled fixture does not
	// expose runMigrations() — the pool pre-applies migrations at warmup and
	// does not provide a way to re-run them per-test.
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
			// @lore BB1: bets table dropped — was 15, now 14.
			expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(14);
		} finally {
			await handle.close();
		}
	});
});
