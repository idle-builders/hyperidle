/**
 * I3 review C3 / arch C-1: Migration idempotency on a populated DB.
 *
 * This test exercises the seeded-then-migrate path the original test
 * suite missed: it applies all migrations to a fresh DB, seeds
 * a representative cross-FK fixture (teams → tasks → sessions,
 * with users), then applies migrations again idempotently. All rows
 * must survive the rebuild.
 *
 * @lore U1: Updated to use new schema:
 * - `teams` (formerly `products`) for the domain entity
 * - `tasks.teamId` references `teams.id` (no more `tasks.productId`)
 * - `sessions.cost` was dropped in O2 migration
 * @lore BB1: `bets` table dropped. Cross-FK fixture now uses root tasks
 * (parentTaskId: null) instead of bets rows.
 *
 * @lore test-infra: createTestDb is kept in this file because the tests call
 * handle.runMigrations() to test idempotency. The pooled fixture does not
 * expose runMigrations() — it pre-applies migrations at warmup and provides
 * no per-test re-run mechanism.
 */
import { describe, expect, it } from "vitest";
import { createTestDb } from "../__testing__/test-utils.js";
import * as schema from "../schema.js";

describe("I3 review C3: migration idempotency on a populated PGlite DB", () => {
	it("seeded fixture survives a second migration run (idempotent)", {
		timeout: 60_000,
	}, async () => {
		const handle = await createTestDb();
		try {
			const { db, runMigrations } = handle;

			// Seed a cross-FK fixture using the post-migration schema.
			// @lore U1: `teams` is the domain entity (formerly `products`).
			// @lore BB1: root task (parentTaskId: null) replaces the former bet row.
			const NOW = "2026-04-18T00:00:00Z";
			await db
				.insert(schema.teams)
				.values({ id: "p1", name: "P1", phase: "build", createdAt: NOW });
			// @lore P2: agents → users table. kind: "ai" required.
			await db.insert(schema.users).values({
				id: "a1",
				kind: "ai",
				name: "A1",
				role: "builder",
				status: "active",
				createdAt: NOW,
			});
			await db.insert(schema.tasks).values({
				id: "root-1",
				parentTaskId: null,
				teamId: "p1",
				title: "Root task",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			});
			await db.insert(schema.tasks).values({
				id: "task-1",
				parentTaskId: "root-1",
				teamId: "p1",
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
			// @lore U1: `schema.teams` is the domain entity (formerly `products`).
			const teamRows = await db.select().from(schema.teams);
			expect(teamRows).toHaveLength(1);
			const userRows = await db.select().from(schema.users);
			expect(userRows).toHaveLength(1);
			const taskRows = await db.select().from(schema.tasks);
			expect(taskRows).toHaveLength(2);
			const sessionRows = await db.select().from(schema.sessions);
			expect(sessionRows).toHaveLength(1);
		} finally {
			await handle.close();
		}
	});

	it("tasks_state_idx no longer exists (dropped in migration 0006)", {
		timeout: 60_000,
	}, async () => {
		const handle = await createTestDb();
		try {
			const { db } = handle;

			const result = await db.execute(
				`SELECT indexname FROM pg_indexes WHERE tablename = 'tasks' AND schemaname = 'public'` as Parameters<
					typeof db.execute
				>[0],
			);
			const indexes = (result as { rows: Array<{ indexname: string }> }).rows.map(
				(r) => r.indexname,
			);
			expect(indexes).not.toContain("tasks_state_idx");
			// @lore BB1: tasks_bet_id_idx is gone (column dropped). The new index
			// is tasks_parent_task_id_idx for subtree traversal.
			expect(indexes).not.toContain("tasks_bet_id_idx");
			expect(indexes).toContain("tasks_parent_task_id_idx");
			expect(indexes).toContain("tasks_team_id_idx");
		} finally {
			await handle.close();
		}
	});
});
