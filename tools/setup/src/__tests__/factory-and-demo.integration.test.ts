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

describe("seed script", () => {
	test("populates at least 1 row per major table", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const majorTables = ["users", "teams", "documents"];

		for (const table of majorTables) {
			const rows = await queryRows<{ count: string }>(db, `SELECT COUNT(*) AS count FROM ${table}`);
			expect(Number(rows[0]?.count), `${table} should have ≥1 row`).toBeGreaterThanOrEqual(1);
		}
	});

	test("seed data is well-formed (queryable without errors)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const teamRow = await queryRows<{ id: string; name: string }>(
			db,
			"SELECT id, name FROM teams LIMIT 1",
		);
		expect(teamRow[0]?.id).toBeTruthy();
		expect(teamRow[0]?.name).toBeTruthy();

		const agents = await queryRows<{ id: string; name: string; role: string }>(
			db,
			"SELECT id, name, role FROM users LIMIT 1",
		);
		expect(agents[0]?.id).toBeTruthy();
		expect(agents[0]?.name).toBeTruthy();
		expect(agents[0]?.role).toBeTruthy();

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
		const before = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM users");

		// Second run must not error (uses onConflictDoNothing) and must not duplicate rows.
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);
		const after = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM users");

		expect(after[0]?.count).toBe(before[0]?.count);
	});
});

describe("seed() = runFactoryBootstrap + seedDemoWorld", () => {
	test("seed() produces factory layer (bootstrap) + demo world (Product team)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// Factory layer: system:propagation exists
		const propagation = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id = 'system:propagation'",
		);
		expect(propagation).toHaveLength(1);

		// Demo world: the Product team exists
		const product = await queryRows<{ id: string; name: string }>(
			db,
			"SELECT id, name FROM teams WHERE id = 'demo-team-product'",
		);
		expect(product).toHaveLength(1);
		expect(product[0]?.name).toBe("Product");
	});

	test("runFactoryBootstrap alone produces no demo data — no teams, no human users, no plugins", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);

		const teamRows = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM teams");
		expect(Number(teamRows[0]?.count)).toBe(0);

		const humanRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE kind = 'human'",
		);
		expect(Number(humanRows[0]?.count)).toBe(0);

		const pluginRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM plugins",
		);
		expect(Number(pluginRows[0]?.count)).toBe(0);
	});

	test("seedDemoWorld alone produces Product team + demo founder + demo agents", async ({ db }) => {
		await runFactoryBootstrap(db);
		const { teamId, founderId } = await seedDemoWorld(db);

		expect(teamId).toBe("demo-team-product");
		expect(founderId).toBe("demo-founder");

		const product = await queryRows<{ id: string; name: string }>(
			db,
			`SELECT id, name FROM teams WHERE id = '${teamId}'`,
		);
		expect(product).toHaveLength(1);
		expect(product[0]?.name).toBe("Product");

		const founder = await queryRows<{ id: string; kind: string }>(
			db,
			`SELECT id, kind FROM users WHERE id = '${founderId}'`,
		);
		expect(founder).toHaveLength(1);
		expect(founder[0]?.kind).toBe("human");
	});

	test("the founder is in Product and Support, Maya in Support, every agent in one team", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const teamsOf = async (userId: string): Promise<string[]> =>
			(
				await queryRows<{ name: string }>(
					db,
					`SELECT t.name FROM user_teams ut JOIN teams t ON t.id = ut.team_id
					  WHERE ut.user_id = '${userId}' ORDER BY t.name`,
				)
			).map((r) => r.name);
		expect(await teamsOf("demo-founder")).toEqual(["Product", "Support"]);
		expect(await teamsOf("demo-human-maya")).toEqual(["Support"]);

		const agentTeamCounts = await queryRows<{ id: string; teams: string }>(
			db,
			`SELECT u.id, COUNT(ut.team_id) AS teams FROM users u
			   LEFT JOIN user_teams ut ON ut.user_id = u.id
			  WHERE u.kind = 'ai' AND u.role <> 'system' GROUP BY u.id`,
		);
		expect(agentTeamCounts.length).toBeGreaterThan(0);
		expect(agentTeamCounts.filter((r) => Number(r.teams) !== 1)).toEqual([]);
	});
});
