/**
 * X3 AC-3 — Seeded agents get their role's persona as their identity document.
 *
 * @lore BA9f: the persona left `agent_run_config` for an `agent_file` knowledge
 * document bound to the agent. The claim is unchanged — a seeded agent carries
 * its role template as its persona — only where that text lives has moved.
 *
 * @lore AU26 G1 (architecture §D-L): asserts the same outcome against the
 * `agent_run_config` home the six run-config columns relocated to.
 *
 * @lore AU29: relocated verbatim from `framework/db/src/__tests__/X3-agent-
 * config.integration.test.ts` (task D) — it exercises the composed bootstrap
 * (`applyFactoryBootstrap` → `runFactoryBootstrap`), which now lives here
 * alongside `factory-bootstrap-runner.ts` and `demo-fixture.ts`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
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

/** The persona of an agent: the `agent_file` document bound to it. */
async function readIdentity(db: HyperIdleDb, agentId: string): Promise<string | null> {
	const rows = await queryRows<{ body: string | null }>(
		db,
		`SELECT body FROM knowledge_items
      WHERE role = 'agent_file' AND scope_kind = 'user' AND scope_id = '${agentId}'
        AND status = 'active'`,
	);
	return rows[0]?.body ?? null;
}

/**
 * The persona the `role-personas` plugin ships for a role.
 *
 * @lore BA9g: these were `docs/system-prompts/*.md`, read by the runtime through
 * `readSystemPromptTemplateForRole`. That reader is deleted — HyperIdle ships a
 * single agent with a bare AGENTS.md and holds no built-in idea of a "builder".
 * The demo world is what a team looks like once the plugin is installed, so the
 * fixture and these tests read the plugin's own files.
 */
function rolePersona(role: string): string | null {
	const files: Readonly<Record<string, string>> = {
		builder: "builder.md",
		designer: "designer.md",
		facilitator: "facilitator.md",
		growth: "growth.md",
		ops: "ops.md",
		product_manager: "product-manager.md",
		qa_engineer: "qa-engineer.md",
	};
	const filename = files[role];
	if (!filename) return null;
	try {
		return readFileSync(resolve("plugins/role-personas/personas", filename), "utf-8");
	} catch {
		return null;
	}
}

describe("X3 AC-3: seeded agents carry their role's persona as an identity document", () => {
	test("demo-agent-pm's identity matches the product_manager template", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const identity = await readIdentity(db, "demo-agent-pm");
		expect(identity).toBeTruthy();
		expect(identity).toBe(rolePersona("product_manager"));
	});

	// @lore AD8a: seed-agent-cos system prompt file deleted. systemPrompt is null until AD8b adds assistant.md.
	test("seed-agent-cos has no identity (AD8a: system prompt deleted)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		expect(await readIdentity(db, "seed-agent-cos")).toBeNull();
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

		const agentRows = await queryRows<{ id: string }>(
			db,
			`SELECT u.id FROM users u WHERE u.role = 'facilitator'`,
		);

		// facilitator template file still exists on disk (readSystemPromptTemplateForRole
		// should still return non-null for the role) — the template is used by the plugin.
		const template = rolePersona("facilitator");
		expect(template).toBeTruthy();

		// No facilitator agents should exist in the seeded world (plugin provides them).
		expect(agentRows.length).toBe(0);
	});

	// AB0: builder now has a template (docs/system-prompts/builder.md added)
	// @lore AF17: renamed from seed-agent-builder (pre-purge) to demo-agent-builder.
	test("demo-agent-builder's identity matches the builder template", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const identity = await readIdentity(db, "demo-agent-builder");
		expect(identity).toBeTruthy();
		expect(identity).toBe(rolePersona("builder"));
	});

	// An agent with no role template gets no identity document — absent, not empty.
	test("system:propagation has no persona (system role, no template)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		expect(await readIdentity(db, "system:propagation")).toBeNull();
	});
});
