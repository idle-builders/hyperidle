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

import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import { seed } from "../seed.js";
import { createTestDb, type TestDbHandle } from "../test-utils.js";

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
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	}, 30_000);

	afterEach(async () => {
		await handle.close();
	});

	it("soul_prompt column exists on users table and is nullable", async () => {
		const rows = await queryRows<{
			column_name: string;
			is_nullable: string;
			data_type: string;
		}>(
			db,
			`SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_name = 'users' AND table_schema = 'public'
       AND column_name = 'soul_prompt'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.column_name).toBe("soul_prompt");
		expect(rows[0]?.is_nullable).toBe("YES");
		expect(rows[0]?.data_type).toBe("text");
	});

	it("harness_type column exists on users table and is nullable", async () => {
		const rows = await queryRows<{
			column_name: string;
			is_nullable: string;
			data_type: string;
		}>(
			db,
			`SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_name = 'users' AND table_schema = 'public'
       AND column_name = 'harness_type'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.column_name).toBe("harness_type");
		expect(rows[0]?.is_nullable).toBe("YES");
		expect(rows[0]?.data_type).toBe("text");
	});

	it("model_tier_preference column exists on users table and is nullable", async () => {
		const rows = await queryRows<{
			column_name: string;
			is_nullable: string;
			data_type: string;
		}>(
			db,
			`SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_name = 'users' AND table_schema = 'public'
       AND column_name = 'model_tier_preference'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.column_name).toBe("model_tier_preference");
		expect(rows[0]?.is_nullable).toBe("YES");
		expect(rows[0]?.data_type).toBe("text");
	});

	it("can insert a user row with all three new columns null (null semantics work)", async () => {
		const now = new Date().toISOString();
		await db.execute(sql.raw(`
      INSERT INTO users (id, kind, name, role, status, created_at)
      VALUES ('x3-test-agent-null-cols', 'ai', 'Test Agent', 'builder', 'active', '${now}')
    `));

		const rows = await queryRows<{
			id: string;
			soul_prompt: string | null;
			harness_type: string | null;
			model_tier_preference: string | null;
		}>(
			db,
			`SELECT id, soul_prompt, harness_type, model_tier_preference
       FROM users WHERE id = 'x3-test-agent-null-cols'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.soul_prompt).toBeNull();
		expect(rows[0]?.harness_type).toBeNull();
		expect(rows[0]?.model_tier_preference).toBeNull();
	});

	it("can insert a user row with soulPrompt, harnessType, modelTierPreference set", async () => {
		const now = new Date().toISOString();
		await db.execute(sql.raw(`
      INSERT INTO users (id, kind, name, role, status, created_at, soul_prompt, harness_type, model_tier_preference)
      VALUES ('x3-test-agent-full-cols', 'ai', 'Full Bot', 'builder', 'active', '${now}',
              'You are a builder.', 'claude-code', 'reasoning')
    `));

		const rows = await queryRows<{
			soul_prompt: string | null;
			harness_type: string | null;
			model_tier_preference: string | null;
		}>(
			db,
			`SELECT soul_prompt, harness_type, model_tier_preference
       FROM users WHERE id = 'x3-test-agent-full-cols'`,
		);
		expect(rows[0]?.soul_prompt).toBe("You are a builder.");
		expect(rows[0]?.harness_type).toBe("claude-code");
		expect(rows[0]?.model_tier_preference).toBe("reasoning");
	});
});

// ---------------------------------------------------------------------------
// AC-2: Soul prompt templates seeded into factorySettings
// ---------------------------------------------------------------------------

describe("X3 AC-2: soul prompt templates seeded from docs/souls/ into factorySettings", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		await seed(db);
	}, 30_000);

	afterEach(async () => {
		await handle.close();
	});

	it("factory_settings has soul_template:product_manager key with non-empty content", async () => {
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

	it("factory_settings has soul_template:practice_facilitator key with non-empty content", async () => {
		const rows = await queryRows<{ key: string; value: string }>(
			db,
			`SELECT key, value FROM factory_settings WHERE key = 'soul_template:practice_facilitator'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.value).toBeTruthy();
		expect(rows[0]?.value.length).toBeGreaterThan(50);
		// Content should not have YAML frontmatter
		expect(rows[0]?.value).not.toMatch(/^---/);
	});

	it("factory_settings has soul_template:chief_of_staff key with non-empty content", async () => {
		const rows = await queryRows<{ key: string; value: string }>(
			db,
			`SELECT key, value FROM factory_settings WHERE key = 'soul_template:chief_of_staff'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.value).toBeTruthy();
		expect(rows[0]?.value.length).toBeGreaterThan(50);
		// Content should not have YAML frontmatter
		expect(rows[0]?.value).not.toMatch(/^---/);
	});

	it("product_manager template content contains recognizable persona content", async () => {
		const rows = await queryRows<{ value: string }>(
			db,
			`SELECT value FROM factory_settings WHERE key = 'soul_template:product_manager'`,
		);
		// The content from docs/souls/product-manager.md should be substantive
		const content = rows[0]?.value ?? "";
		// The soul prompt should contain markdown headings or identity content
		expect(content).toMatch(/#|You are|Product Manager|PM/i);
	});

	it("seed is idempotent — running twice does not duplicate templates", async () => {
		await seed(db); // second run

		const rows = await queryRows<{ count: string }>(
			db,
			`SELECT COUNT(*) AS count FROM factory_settings WHERE key LIKE 'soul_template:%'`,
		);
		// Should have exactly 3 templates (one per documented soul file)
		expect(Number(rows[0]?.count)).toBe(3);
	});

	it("no soul_template:builder entry exists (no docs/souls/builder.md file)", async () => {
		const rows = await queryRows<{ key: string }>(
			db,
			`SELECT key FROM factory_settings WHERE key = 'soul_template:builder'`,
		);
		// Builder has no template — soul prompt textarea starts empty
		expect(rows).toHaveLength(0);
	});

	it("no soul_template:growth entry exists (no docs/souls/growth.md file)", async () => {
		const rows = await queryRows<{ key: string }>(
			db,
			`SELECT key FROM factory_settings WHERE key = 'soul_template:growth'`,
		);
		expect(rows).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// AC-3: Existing seed agents backfilled with soulPrompt
// ---------------------------------------------------------------------------

describe("X3 AC-3: existing agents backfilled with soulPrompt from role template", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		await seed(db);
	}, 30_000);

	afterEach(async () => {
		await handle.close();
	});

	it("seed-agent-pm-nimmly has soulPrompt matching product_manager template", async () => {
		const agentRows = await queryRows<{ soul_prompt: string | null }>(
			db,
			`SELECT soul_prompt FROM users WHERE id = 'seed-agent-pm-nimmly'`,
		);
		const templateRows = await queryRows<{ value: string }>(
			db,
			`SELECT value FROM factory_settings WHERE key = 'soul_template:product_manager'`,
		);

		expect(agentRows[0]?.soul_prompt).toBeTruthy();
		expect(agentRows[0]?.soul_prompt).toBe(templateRows[0]?.value);
	});

	it("seed-agent-cos has soulPrompt matching chief_of_staff template", async () => {
		const agentRows = await queryRows<{ soul_prompt: string | null }>(
			db,
			`SELECT soul_prompt FROM users WHERE id = 'seed-agent-cos'`,
		);
		const templateRows = await queryRows<{ value: string }>(
			db,
			`SELECT value FROM factory_settings WHERE key = 'soul_template:chief_of_staff'`,
		);

		expect(agentRows[0]?.soul_prompt).toBeTruthy();
		expect(agentRows[0]?.soul_prompt).toBe(templateRows[0]?.value);
	});

	it("practice_facilitator agents have soulPrompt matching practice_facilitator template", async () => {
		const agentRows = await queryRows<{ id: string; soul_prompt: string | null }>(
			db,
			`SELECT id, soul_prompt FROM users WHERE role = 'practice_facilitator'`,
		);
		const templateRows = await queryRows<{ value: string }>(
			db,
			`SELECT value FROM factory_settings WHERE key = 'soul_template:practice_facilitator'`,
		);

		expect(agentRows.length).toBeGreaterThanOrEqual(1);
		for (const agent of agentRows) {
			expect(agent.soul_prompt, `${agent.id} should have soul_prompt set`).toBeTruthy();
			expect(agent.soul_prompt).toBe(templateRows[0]?.value);
		}
	});

	it("seed-agent-builder has null soulPrompt (no builder template)", async () => {
		const rows = await queryRows<{ soul_prompt: string | null }>(
			db,
			`SELECT soul_prompt FROM users WHERE id = 'seed-agent-builder'`,
		);
		expect(rows[0]?.soul_prompt).toBeNull();
	});

	it("system:propagation has null soulPrompt (system role, no template)", async () => {
		const rows = await queryRows<{ soul_prompt: string | null }>(
			db,
			`SELECT soul_prompt FROM users WHERE id = 'system:propagation'`,
		);
		expect(rows[0]?.soul_prompt).toBeNull();
	});
});
