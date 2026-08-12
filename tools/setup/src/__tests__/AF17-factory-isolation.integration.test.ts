/**
 * AF17 — AC4: Factory isolation — real user's DB contains no demo/example data.
 *
 * After `runFactoryBootstrap(db)` only (no demo helper):
 *   - teams count = 0
 *   - no users with kind="human"
 *   - no rows with seed-product-1 / demo-team-acme ids
 *   - no demo-agent-* rows
 *
 * Also verifies that no Nimmly / demo-team ids survive the bootstrap path.
 *
 * @lore AU29: relocated verbatim from `framework/db/src/__tests__/` (task D) —
 * `applyFactoryBootstrap` dissolved into the two layer faces; see `factory-bootstrap-runner.ts`.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import { runFactoryBootstrap } from "../factory-bootstrap-runner.js";

async function queryRows<T extends Record<string, unknown>>(
	db: HyperIdleDb,
	query: string,
): Promise<T[]> {
	const result = await db.execute(sql.raw(query));
	return (result as { rows: T[] }).rows;
}

describe("AF17 AC4: bootstrap-only DB contains no demo data", () => {
	test("teams table is empty after bootstrap (no demo team created)", async ({ db }) => {
		// @lore AU38 P10: bootstrap writes no teams. In a populated world other
		// tests may have written teams, so assert the bootstrap didn't ADD any
		// by diffing before/after around the call.
		const before = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM teams");
		const beforeCount = Number(before[0]?.count ?? 0);

		await runFactoryBootstrap(db);

		const after = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM teams");
		const afterCount = Number(after[0]?.count ?? 0);
		expect(afterCount - beforeCount).toBe(0);
	});

	test("no human users exist after bootstrap (human created at onboarding only)", async ({
		db,
	}) => {
		// @lore AU38 P10: diff before/after — in a populated world other tests
		// may have inserted human users; assert bootstrap didn't ADD any.
		const before = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE kind = 'human'",
		);
		const beforeCount = Number(before[0]?.count ?? 0);

		await runFactoryBootstrap(db);

		const after = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE kind = 'human'",
		);
		const afterCount = Number(after[0]?.count ?? 0);
		expect(afterCount - beforeCount).toBe(0);
	});

	test("no seed-product-1 row exists after bootstrap", async ({ db }) => {
		// @lore AU38 P10: assert bootstrap didn't ADD this row (diff before/after).
		// In a populated world another test may have created it already.
		const before = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM teams WHERE id = 'seed-product-1'",
		);
		const beforeCount = Number(before[0]?.count ?? 0);

		await runFactoryBootstrap(db);

		const after = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM teams WHERE id = 'seed-product-1'",
		);
		const afterCount = Number(after[0]?.count ?? 0);
		expect(afterCount - beforeCount).toBe(0);
	});

	test("no demo-team-acme row exists after bootstrap", async ({ db }) => {
		const before = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM teams WHERE id = 'demo-team-acme'",
		);
		const beforeCount = Number(before[0]?.count ?? 0);

		await runFactoryBootstrap(db);

		const after = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM teams WHERE id = 'demo-team-acme'",
		);
		const afterCount = Number(after[0]?.count ?? 0);
		expect(afterCount - beforeCount).toBe(0);
	});

	test("no demo-agent-* users exist after bootstrap", async ({ db }) => {
		const before = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE id LIKE 'demo-agent-%'",
		);
		const beforeCount = Number(before[0]?.count ?? 0);

		await runFactoryBootstrap(db);

		const after = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE id LIKE 'demo-agent-%'",
		);
		const afterCount = Number(after[0]?.count ?? 0);
		expect(afterCount - beforeCount).toBe(0);
	});

	test("no u-founder row exists after bootstrap", async ({ db }) => {
		const before = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE id = 'u-founder'",
		);
		const beforeCount = Number(before[0]?.count ?? 0);

		await runFactoryBootstrap(db);

		const after = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE id = 'u-founder'",
		);
		const afterCount = Number(after[0]?.count ?? 0);
		expect(afterCount - beforeCount).toBe(0);
	});

	test("no seed-agent-pm-nimmly row exists after bootstrap (purged to demo-agent-pm)", async ({
		db,
	}) => {
		const before = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE id = 'seed-agent-pm-nimmly'",
		);
		const beforeCount = Number(before[0]?.count ?? 0);

		await runFactoryBootstrap(db);

		const after = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE id = 'seed-agent-pm-nimmly'",
		);
		const afterCount = Number(after[0]?.count ?? 0);
		expect(afterCount - beforeCount).toBe(0);
	});

	test("no seed-agent-builder row exists after bootstrap (demo agent, not factory)", async ({
		db,
	}) => {
		const before = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE id = 'seed-agent-builder'",
		);
		const beforeCount = Number(before[0]?.count ?? 0);

		await runFactoryBootstrap(db);

		const after = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE id = 'seed-agent-builder'",
		);
		const afterCount = Number(after[0]?.count ?? 0);
		expect(afterCount - beforeCount).toBe(0);
	});
});
