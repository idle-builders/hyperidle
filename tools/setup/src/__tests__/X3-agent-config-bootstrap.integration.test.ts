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
 *
 * @lore AU44 AU20-fd: `framework/factory-defaults` dissolved. Facilitator agent
 * assertions removed (moved to plugin, AU20 Ruling 3). `readSystemPromptTemplateForRole`
 * imported from `@hyperidle/org` (new home). Core no longer seeds facilitator agents,
 * so the "facilitator agents have systemPrompt matching facilitator template" test is removed.
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
	// same all-null config the pre-move null columns resolved to.
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
