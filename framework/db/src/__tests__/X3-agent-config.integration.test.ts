/**
 * X3 — Agent Configuration: DB migration + seed tests
 *
 * AC-1: the agent run config carries systemPrompt, harnessType, modelTierPreference
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
 *
 * @lore AU26 G1 (architecture §D-L): AC-1 and AC-3 asserted these three columns
 * on `users`. They relocated to `agent_run_config` (owned by
 * `layers/agent-orchestration/agent-run-config`) — `users` is the identity
 * record, run config is agent-execution configuration. Every assertion below is
 * the SAME assertion against the new home: same nullability, same null
 * semantics, same role-template backfill, same agents. AC-1's insert cases now
 * also prove the FK-and-default shape of the new table (an `agent_run_config`
 * row requires its `users` row; `max_concurrent_sessions` defaults to 1).
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";
import { seedDemoWorld } from "../demo-fixture.js";
import { applyFactoryBootstrap } from "../factory-bootstrap.js";
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

describe("X3 AC-1: agent run config carries systemPrompt, harnessType, modelTierPreference", () => {
	test("system_prompt column exists on agent_run_config and is nullable", async ({ db }) => {
		const rows = await queryRows<{
			columnName: string;
			isNullable: string;
			dataType: string;
		}>(
			db,
			`SELECT column_name AS "columnName", is_nullable AS "isNullable", data_type AS "dataType"
       FROM information_schema.columns
       WHERE table_name = 'agent_run_config' AND table_schema = 'public'
       AND column_name = 'system_prompt'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.columnName).toBe("system_prompt");
		expect(rows[0]?.isNullable).toBe("YES");
		expect(rows[0]?.dataType).toBe("text");
	});

	test("harness_type column exists on agent_run_config and is nullable", async ({ db }) => {
		const rows = await queryRows<{
			columnName: string;
			isNullable: string;
			dataType: string;
		}>(
			db,
			`SELECT column_name AS "columnName", is_nullable AS "isNullable", data_type AS "dataType"
       FROM information_schema.columns
       WHERE table_name = 'agent_run_config' AND table_schema = 'public'
       AND column_name = 'harness_type'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.columnName).toBe("harness_type");
		expect(rows[0]?.isNullable).toBe("YES");
		expect(rows[0]?.dataType).toBe("text");
	});

	test("model_tier_preference column exists on agent_run_config and is nullable", async ({
		db,
	}) => {
		const rows = await queryRows<{
			columnName: string;
			isNullable: string;
			dataType: string;
		}>(
			db,
			`SELECT column_name AS "columnName", is_nullable AS "isNullable", data_type AS "dataType"
       FROM information_schema.columns
       WHERE table_name = 'agent_run_config' AND table_schema = 'public'
       AND column_name = 'model_tier_preference'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.columnName).toBe("model_tier_preference");
		expect(rows[0]?.isNullable).toBe("YES");
		expect(rows[0]?.dataType).toBe("text");
	});

	test("can insert a run-config row with all three columns null (null semantics work)", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.execute(
			sql.raw(`
      INSERT INTO users (id, kind, name, role, status, created_at)
      VALUES ('x3-test-agent-null-cols', 'ai', 'Test Agent', 'builder', 'active', '${now}')
    `),
		);
		await db.execute(
			sql.raw(`INSERT INTO agent_run_config (agent_user_id) VALUES ('x3-test-agent-null-cols')`),
		);

		const rows = await queryRows<{
			id: string;
			systemPrompt: string | null;
			harnessType: string | null;
			modelTierPreference: string | null;
			maxConcurrentSessions: number;
		}>(
			db,
			`SELECT agent_user_id AS "id", system_prompt AS "systemPrompt", harness_type AS "harnessType",
              model_tier_preference AS "modelTierPreference",
              max_concurrent_sessions AS "maxConcurrentSessions"
       FROM agent_run_config WHERE agent_user_id = 'x3-test-agent-null-cols'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.systemPrompt).toBeNull();
		expect(rows[0]?.harnessType).toBeNull();
		expect(rows[0]?.modelTierPreference).toBeNull();
		// @lore AU26 G1: the one NOT NULL DEFAULT 1 column — its exact pre-move shape on `users`.
		expect(Number(rows[0]?.maxConcurrentSessions)).toBe(1);
	});

	test("can insert a run-config row with systemPrompt, harnessType, modelTierPreference set", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.execute(
			sql.raw(`
      INSERT INTO users (id, kind, name, role, status, created_at)
      VALUES ('x3-test-agent-full-cols', 'ai', 'Full Bot', 'builder', 'active', '${now}')
    `),
		);
		await db.execute(
			sql.raw(`
      INSERT INTO agent_run_config (agent_user_id, system_prompt, harness_type, model_tier_preference)
      VALUES ('x3-test-agent-full-cols', 'You are a builder.', 'claude-code', 'reasoning')
    `),
		);

		const rows = await queryRows<{
			systemPrompt: string | null;
			harnessType: string | null;
			modelTierPreference: string | null;
		}>(
			db,
			`SELECT system_prompt AS "systemPrompt", harness_type AS "harnessType", model_tier_preference AS "modelTierPreference"
       FROM agent_run_config WHERE agent_user_id = 'x3-test-agent-full-cols'`,
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
		await applyFactoryBootstrap(db);
		await seedDemoWorld(db);

		const agentRows = await queryRows<{ systemPrompt: string | null }>(
			db,
			`SELECT system_prompt AS "systemPrompt" FROM agent_run_config WHERE agent_user_id = 'demo-agent-pm'`,
		);
		const template = readSystemPromptTemplateForRole("product_manager");

		expect(agentRows[0]?.systemPrompt).toBeTruthy();
		expect(agentRows[0]?.systemPrompt).toBe(template);
	});

	// @lore AD8a: seed-agent-cos system prompt file deleted. systemPrompt is null until AD8b adds assistant.md.
	test("seed-agent-cos has null systemPrompt (AD8a: system prompt deleted)", async ({ db }) => {
		await applyFactoryBootstrap(db);
		await seedDemoWorld(db);

		const agentRows = await queryRows<{ systemPrompt: string | null }>(
			db,
			`SELECT system_prompt AS "systemPrompt" FROM agent_run_config WHERE agent_user_id = 'seed-agent-cos'`,
		);

		expect(agentRows[0]?.systemPrompt).toBeNull();
	});

	// @lore AD8c: role renamed from practice_facilitator to facilitator; template key renamed accordingly.
	test("facilitator agents have systemPrompt matching facilitator template (AD8c)", async ({
		db,
	}) => {
		await applyFactoryBootstrap(db);
		await seedDemoWorld(db);

		const agentRows = await queryRows<{ id: string; systemPrompt: string | null }>(
			db,
			`SELECT u.id, c.system_prompt AS "systemPrompt" FROM users u
         JOIN agent_run_config c ON c.agent_user_id = u.id
        WHERE u.role = 'facilitator'`,
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
		await applyFactoryBootstrap(db);
		await seedDemoWorld(db);

		const agentRows = await queryRows<{ systemPrompt: string | null }>(
			db,
			`SELECT system_prompt AS "systemPrompt" FROM agent_run_config WHERE agent_user_id = 'demo-agent-builder'`,
		);
		const template = readSystemPromptTemplateForRole("builder");

		expect(agentRows[0]?.systemPrompt).toBeTruthy();
		expect(agentRows[0]?.systemPrompt).toBe(template);
	});

	// @lore AU26 G1: absent row ≡ all-null row. `system:propagation` is a system
	// infra row that never had run config written, so after the move it has no
	// `agent_run_config` row at all — which `readAgentRunConfig` resolves to the
	// same all-null config the pre-move null columns resolved to. Asserting
	// "no row OR a row with null system_prompt" keeps the original meaning
	// (no persona for the system role) without hard-coding either storage state.
	test("system:propagation has no persona (system role, no template)", async ({ db }) => {
		await applyFactoryBootstrap(db);
		await seedDemoWorld(db);

		const rows = await queryRows<{ systemPrompt: string | null }>(
			db,
			`SELECT system_prompt AS "systemPrompt" FROM agent_run_config WHERE agent_user_id = 'system:propagation'`,
		);
		expect(rows[0]?.systemPrompt ?? null).toBeNull();
	});
});
