import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import { seedDemoWorld } from "../demo-fixture.js";
import { runFactoryBootstrap } from "../factory-bootstrap-runner.js";

// Convenience: execute a raw query returning rows
async function queryRows<T extends Record<string, unknown>>(
	db: HyperIdleDb,
	query: string,
): Promise<T[]> {
	const result = await db.execute(sql.raw(query));
	return (result as { rows: T[] }).rows;
}

describe("A2: Seed script", () => {
	// --- AC4: Seed populates ≥1 row per major table ---
	test("populates at least 1 row per major table", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// @lore U1: `products` renamed to `teams`; old `teams` renamed to `team_members`.
		// @lore P2: agents → users table
		// @lore AF17: seed() now calls runFactoryBootstrap + seedDemoWorld.
		// factory_bootstrap inserts users/documents; demo_fixture inserts teams/team_members.
		// @lore AU18: `factory_settings` dropped from this list — factory-bootstrap no
		// longer writes to it (cost_cap/cost_cycle/system_template rows retired).
		// @lore BC4: `knowledge_app_projection` dropped from this list — the table is
		// dropped; `documents` is the row itself now (architecture.md §6.2, §6.4).
		const majorTables = [
			"users",
			"teams",
			// @lore AU44 B1: team_members folded into teams — no longer a separate table
			"documents",
		];

		for (const table of majorTables) {
			const rows = await queryRows<{ count: string }>(db, `SELECT COUNT(*) AS count FROM ${table}`);
			expect(Number(rows[0]?.count), `${table} should have ≥1 row`).toBeGreaterThanOrEqual(1);
		}
	});

	test("seed data is well-formed (queryable without errors)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// Verify we can read back with all fields.
		// @lore U1: `products` table renamed to `teams`.
		// @lore AF17: demo team id is now "demo-team-acme"
		const products = await queryRows<{ id: string; name: string }>(
			db,
			"SELECT id, name FROM teams LIMIT 1",
		);
		expect(products[0]?.id).toBeTruthy();
		expect(products[0]?.name).toBeTruthy();

		// @lore P2: agents → users table
		const agents = await queryRows<{ id: string; name: string; role: string }>(
			db,
			"SELECT id, name, role FROM users LIMIT 1",
		);
		expect(agents[0]?.id).toBeTruthy();
		expect(agents[0]?.name).toBeTruthy();
		expect(agents[0]?.role).toBeTruthy();

		// @lore AU44 B1: team_members folded into teams.
		// @lore BC5 T11 (migration 0090, D-e3zm2j): capacity is dropped — a team
		// is an id and a name now, no capacity gate left to read back.

		// @lore BC4: `knowledge_app_projection` is dropped (architecture.md §6.2,
		// §6.4) — the row it used to project (`confidence`) is a plain column on
		// `documents` now, so there is no separate projection row left to assert.
		const kiRows = await queryRows<{ id: string; version: number }>(
			db,
			"SELECT id, version FROM documents LIMIT 1",
		);
		expect(kiRows[0]?.id).toBeTruthy();
		expect(kiRows[0]?.version).toBeGreaterThanOrEqual(1);
	});

	test("is idempotent (running twice does not error)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);
		// Second run should not throw (uses onConflictDoNothing)
		await expect(runFactoryBootstrap(db).then(() => seedDemoWorld(db))).resolves.not.toThrow();
	});
});

describe("AF17: seed() = runFactoryBootstrap + seedDemoWorld", () => {
	test("seed() produces factory layer (bootstrap) + demo world (Acme team)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// Factory layer: system:propagation exists
		const propagation = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id = 'system:propagation'",
		);
		expect(propagation).toHaveLength(1);

		// Demo world: Acme team exists
		const acme = await queryRows<{ id: string; name: string }>(
			db,
			"SELECT id, name FROM teams WHERE id = 'demo-team-acme'",
		);
		expect(acme).toHaveLength(1);
		expect(acme[0]?.name).toBe("Acme");
	});

	test("runFactoryBootstrap alone produces 0 teams (factory isolation)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const teamRows = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM teams");
		expect(Number(teamRows[0]?.count)).toBe(0);

		const humanRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE kind = 'human'",
		);
		expect(Number(humanRows[0]?.count)).toBe(0);
	});

	test("seedDemoWorld alone produces Acme team + demo founder + demo agents", async ({ db }) => {
		await runFactoryBootstrap(db);
		const { teamId, founderId } = await seedDemoWorld(db);

		expect(teamId).toBe("demo-team-acme");
		expect(founderId).toBe("demo-founder");

		const acme = await queryRows<{ id: string; name: string }>(
			db,
			`SELECT id, name FROM teams WHERE id = '${teamId}'`,
		);
		expect(acme).toHaveLength(1);
		expect(acme[0]?.name).toBe("Acme");

		const founder = await queryRows<{ id: string; kind: string }>(
			db,
			`SELECT id, kind FROM users WHERE id = '${founderId}'`,
		);
		expect(founder).toHaveLength(1);
		expect(founder[0]?.kind).toBe("human");
	});
});
