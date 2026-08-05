/**
 * AF17 — AC4: Factory isolation — real user's DB contains no demo/example data.
 *
 * After `applyFactoryBootstrap(db)` only (no demo helper):
 *   - teams count = 0
 *   - no users with kind="human"
 *   - no rows with seed-product-1 / demo-team-acme ids
 *   - no demo-agent-* rows
 *
 * Also verifies that no Nimmly / demo-team ids survive the bootstrap path.
 *
 * RED PHASE: Fails until factory-bootstrap.ts is created and seed.ts is split.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";
import { applyFactoryBootstrap } from "../factory-bootstrap.js";

async function queryRows<T extends Record<string, unknown>>(
	db: HyperIdleDb,
	query: string,
): Promise<T[]> {
	const result = await db.execute(sql.raw(query));
	return (result as { rows: T[] }).rows;
}

describe("AF17 AC4: bootstrap-only DB contains no demo data", () => {
	test("teams table is empty after bootstrap (no demo team created)", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM teams");
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no human users exist after bootstrap (human created at onboarding only)", async ({
		db,
	}) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE kind = 'human'",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no seed-product-1 row exists after bootstrap", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM teams WHERE id = 'seed-product-1'",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no demo-team-acme row exists after bootstrap", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM teams WHERE id = 'demo-team-acme'",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no demo-agent-* users exist after bootstrap", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE id LIKE 'demo-agent-%'",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no u-founder row exists after bootstrap", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE id = 'u-founder'",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no seed-agent-pm-nimmly row exists after bootstrap (purged to demo-agent-pm)", async ({
		db,
	}) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE id = 'seed-agent-pm-nimmly'",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no seed-agent-builder row exists after bootstrap (demo agent, not factory)", async ({
		db,
	}) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE id = 'seed-agent-builder'",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});
});
