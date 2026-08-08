import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
// @lore test-infra: createTestDb is kept here specifically for the idempotency
// test that calls handle.runMigrations() — the pooled fixture does not expose
// runMigrations(). All other tests in this file use the fixture.
import { createTestDb } from "../__testing__/test-utils.js";
import { teamMembers, teams } from "../schema.js";

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
				// @lore P2: agents → users, agent_skills → user_skills
				// @lore U1: `products` → `teams`; old `teams` → `team_members`
				// @lore: file_leases was dropped in earlier migrations
				"users",
				"user_skills",
				"bets",
				// @lore AU18: `factory_settings` retired — `server_config` is its
				// typed singleton-row successor.
				"server_config",
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
		// @lore AU18: factory_settings dropped — must not reappear.
		expect(tableNames).not.toContain("factory_settings");
		expect(tableNames.length).toBeGreaterThanOrEqual(15);
	});

	test("migrated database supports CRUD with Drizzle ORM", async ({ db }) => {
		// @lore U1: `schema.products` renamed to `schema.teams` (domain entity).
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: "test-prod", name: "Test", phase: "build", createdAt: now });
		// The owner writes the membership row alongside the team; exercises a second migrated
		// table for free.
		await db.insert(teamMembers).values({
			id: "test-prod-members",
			teamId: "test-prod",
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		});

		const result = await db.select().from(teams);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ id: "test-prod", name: "Test" });
	});

	test("migrated database has kernel and fabric knowledge indexes", async ({ db }) => {
		// @lore O2: layer, scope_id, kind indexes removed from knowledge_items kernel table.
		// They now live on knowledge_app_projection extension table.
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
			`SELECT indexname FROM pg_indexes WHERE tablename = 'knowledge_app_projection' AND schemaname = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		const ksfIndexes = (ksfResult as { rows: Array<{ indexname: string }> }).rows.map(
			(r) => r.indexname,
		);

		expect(ksfIndexes.length).toBeGreaterThanOrEqual(1);
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
			expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(15);
		} finally {
			await handle.close();
		}
	});
});
