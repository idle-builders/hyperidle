/**
 * X3 — Agent Configuration: DB migration + seed tests
 *
 * AC-1: Users table gains systemPrompt, harnessType, modelTierPreference columns
 * AC-2: System prompt templates readable from docs/system-prompts/ via the
 *       shared role→filename resolver
 * AC-3: Existing agents backfilled with systemPrompt from role template
 *
 * @lore AU18: AC-2 previously asserted templates were cached into
 * `factory_settings.system_template:<role>` rows by seed(). That table is
 * retired — templates are now read directly via `readSystemPromptTemplateForRole`
 * (system-prompt-templates.ts), the same resolver `roster.ts`/`agents.ts` use
 * at request time. AC-2/AC-3 below assert the same observable outcome
 * (template content resolves; agents get backfilled with it) through the new
 * storage.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";
import { seed } from "../seed.js";
import {
	readSystemPromptTemplateForRole,
	SYSTEM_PROMPT_TEMPLATE_FILES,
} from "../system-prompt-templates.js";

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

describe("X3 AC-1: users table gains systemPrompt, harnessType, modelTierPreference columns", () => {
	test("system_prompt column exists on users table and is nullable", async ({ db }) => {
		const rows = await queryRows<{
			columnName: string;
			isNullable: string;
			dataType: string;
		}>(
			db,
			`SELECT column_name AS "columnName", is_nullable AS "isNullable", data_type AS "dataType"
       FROM information_schema.columns
       WHERE table_name = 'users' AND table_schema = 'public'
       AND column_name = 'system_prompt'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.columnName).toBe("system_prompt");
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
			systemPrompt: string | null;
			harnessType: string | null;
			modelTierPreference: string | null;
		}>(
			db,
			`SELECT id, system_prompt AS "systemPrompt", harness_type AS "harnessType", model_tier_preference AS "modelTierPreference"
       FROM users WHERE id = 'x3-test-agent-null-cols'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.systemPrompt).toBeNull();
		expect(rows[0]?.harnessType).toBeNull();
		expect(rows[0]?.modelTierPreference).toBeNull();
	});

	test("can insert a user row with systemPrompt, harnessType, modelTierPreference set", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.execute(
			sql.raw(`
      INSERT INTO users (id, kind, name, role, status, created_at, system_prompt, harness_type, model_tier_preference)
      VALUES ('x3-test-agent-full-cols', 'ai', 'Full Bot', 'builder', 'active', '${now}',
              'You are a builder.', 'claude-code', 'reasoning')
    `),
		);

		const rows = await queryRows<{
			systemPrompt: string | null;
			harnessType: string | null;
			modelTierPreference: string | null;
		}>(
			db,
			`SELECT system_prompt AS "systemPrompt", harness_type AS "harnessType", model_tier_preference AS "modelTierPreference"
       FROM users WHERE id = 'x3-test-agent-full-cols'`,
		);
		expect(rows[0]?.systemPrompt).toBe("You are a builder.");
		expect(rows[0]?.harnessType).toBe("claude-code");
		expect(rows[0]?.modelTierPreference).toBe("reasoning");
	});
});

// ---------------------------------------------------------------------------
// AC-2: System prompt templates readable from docs/system-prompts/
// ---------------------------------------------------------------------------

describe("X3 AC-2: system prompt templates readable from docs/system-prompts/ via the shared resolver", () => {
	test("product_manager template resolves with non-empty content, no frontmatter", () => {
		const content = readSystemPromptTemplateForRole("product_manager");
		expect(content).toBeTruthy();
		expect((content ?? "").length).toBeGreaterThan(50);
		expect(content).not.toMatch(/^---/);
	});

	// @lore AD8c: key renamed from system_template:practice_facilitator to system_template:facilitator
	test("facilitator template resolves with non-empty content, no frontmatter (AD8c)", () => {
		const content = readSystemPromptTemplateForRole("facilitator");
		expect(content).toBeTruthy();
		expect((content ?? "").length).toBeGreaterThan(50);
		expect(content).not.toMatch(/^---/);
	});

	// @lore AD8c: old role name must not resolve after rename
	test("practice_facilitator does NOT resolve (AD8c renamed)", () => {
		expect(readSystemPromptTemplateForRole("practice_facilitator")).toBeNull();
	});

	// @lore AD8a: chief_of_staff system prompt deleted — docs/system-prompts/chief-of-staff.md removed.
	// AD8b adds assistant.md but the map deliberately excludes "assistant" (bootstrap never
	// seeded it, so the route stays 404 — see system-prompt-templates.ts).
	test("chief_of_staff does NOT resolve (AD8a: system prompt deleted)", () => {
		expect(readSystemPromptTemplateForRole("chief_of_staff")).toBeNull();
	});

	test("product_manager template content contains recognizable persona content", () => {
		const content = readSystemPromptTemplateForRole("product_manager") ?? "";
		expect(content).toMatch(/#|You are|Product Manager|PM/i);
	});

	test("the canonical map exposes exactly 7 roles (facilitator, product_manager, builder, growth, designer, qa_engineer, ops)", () => {
		expect(Object.keys(SYSTEM_PROMPT_TEMPLATE_FILES).sort()).toEqual(
			[
				"builder",
				"designer",
				"facilitator",
				"growth",
				"ops",
				"product_manager",
				"qa_engineer",
			].sort(),
		);
	});

	// AB0: builder and growth now have templates (docs/system-prompts/builder.md, docs/system-prompts/growth.md added)
	test("builder template resolves (AB0 added docs/system-prompts/builder.md)", () => {
		expect(readSystemPromptTemplateForRole("builder")).not.toBeNull();
	});

	test("growth template resolves (AB0 added docs/system-prompts/growth.md)", () => {
		expect(readSystemPromptTemplateForRole("growth")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-3: Existing seed agents backfilled with systemPrompt
// ---------------------------------------------------------------------------

describe("X3 AC-3: existing agents backfilled with systemPrompt from role template", () => {
	test("demo-agent-pm has systemPrompt matching product_manager template", async ({ db }) => {
		await seed(db);

		const agentRows = await queryRows<{ systemPrompt: string | null }>(
			db,
			`SELECT system_prompt AS "systemPrompt" FROM users WHERE id = 'demo-agent-pm'`,
		);
		const template = readSystemPromptTemplateForRole("product_manager");

		expect(agentRows[0]?.systemPrompt).toBeTruthy();
		expect(agentRows[0]?.systemPrompt).toBe(template);
	});

	// @lore AD8a: seed-agent-cos system prompt file deleted. systemPrompt is null until AD8b adds assistant.md.
	test("seed-agent-cos has null systemPrompt (AD8a: system prompt deleted)", async ({ db }) => {
		await seed(db);

		const agentRows = await queryRows<{ systemPrompt: string | null }>(
			db,
			`SELECT system_prompt AS "systemPrompt" FROM users WHERE id = 'seed-agent-cos'`,
		);

		expect(agentRows[0]?.systemPrompt).toBeNull();
	});

	// @lore AD8c: role renamed from practice_facilitator to facilitator; template key renamed accordingly.
	test("facilitator agents have systemPrompt matching facilitator template (AD8c)", async ({
		db,
	}) => {
		await seed(db);

		const agentRows = await queryRows<{ id: string; systemPrompt: string | null }>(
			db,
			`SELECT id, system_prompt AS "systemPrompt" FROM users WHERE role = 'facilitator'`,
		);
		const template = readSystemPromptTemplateForRole("facilitator");

		expect(agentRows.length).toBeGreaterThanOrEqual(1);
		for (const agent of agentRows) {
			expect(agent.systemPrompt, `${agent.id} should have systemPrompt set`).toBeTruthy();
			expect(agent.systemPrompt).toBe(template);
		}
	});

	// AB0: builder now has a template (docs/system-prompts/builder.md added)
	// @lore AF17: renamed from seed-agent-builder (pre-purge) to demo-agent-builder.
	test("demo-agent-builder has systemPrompt matching builder template", async ({ db }) => {
		await seed(db);

		const agentRows = await queryRows<{ systemPrompt: string | null }>(
			db,
			`SELECT system_prompt AS "systemPrompt" FROM users WHERE id = 'demo-agent-builder'`,
		);
		const template = readSystemPromptTemplateForRole("builder");

		expect(agentRows[0]?.systemPrompt).toBeTruthy();
		expect(agentRows[0]?.systemPrompt).toBe(template);
	});

	test("system:propagation has null systemPrompt (system role, no template)", async ({ db }) => {
		await seed(db);

		const rows = await queryRows<{ systemPrompt: string | null }>(
			db,
			`SELECT system_prompt AS "systemPrompt" FROM users WHERE id = 'system:propagation'`,
		);
		expect(rows[0]?.systemPrompt).toBeNull();
	});
});
