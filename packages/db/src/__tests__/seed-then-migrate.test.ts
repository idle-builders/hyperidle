/**
 * I3 review C3 / arch C-1: Migration idempotency on a populated DB.
 *
 * This test exercises the seeded-then-migrate path: it applies migrations
 * to a fresh PGlite DB, seeds a representative cross-FK fixture (products →
 * teams → bets → tasks → sessions, with users), then re-applies migrations.
 * All rows must survive the re-migration.
 *
 * @lore Phase 2: rewritten from SQLite (better-sqlite3) to PGlite since
 * the schema is now PG-only (pgTable). The original test verified that
 * migration 0005 was safe on a populated SQLite DB; the PG equivalent
 * verifies that re-running Drizzle's pglite migrator is idempotent on
 * a populated DB.
 */
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "../schema.js";
import { createTestDb, type TestDbHandle } from "../test-utils.js";

describe("I3 review C3: migration idempotency on a populated PGlite DB", () => {
	let handle: TestDbHandle;

	afterEach(async () => {
		await handle?.close();
	});

	it("seeded fixture survives a second migration run (idempotent)", {
		timeout: 60_000,
	}, async () => {
		handle = await createTestDb();
		const { db, runMigrations } = handle;

		// Seed a cross-FK fixture using the post-migration schema.
		const NOW = "2026-04-18T00:00:00Z";
		await db
			.insert(schema.products)
			.values({ id: "p1", name: "P1", phase: "build", createdAt: NOW });
		await db
			.insert(schema.teams)
			.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
		// @lore P2: agents → users table. kind: "ai" required.
		await db.insert(schema.users).values({
			id: "a1",
			kind: "ai",
			name: "A1",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 1,
			teamId: "t1",
			createdAt: NOW,
		});
		await db.insert(schema.bets).values({
			id: "b1",
			productId: "p1",
			teamId: "t1",
			pitch: "x",
			appetite: "small",
			status: "shaped",
			createdAt: NOW,
		});
		await db.insert(schema.tasks).values({
			id: "task-1",
			betId: "b1",
			productId: "p1",
			teamId: "t1",
			title: "T1",
			state: "proposed",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(schema.sessions).values({
			id: "s1",
			taskId: "task-1",
			agentId: "a1",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});

		// Re-run migrations: idempotent + must not error on a populated DB.
		await runMigrations();

		// All rows must survive.
		expect(await db.select().from(schema.products)).toHaveLength(1);
		expect(await db.select().from(schema.teams)).toHaveLength(1);
		expect(await db.select().from(schema.users)).toHaveLength(1);
		expect(await db.select().from(schema.bets)).toHaveLength(1);
		expect(await db.select().from(schema.tasks)).toHaveLength(1);
		expect(await db.select().from(schema.sessions)).toHaveLength(1);
	});

	it("tasks_state_idx no longer exists (dropped in migration 0006)", {
		timeout: 60_000,
	}, async () => {
		handle = await createTestDb();
		const { db } = handle;

		const result = await db.execute(
			`SELECT indexname FROM pg_indexes WHERE tablename = 'tasks' AND schemaname = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		const indexes = (result as { rows: Array<{ indexname: string }> }).rows.map((r) => r.indexname);
		expect(indexes).not.toContain("tasks_state_idx");
		// But other tasks_*_idx must remain.
		expect(indexes).toContain("tasks_bet_id_idx");
		expect(indexes).toContain("tasks_team_id_idx");
		expect(indexes).toContain("tasks_product_id_idx");
	});
});
