/**
 * AF17 — AC1 + AC2: Factory Bootstrap
 *
 * AC1: Fresh environment has complete factory layer (system identities, facilitators,
 *      soul templates, factory principle) without manual step.
 *
 * AC2: Re-applying factory bootstrap is idempotent — row counts and values are
 *      identical after the second call.
 *
 * RED PHASE: These tests fail until `applyFactoryBootstrap` is created in
 * `packages/db/src/factory-bootstrap.ts`.
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

// ─────────────────────────────────────────────────────────────────────────────
// AC1: Factory layer is complete after a single applyFactoryBootstrap call
// ─────────────────────────────────────────────────────────────────────────────

describe("AF17 AC1: applyFactoryBootstrap creates the complete factory layer", () => {
	test("system:propagation user exists after bootstrap", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id = 'system:propagation'",
		);
		expect(rows).toHaveLength(1);
	});

	test("System Agent singleton (seed-agent-cos) exists with individual category", async ({
		db,
	}) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ id: string; agent_category: string | null }>(
			db,
			"SELECT id, agent_category FROM users WHERE id = 'seed-agent-cos'",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.agent_category).toBe("individual");
	});

	test("one facilitator agent per community of practice (5 communities)", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ id: string; role: string }>(
			db,
			"SELECT id, role FROM users WHERE id LIKE 'seed-agent-pf-%' ORDER BY id",
		);
		// 5 communities: build, product, growth, ops, facilitation
		expect(rows.length).toBeGreaterThanOrEqual(5);
		for (const row of rows) {
			expect(row.role).toBe("facilitator");
		}
	});

	test("soul_template:product_manager key exists in factory_settings", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ key: string; value: string }>(
			db,
			"SELECT key, value FROM factory_settings WHERE key = 'soul_template:product_manager'",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.value.length).toBeGreaterThan(50);
	});

	test("soul_template:facilitator key exists in factory_settings", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ key: string; value: string }>(
			db,
			"SELECT key, value FROM factory_settings WHERE key = 'soul_template:facilitator'",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.value.length).toBeGreaterThan(50);
	});

	test("cost_cap and cost_cycle factory_settings keys exist", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ key: string }>(
			db,
			"SELECT key FROM factory_settings WHERE key IN ('cost_cap','cost_cycle') ORDER BY key",
		);
		expect(rows.map((r) => r.key)).toEqual(["cost_cap", "cost_cycle"]);
	});

	test("factory principle knowledge item (seed-ki-1) exists with scope_kind=factory", async ({
		db,
	}) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ id: string; scope_kind: string }>(
			db,
			"SELECT id, scope_kind FROM knowledge_items WHERE id = 'seed-ki-1'",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.scope_kind).toBe("factory");
	});

	test("factory principle has a strategy fabric row", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ knowledge_item_id: string; layer: string; kind: string }>(
			db,
			"SELECT knowledge_item_id, layer, kind FROM knowledge_strategy_fabric WHERE knowledge_item_id = 'seed-ki-1'",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.layer).toBe("L4");
		expect(rows[0]?.kind).toBe("principle");
	});

	test("no teams row is created by bootstrap (team_id null constraint)", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM teams");
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no team_members row is created by bootstrap", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM team_members",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no routines row is created by bootstrap (routines require a team)", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM routines");
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no human user (kind=human) is created by bootstrap", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE kind = 'human'",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("facilitator agents have null team_id (factory-scoped, not team-scoped)", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ id: string; team_id: string | null }>(
			db,
			"SELECT id, team_id FROM users WHERE id LIKE 'seed-agent-pf-%'",
		);
		expect(rows.length).toBeGreaterThanOrEqual(1);
		for (const row of rows) {
			expect(row.team_id).toBeNull();
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2: Bootstrap is idempotent — second call produces identical state
// ─────────────────────────────────────────────────────────────────────────────

describe("AF17 AC2: applyFactoryBootstrap is idempotent", () => {
	test("running bootstrap twice produces the same users count", async ({ db }) => {
		await applyFactoryBootstrap(db);
		const rows1 = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM users");
		const count1 = Number(rows1[0]?.count);

		await applyFactoryBootstrap(db);
		const rows2 = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM users");
		const count2 = Number(rows2[0]?.count);

		expect(count2).toBe(count1);
	});

	test("running bootstrap twice produces the same factory_settings count", async ({ db }) => {
		await applyFactoryBootstrap(db);
		const rows1 = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM factory_settings",
		);
		const count1 = Number(rows1[0]?.count);

		await applyFactoryBootstrap(db);
		const rows2 = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM factory_settings",
		);
		const count2 = Number(rows2[0]?.count);

		expect(count2).toBe(count1);
	});

	test("running bootstrap twice does not throw", async ({ db }) => {
		await applyFactoryBootstrap(db);
		await expect(applyFactoryBootstrap(db)).resolves.not.toThrow();
	});

	test("soul_template values are identical after second run", async ({ db }) => {
		await applyFactoryBootstrap(db);
		const rows1 = await queryRows<{ key: string; value: string }>(
			db,
			"SELECT key, value FROM factory_settings WHERE key LIKE 'soul_template:%' ORDER BY key",
		);

		await applyFactoryBootstrap(db);
		const rows2 = await queryRows<{ key: string; value: string }>(
			db,
			"SELECT key, value FROM factory_settings WHERE key LIKE 'soul_template:%' ORDER BY key",
		);

		expect(rows2).toEqual(rows1);
	});

	test("system:propagation row is identical after second run", async ({ db }) => {
		await applyFactoryBootstrap(db);
		const rows1 = await queryRows<{ id: string; kind: string; role: string }>(
			db,
			"SELECT id, kind, role FROM users WHERE id = 'system:propagation'",
		);

		await applyFactoryBootstrap(db);
		const rows2 = await queryRows<{ id: string; kind: string; role: string }>(
			db,
			"SELECT id, kind, role FROM users WHERE id = 'system:propagation'",
		);

		expect(rows2).toEqual(rows1);
	});
});
