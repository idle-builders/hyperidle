import { resolve } from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "../schema.js";

/**
 * I3 review C3 / arch C-1: SQLite migration 0005 rebuilds 12 tables.
 * `PRAGMA foreign_keys=OFF` inside the file is a NO-OP because Drizzle
 * wraps the whole migration in a single BEGIN/COMMIT (see
 * drizzle-orm/sqlite-core/dialect.ts ~line 580). The fix uses
 * `PRAGMA defer_foreign_keys=ON` which CAN be set inside a transaction
 * and defers FK enforcement until COMMIT.
 *
 * This test exercises the seeded-then-migrate path the original test
 * suite missed: it applies all migrations to a fresh DB, seeds
 * a representative cross-FK fixture (teams → bets → tasks → sessions,
 * with users), then applies migrations again idempotently. All rows
 * must survive the rebuild.
 *
 * @lore U1: Updated to use new schema:
 * - `teams` (formerly `products`) for the domain entity
 * - `teamMembers` (formerly `teams`) for agent-membership group
 * - `bets.description` (formerly `bets.pitch`)
 * - `bets.teamId` references `teams.id` (no more `bets.productId`)
 * - `tasks.teamId` references `teams.id` (no more `tasks.productId`)
 * - `sessions.cost` was dropped in O2 migration
 */
describe("I3 review C3: migration 0005 is safe on a populated DB", () => {
	it("seeded fixture survives the FK-action-change rebuild", () => {
		const sqlite = new Database(":memory:");
		sqlite.pragma("journal_mode = WAL");
		// Run with FKs ON throughout to mirror production (connection.ts).
		sqlite.pragma("foreign_keys = ON");
		const db = drizzle(sqlite, { schema });

		// Apply ALL current migrations. With the C3 fix in place the
		// rebuild must succeed even though FKs are enforced and there are
		// child rows pointing into rebuilt tables.
		migrate(db, { migrationsFolder: resolve(__dirname, "../../drizzle") });

		// Seed a cross-FK fixture using the post-migration schema.
		// @lore U1: `teams` is the domain entity (formerly `products`).
		const NOW = "2026-04-18T00:00:00Z";
		db.insert(schema.teams).values({ id: "p1", name: "P1", phase: "build", createdAt: NOW }).run();
		db.insert(schema.teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW })
			.run();
		// @lore P2: agents → users table. kind: "ai" required.
		db.insert(schema.users)
			.values({
				id: "a1",
				kind: "ai",
				name: "A1",
				role: "builder",
				status: "active",
				maxConcurrentSessions: 1,
				createdAt: NOW,
			})
			.run();
		db.insert(schema.bets)
			.values({
				id: "b1",
				teamId: "p1",
				description: "x",
				appetite: "small",
				status: "draft",
				createdAt: NOW,
			})
			.run();
		db.insert(schema.tasks)
			.values({
				id: "task-1",
				betId: "b1",
				teamId: "p1",
				title: "T1",
				state: "proposed",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();
		db.insert(schema.sessions)
			.values({
				id: "s1",
				taskId: "task-1",
				agentId: "a1",
				modelTier: "workhorse",
				startedAt: NOW,
				state: "active",
			})
			.run();

		// Re-run migrations: idempotent + must not error on a populated DB.
		// (After the C3 fix, defer_foreign_keys=ON makes the rebuild safe.)
		migrate(db, { migrationsFolder: resolve(__dirname, "../../drizzle") });

		// All rows must survive.
		// @lore U1: `schema.teams` is the domain entity (formerly `products`).
		expect(db.select().from(schema.teams).all()).toHaveLength(1);
		expect(db.select().from(schema.teamMembers).all()).toHaveLength(1);
		expect(db.select().from(schema.users).all()).toHaveLength(1);
		expect(db.select().from(schema.bets).all()).toHaveLength(1);
		expect(db.select().from(schema.tasks).all()).toHaveLength(1);
		expect(db.select().from(schema.sessions).all()).toHaveLength(1);

		// And FK enforcement must still be on after the migration.
		const fkOn = sqlite.pragma("foreign_keys", { simple: true });
		expect(fkOn).toBe(1);

		sqlite.close();
	});

	it("0006 dropped tasks_state_idx; the index no longer exists", () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema });
		migrate(db, { migrationsFolder: resolve(__dirname, "../../drizzle") });

		const indexes = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tasks'`,
			)
			.map((r) => r.name);
		expect(indexes).not.toContain("tasks_state_idx");
		// But other tasks_*_idx must remain.
		// @lore U1: `tasks_product_id_idx` was dropped in U1 migration (column renamed to team_id).
		// The new index is `tasks_team_id_idx`.
		expect(indexes).toContain("tasks_bet_id_idx");
		expect(indexes).toContain("tasks_team_id_idx");

		sqlite.close();
	});
});
