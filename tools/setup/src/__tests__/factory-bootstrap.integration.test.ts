/**
 * `runFactoryBootstrap` gives a fresh environment the factory layer — the hidden system actor and
 * nothing else — without a manual step, and re-applying it is idempotent.
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

// ─────────────────────────────────────────────────────────────────────────────
// Factory layer is complete after a single runFactoryBootstrap call
// ─────────────────────────────────────────────────────────────────────────────

describe("runFactoryBootstrap creates the complete factory layer", () => {
	test("system:propagation user exists after bootstrap", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id = 'system:propagation'",
		);
		expect(rows).toHaveLength(1);
	});

	test("bootstrap writes no agent: the system actor is the only user", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ id: string }>(db, "SELECT id FROM users ORDER BY id");
		expect(rows.map((r) => r.id)).toEqual(["system:propagation"]);
	});

	// Facilitator agents (seed-agent-pf-*) are provided by the rituals plugin, not the
	// factory bootstrap — 0 pf-* rows after bootstrap proves the clean boundary.
	test("factory no longer seeds facilitator agents (now plugin-provided)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ id: string; role: string }>(
			db,
			"SELECT id, role FROM users WHERE id LIKE 'seed-agent-pf-%' ORDER BY id",
		);
		expect(rows.length).toBe(0);
	});

	// Bootstrap does not seed documents.

	test("no teams row is created by bootstrap (team_id null constraint)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM teams");
		expect(Number(rows[0]?.count)).toBe(0);
	});

	// Factory bootstrap creates factory-scoped system identities, never a team or a
	// subscription.
	test("no subscriptions row is created by bootstrap", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM subscriptions",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no human user (kind=human) is created by bootstrap", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE kind = 'human'",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap is idempotent — second call produces identical state
// ─────────────────────────────────────────────────────────────────────────────

describe("runFactoryBootstrap is idempotent", () => {
	test("running bootstrap twice produces the same users count", async ({ db }) => {
		await runFactoryBootstrap(db);
		const rows1 = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM users");
		const count1 = Number(rows1[0]?.count);

		await runFactoryBootstrap(db);
		const rows2 = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM users");
		const count2 = Number(rows2[0]?.count);

		expect(count2).toBe(count1);
	});

	test("system:propagation row is identical after second run", async ({ db }) => {
		await runFactoryBootstrap(db);
		const rows1 = await queryRows<{ id: string; kind: string; role: string }>(
			db,
			"SELECT id, kind, role FROM users WHERE id = 'system:propagation'",
		);

		await runFactoryBootstrap(db);
		const rows2 = await queryRows<{ id: string; kind: string; role: string }>(
			db,
			"SELECT id, kind, role FROM users WHERE id = 'system:propagation'",
		);

		expect(rows2).toEqual(rows1);
	});
});
