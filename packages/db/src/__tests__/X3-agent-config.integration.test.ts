/**
 * X3 — Agent Configuration: DB migration + seed tests (RED phase)
 *
 * AC-1: Users table gains soulPrompt, harnessType, modelTierPreference columns
 * AC-2: Soul prompt templates seeded from docs/souls/ files into factorySettings
 * AC-3: Existing agents backfilled with soulPrompt from role template
 *
 * These tests FAIL until:
 *  - Migration 0021_X3_agent_config.sql adds the three new columns
 *  - seed.ts is updated to insert soul_template:* factorySettings rows
 *  - seed.ts backfills soulPrompt on seed agent rows
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";
import { seed } from "../seed.js";

async function queryRows<T extends Record<string, unknown>>(
	db: HyperIdleDb,
	query: string,
): Promise<T[]> {
	const result = await db.execute(sql.raw(query));
	return (result as { rows: T[] }).rows;
}

// ---------------------------------------------------------------------------
// AC-1: users table has the three new X3 columns
// ---------------------------------------------------------------------------

describe("X3 AC-1: users table gains soulPrompt, harnessType, modelTierPreference columns", () => {
	test("soul_prompt column exists on users table and is nullable", async ({ db }) => {
		const rows = await queryRows<{
			columnName: string;
			isNullable: string;
			dataType: string;
		}>(
			db,
			`SELECT column_name AS "columnName", is_nullable AS "isNullable", data_type AS "dataType"
       FROM information_schema.columns
       WHERE table_name = 'users' AND table_schema = 'public'
       AND column_name = 'soul_prompt'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.columnName).toBe("soul_prompt");
		expect(rows[0]?.isNullable).toBe("YES");
		expect(rows[0]?.dataType).toBe("text");
	});

	test("harness_type column exists on users table and is nullable", async ({ db }) => {
		const rows = await queryRows<{
			columnName: string;
			isNullable: string;
			dataType: string;
		}>(
			db,
			`SELECT column_name AS "columnName", is_nullable AS "isNullable", data_type AS "dataType"
       FROM information_schema.columns
       WHERE table_name = 'users' AND table_schema = 'public'
       AND column_name = 'harness_type'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.columnName).toBe("harness_type");
		expect(rows[0]?.isNullable).toBe("YES");
		expect(rows[0]?.dataType).toBe("text");
	});

	test("model_tier_preference column exists on users table and is nullable", async ({ db }) => {
		const rows = await queryRows<{
			columnName: string;
			isNullable: string;
			dataType: string;
		}>(
			db,
			`SELECT column_name AS "columnName", is_nullable AS "isNullable", data_type AS "dataType"
       FROM information_schema.columns
       WHERE table_name = 'users' AND table_schema = 'public'
       AND column_name = 'model_tier_preference'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.columnName).toBe("model_tier_preference");
		expect(rows[0]?.isNullable).toBe("YES");
		expect(rows[0]?.dataType).toBe("text");
	});

	test("can insert a user row with all three new columns null (null semantics work)", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.execute(
			sql.raw(`
      INSERT INTO users (id, kind, name, role, status, created_at)
      VALUES ('x3-test-agent-null-cols', 'ai', 'Test Agent', 'builder', 'active', '${now}')
    `),
		);

		const rows = await queryRows<{
			id: string;
			soulPrompt: string | null;
			harnessType: string | null;
			modelTierPreference: string | null;
		}>(
			db,
			`SELECT id, soul_prompt AS "soulPrompt", harness_type AS "harnessType", model_tier_preference AS "modelTierPreference"
       FROM users WHERE id = 'x3-test-agent-null-cols'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.soulPrompt).toBeNull();
		expect(rows[0]?.harnessType).toBeNull();
		expect(rows[0]?.modelTierPreference).toBeNull();
	});

	test("can insert a user row with soulPrompt, harnessType, modelTierPreference set", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.execute(
			sql.raw(`
      INSERT INTO users (id, kind, name, role, status, created_at, soul_prompt, harness_type, model_tier_preference)
      VALUES ('x3-test-agent-full-cols', 'ai', 'Full Bot', 'builder', 'active', '${now}',
              'You are a builder.', 'claude-code', 'reasoning')
    `),
		);

		const rows = await queryRows<{
			soulPrompt: string | null;
			harnessType: string | null;
			modelTierPreference: string | null;
		}>(
			db,
			`SELECT soul_prompt AS "soulPrompt", harness_type AS "harnessType", model_tier_preference AS "modelTierPreference"
       FROM users WHERE id = 'x3-test-agent-full-cols'`,
		);
		expect(rows[0]?.soulPrompt).toBe("You are a builder.");
		expect(rows[0]?.harnessType).toBe("claude-code");
		expect(rows[0]?.modelTierPreference).toBe("reasoning");
	});
});

// ---------------------------------------------------------------------------
// AC-2: Soul prompt templates seeded into factorySettings
// ---------------------------------------------------------------------------

describe("X3 AC-2: soul prompt templates seeded from docs/souls/ into factorySettings", () => {
	test("factory_settings has soul_template:product_manager key with non-empty content", async ({
		db,
	}) => {
		await seed(db);

		const rows = await queryRows<{ key: string; value: string }>(
			db,
			`SELECT key, value FROM factory_settings WHERE key = 'soul_template:product_manager'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.value).toBeTruthy();
		expect(rows[0]?.value.length).toBeGreaterThan(50);
		// Content should not have YAML frontmatter
		expect(rows[0]?.value).not.toMatch(/^---/);
	});

	// @lore AD8c: key renamed from soul_template:practice_facilitator to soul_template:facilitator
	test("factory_settings has soul_template:facilitator key with non-empty content (AD8c)", async ({
		db,
	}) => {
		await seed(db);

		const rows = await queryRows<{ key: string; value: string }>(
			db,
			`SELECT key, value FROM factory_settings WHERE key = 'soul_template:facilitator'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.value).toBeTruthy();
		expect(rows[0]?.value.length).toBeGreaterThan(50);
		// Content should not have YAML frontmatter
		expect(rows[0]?.value).not.toMatch(/^---/);
	});

	// @lore AD8c: old key must not exist after rename
	test("factory_settings does NOT have soul_template:practice_facilitator (AD8c renamed)", async ({
		db,
	}) => {
		await seed(db);
		const rows = await queryRows<{ key: string }>(
			db,
			`SELECT key FROM factory_settings WHERE key = 'soul_template:practice_facilitator'`,
		);
		expect(rows).toHaveLength(0);
	});

	// @lore AD8a: soul_template:chief_of_staff deleted — docs/souls/chief-of-staff.md removed.
	// AD8b adds assistant.md and re-inserts the entry with the new role name.
	// @lore AD8a: chief_of_staff soul deleted; key no longer inserted by seed.
	test("does NOT have soul_template:chief_of_staff key (AD8a: soul deleted)", async ({ db }) => {
		// @lore AD8a: role string renamed in AD8b
		// @lore AD8a: role string renamed in AD8b
		await seed(db);

		const rows = await queryRows<{ key: string; value: string }>(
			db,
			`SELECT key, value FROM factory_settings WHERE key = 'soul_template:chief_of_staff'`, // @lore AD8a: key deleted; AD8b creates soul_template:assistant
		);
		expect(rows).toHaveLength(0);
	});

	test("product_manager template content contains recognizable persona content", async ({ db }) => {
		await seed(db);

		const rows = await queryRows<{ value: string }>(
			db,
			`SELECT value FROM factory_settings WHERE key = 'soul_template:product_manager'`,
		);
		// The content from docs/souls/product-manager.md should be substantive
		const content = rows[0]?.value ?? "";
		// The soul prompt should contain markdown headings or identity content
		expect(content).toMatch(/#|You are|Product Manager|PM/i);
	});

	test("seed is idempotent — running twice does not duplicate templates", async ({ db }) => {
		await seed(db);
		await seed(db); // second run

		const rows = await queryRows<{ count: string }>(
			db,
			`SELECT COUNT(*) AS count FROM factory_settings WHERE key LIKE 'soul_template:%'`,
		);
		// AB0: 8 templates. @lore AD8a: chief_of_staff soul deleted → now 7 templates.
		// @lore AD8c: practice_facilitator renamed to facilitator — still 7 templates.
		// facilitator, product_manager, builder, growth, designer, qa_engineer, ops.
		expect(Number(rows[0]?.count)).toBeGreaterThanOrEqual(7);
	});

	// AB0: builder and growth now have templates (docs/souls/builder.md, docs/souls/growth.md added)
	test("soul_template:builder entry exists (AB0 added docs/souls/builder.md)", async ({ db }) => {
		await seed(db);

		const rows = await queryRows<{ key: string }>(
			db,
			`SELECT key FROM factory_settings WHERE key = 'soul_template:builder'`,
		);
		expect(rows).toHaveLength(1);
	});

	test("soul_template:growth entry exists (AB0 added docs/souls/growth.md)", async ({ db }) => {
		await seed(db);

		const rows = await queryRows<{ key: string }>(
			db,
			`SELECT key FROM factory_settings WHERE key = 'soul_template:growth'`,
		);
		expect(rows).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// AC-3: Existing seed agents backfilled with soulPrompt
// ---------------------------------------------------------------------------

describe("X3 AC-3: existing agents backfilled with soulPrompt from role template", () => {
	test("demo-agent-pm has soulPrompt matching product_manager template", async ({ db }) => {
		await seed(db);

		const agentRows = await queryRows<{ soulPrompt: string | null }>(
			db,
			`SELECT soul_prompt AS "soulPrompt" FROM users WHERE id = 'demo-agent-pm'`,
		);
		const templateRows = await queryRows<{ value: string }>(
			db,
			`SELECT value FROM factory_settings WHERE key = 'soul_template:product_manager'`,
		);

		expect(agentRows[0]?.soulPrompt).toBeTruthy();
		expect(agentRows[0]?.soulPrompt).toBe(templateRows[0]?.value);
	});

	// @lore AD8a: seed-agent-cos soul file deleted. soulPrompt is null until AD8b adds assistant.md.
	test("seed-agent-cos has null soulPrompt (AD8a: soul deleted)", async ({ db }) => {
		await seed(db);

		const agentRows = await queryRows<{ soulPrompt: string | null }>(
			db,
			`SELECT soul_prompt AS "soulPrompt" FROM users WHERE id = 'seed-agent-cos'`,
		);

		expect(agentRows[0]?.soulPrompt).toBeNull();
	});

	// @lore AD8c: role renamed from practice_facilitator to facilitator; template key renamed accordingly.
	test("facilitator agents have soulPrompt matching facilitator template (AD8c)", async ({
		db,
	}) => {
		await seed(db);

		const agentRows = await queryRows<{ id: string; soulPrompt: string | null }>(
			db,
			`SELECT id, soul_prompt AS "soulPrompt" FROM users WHERE role = 'facilitator'`,
		);
		const templateRows = await queryRows<{ value: string }>(
			db,
			`SELECT value FROM factory_settings WHERE key = 'soul_template:facilitator'`,
		);

		expect(agentRows.length).toBeGreaterThanOrEqual(1);
		for (const agent of agentRows) {
			expect(agent.soulPrompt, `${agent.id} should have soulPrompt set`).toBeTruthy();
			expect(agent.soulPrompt).toBe(templateRows[0]?.value);
		}
	});

	// AB0: builder now has a template (docs/souls/builder.md added)
	test("seed-agent-builder has soulPrompt matching builder template", async ({ db }) => {
		await seed(db);

		const agentRows = await queryRows<{ soulPrompt: string | null }>(
			db,
			`SELECT soul_prompt AS "soulPrompt" FROM users WHERE id = 'seed-agent-builder'`,
		);
		const templateRows = await queryRows<{ value: string }>(
			db,
			`SELECT value FROM factory_settings WHERE key = 'soul_template:builder'`,
		);

		expect(agentRows[0]?.soulPrompt).toBeTruthy();
		expect(agentRows[0]?.soulPrompt).toBe(templateRows[0]?.value);
	});

	test("system:propagation has null soulPrompt (system role, no template)", async ({ db }) => {
		await seed(db);

		const rows = await queryRows<{ soulPrompt: string | null }>(
			db,
			`SELECT soul_prompt AS "soulPrompt" FROM users WHERE id = 'system:propagation'`,
		);
		expect(rows[0]?.soulPrompt).toBeNull();
	});
});
