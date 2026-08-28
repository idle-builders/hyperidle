/**
 * X3 AC-3 — Existing seed agents backfilled with systemPrompt from role template.
 *
 * @lore AU26 G1 (architecture §D-L): asserts the same outcome against the
 * `agent_run_config` home the six run-config columns relocated to.
 *
 * @lore AU29: relocated verbatim from `framework/db/src/__tests__/X3-agent-
 * config.integration.test.ts` (task D) — it exercises the composed bootstrap
 * (`applyFactoryBootstrap` → `runFactoryBootstrap`), which now lives here
 * alongside `factory-bootstrap-runner.ts` and `demo-fixture.ts`.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { readSystemPromptTemplateForRole } from "@hyperidle/org";
import { sql } from "drizzle-orm";
import { seedDemoWorld } from "../demo-fixture.js";
import { runFactoryBootstrap } from "../factory-bootstrap-runner.js";

async function queryRows<T extends Record<string, unknown>>(
	db: HyperIdleDb,
	query: string,
): Promise<T[]> {
	const result = await db.execute(sql.raw(query));
	return (result as { rows: T[] }).rows;
}

describe("X3 AC-3: existing agents backfilled with systemPrompt from role template", () => {
	test("demo-agent-pm has systemPrompt matching product_manager template", async ({ db }) => {
		await runFactoryBootstrap(db);
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
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const agentRows = await queryRows<{ systemPrompt: string | null }>(
			db,
			`SELECT system_prompt AS "systemPrompt" FROM agent_run_config WHERE agent_user_id = 'seed-agent-cos'`,
		);

		expect(agentRows[0]?.systemPrompt).toBeNull();
	});

	// @lore BA9d: factory no longer seeds seed-agent-pf-* facilitator agents —
	// they are now plugin-provided. Neither runFactoryBootstrap nor seedDemoWorld
	// creates any facilitator-role user row, so there is nothing to backfill.
	// This test proves that 0 facilitator rows exist after bootstrap + demo seed,
	// ensuring no stale pf-* seeding silently crept back in.
	test("no facilitator agents exist after bootstrap + demo seed (BA9d: plugin-provided)", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const agentRows = await queryRows<{ id: string; systemPrompt: string | null }>(
			db,
			`SELECT u.id, c.system_prompt AS "systemPrompt" FROM users u
         JOIN agent_run_config c ON c.agent_user_id = u.id
        WHERE u.role = 'facilitator'`,
		);

		// facilitator template file still exists on disk (readSystemPromptTemplateForRole
		// should still return non-null for the role) — the template is used by the plugin.
		const template = readSystemPromptTemplateForRole("facilitator");
		expect(template).toBeTruthy();

		// No facilitator agents should exist in the seeded world (plugin provides them).
		expect(agentRows.length).toBe(0);
	});

	// AB0: builder now has a template (docs/system-prompts/builder.md added)
	// @lore AF17: renamed from seed-agent-builder (pre-purge) to demo-agent-builder.
	test("demo-agent-builder has systemPrompt matching builder template", async ({ db }) => {
		await runFactoryBootstrap(db);
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
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const rows = await queryRows<{ systemPrompt: string | null }>(
			db,
			`SELECT system_prompt AS "systemPrompt" FROM agent_run_config WHERE agent_user_id = 'system:propagation'`,
		);
		expect(rows[0]?.systemPrompt ?? null).toBeNull();
	});
});
