/**
 * AF17 — AC4: Factory isolation — real user's DB contains no demo/example data.
 *
 * After `runFactoryBootstrap(db)` only (no demo helper):
 *   - teams count = 0
 *   - no users with kind="human"
 *   - no plugin installed (the demo's team agents come from one)
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
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM teams");
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no human users exist after bootstrap (human created at onboarding only)", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE kind = 'human'",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no plugin is installed after bootstrap", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM plugins");
		expect(Number(rows[0]?.count)).toBe(0);
	});
});
