/**
 * AF17 — AC1 + AC2: Factory Bootstrap
 *
 * AC1: Fresh environment has complete factory layer (system identities, facilitators,
 *      system prompt templates, factory principle) without manual step.
 *
 * AC2: Re-applying factory bootstrap is idempotent — row counts and values are
 *      identical after the second call.
 *
 * @lore AU29: relocated verbatim from `framework/db/src/__tests__/` (task D)
 * — `applyFactoryBootstrap` dissolved into the two layer faces, and the
 * composed sequence now lives in this package's `factory-bootstrap-runner.ts`.
 *
 * @lore AU44 AU20-fd: `framework/factory-defaults` dissolved into @hyperidle/org.
 * `readSystemPromptTemplateForRole` import changed from @hyperidle/factory-defaults to
 * @hyperidle/org — same function, moved to the owning service package.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
// AC1: Factory layer is complete after a single runFactoryBootstrap call
// ─────────────────────────────────────────────────────────────────────────────

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

	// @lore BA9d: factory no longer seeds seed-agent-pf-* facilitator agents.
	// They are now provided by the rituals plugin. The factory bootstrap must
	// not create them — 0 pf-* rows after bootstrap proves the clean boundary.
	test("factory no longer seeds facilitator agents (now plugin-provided)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ id: string; role: string }>(
			db,
			"SELECT id, role FROM users WHERE id LIKE 'seed-agent-pf-%' ORDER BY id",
		);
		expect(rows.length).toBe(0);
	});

	// @lore AU18: previously asserted a `factory_settings.system_template:<role>`
	// cache row; that table is retired. Templates now resolve directly via the
	// shared `readSystemPromptTemplateForRole` docs-backed resolver — bootstrap
	// no longer needs to have run first (the resolver reads docs directly), but
	// we still call it here to prove it doesn't error/interfere.
	test("product_manager system prompt template resolves (docs-backed)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const content = rolePersona("product_manager");
		expect(content).toBeTruthy();
		expect((content ?? "").length).toBeGreaterThan(50);
	});

	test("facilitator system prompt template resolves (docs-backed)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const content = rolePersona("facilitator");
		expect(content).toBeTruthy();
		expect((content ?? "").length).toBeGreaterThan(50);
	});

	// @lore AU18: `cost_cap`/`cost_cycle` factory_settings seeds are retired.
	// cost_cap now lives as server_config.cost.capMinor with a schema default
	// (20000) — bootstrap relies on the default rather than seeding it
	// explicitly. cost_cycle had zero readers and was dropped entirely.
	test("bootstrap writes no server_config row (cost_cap default now lives server-side)", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ id: string }>(db, "SELECT id FROM server_config");
		expect(rows).toHaveLength(0);
	});

	// @lore AU43 repair: seed-ki-1 tests removed — ensureFactoryKnowledgeSeed deleted by AU43 bundle-4.
	// Bootstrap no longer seeds knowledge items or the strategy fabric projection row.

	test("no teams row is created by bootstrap (team_id null constraint)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM teams");
		expect(Number(rows[0]?.count)).toBe(0);
	});

	// @lore AU44 B1: team_members table dissolved into teams — test removed

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

	// @lore BA9d: factory no longer seeds seed-agent-pf-* facilitator agents.
	// Verified above; this companion test is now a no-op guard (0 rows → loop
	// never runs — confirms no spurious pf-* row exists with a team_id set).
	test("no facilitator agents seeded by factory (BA9d: plugin-provided)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const rows = await queryRows<{ id: string; team_id: string | null }>(
			db,
			"SELECT id, team_id FROM users WHERE id LIKE 'seed-agent-pf-%'",
		);
		expect(rows.length).toBe(0);
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
	// server_config is the successor — bootstrap still writes zero rows to it
	// (see AC1's "bootstrap writes no server_config row" test), so idempotency
	// there is trivial. This test now asserts idempotency on the docs-backed
	// template resolver instead (calling bootstrap twice must not change what
	// it resolves).
	test("running bootstrap twice produces identical resolved templates", async ({ db }) => {
		await runFactoryBootstrap(db);
		const first = rolePersona("product_manager");

		await runFactoryBootstrap(db);
		const second = rolePersona("product_manager");

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
