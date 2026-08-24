/**
 * AF17 — AC1 + AC2: Factory Bootstrap
 *
 * AC1: Fresh environment has complete factory layer (system identities,
 *      system prompt templates, factory principle) without manual step.
 *
 * AC2: Re-applying factory bootstrap is idempotent — row counts and values are
 *      identical after the second call.
 *
 * @lore AU29: relocated verbatim from `framework/db/src/__tests__/` (task D)
 * — `applyFactoryBootstrap` dissolved into the two layer faces, and the
 * composed sequence now lives in this package's `factory-bootstrap-runner.ts`.
 *
 * @lore AU44 AU20-fd: `framework/factory-defaults` dissolved. Facilitator assertions
 * removed — the five facilitator agents move to the practice-communities plugin
 * (AU20 Ruling 3). Core now seeds only system:propagation + seed-agent-cos.
 * `readSystemPromptTemplateForRole` imported from `@hyperidle/org` (new home).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { readSystemPromptTemplateForRole } from "@hyperidle/org";
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
// AC1: Factory layer is complete after a single runFactoryBootstrap call
// ─────────────────────────────────────────────────────────────────────────────

describe("AF17 AC1: runFactoryBootstrap creates the complete factory layer", () => {
	test("system:propagation user exists after bootstrap", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id = 'system:propagation'",
		);
		expect(rows).toHaveLength(1);
	});

	test("System Agent singleton (seed-agent-cos) exists with individual category", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ id: string; agent_category: string | null }>(
			db,
			"SELECT id, agent_category FROM users WHERE id = 'seed-agent-cos'",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.agent_category).toBe("individual");
	});

	// @lore AU44 AU20-fd: facilitators removed from core seed — moved to plugin. Zero expected.
	test("no facilitator agents seeded by bootstrap (moved to plugin, AU20 Ruling 3)", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE role = 'facilitator'",
		);
		expect(Number(rows[0]?.count)).toBe(0);
	});

	// @lore AU18: previously asserted a `factory_settings.system_template:<role>`
	// cache row; that table is retired. Templates now resolve directly via the
	// shared `readSystemPromptTemplateForRole` docs-backed resolver — bootstrap
	// no longer needs to have run first (the resolver reads docs directly), but
	// we still call it here to prove it doesn't error/interfere.
	test("product_manager system prompt template resolves (docs-backed)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const content = readSystemPromptTemplateForRole("product_manager");
		expect(content).toBeTruthy();
		expect((content ?? "").length).toBeGreaterThan(50);
	});

	test("facilitator system prompt template resolves (docs-backed)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const content = readSystemPromptTemplateForRole("facilitator");
		expect(content).toBeTruthy();
		expect((content ?? "").length).toBeGreaterThan(50);
	});

	// @lore AU18: `cost_cap`/`cost_cycle` factory_settings seeds are retired.
	test("bootstrap writes no server_config row (cost_cap default now lives server-side)", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ id: string }>(db, "SELECT id FROM server_config");
		expect(rows).toHaveLength(0);
	});

	test("no teams row is created by bootstrap (team_id null constraint)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM teams");
		expect(Number(rows[0]?.count)).toBe(0);
	});

	test("no routines row is created by bootstrap (routines require a team)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM routines");
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
// AC2: Bootstrap is idempotent — second call produces identical state
// ─────────────────────────────────────────────────────────────────────────────

describe("AF17 AC2: runFactoryBootstrap is idempotent", () => {
	test("running bootstrap twice produces the same users count", async ({ db }) => {
		await runFactoryBootstrap(db);
		const rows1 = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM users");
		const count1 = Number(rows1[0]?.count);

		await runFactoryBootstrap(db);
		const rows2 = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM users");
		const count2 = Number(rows2[0]?.count);

		expect(count2).toBe(count1);
	});

	// @lore AU18: `factory_settings` count no longer applies (table retired).
	test("running bootstrap twice produces identical resolved templates", async ({ db }) => {
		await runFactoryBootstrap(db);
		const first = readSystemPromptTemplateForRole("product_manager");

		await runFactoryBootstrap(db);
		const second = readSystemPromptTemplateForRole("product_manager");

		expect(second).toEqual(first);
	});

	test("running bootstrap twice does not throw", async ({ db }) => {
		await runFactoryBootstrap(db);
		await expect(runFactoryBootstrap(db)).resolves.not.toThrow();
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
