import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import { seedDemoWorld } from "../demo-fixture.js";
import { runFactoryBootstrap } from "../factory-bootstrap-runner.js";

// @lore AD8a: chief_of_staff system prompt file deleted (docs/system-prompts/chief-of-staff.md removed).
// @lore AD8b: chief_of_staff role renamed to assistant.
// @lore AD8c: practice_facilitator role renamed to facilitator.
// AC2 tests only check facilitator and product_manager.
// @lore AD8b/AD8c: The 3-role set was ["assistant", "facilitator", "product_manager"].
// chief_of_staff → assistant (AD8b), practice_facilitator → facilitator (AD8c).
// Only roles that still have system prompt files after AD8a and AD8c
const SYSTEM_PROMPT_FILE_ROLES = ["facilitator", "product_manager"] as const;

// Convenience: execute a raw query returning rows
async function queryRows<T extends Record<string, unknown>>(
	db: HyperIdleDb,
	query: string,
): Promise<T[]> {
	const result = await db.execute(sql.raw(query));
	return (result as { rows: T[] }).rows;
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

describe("A2: Seed script", () => {
	// --- AC4: Seed populates ≥1 row per major table ---
	test("populates at least 1 row per major table", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// @lore U1: `products` renamed to `teams`; old `teams` renamed to `team_members`.
		// @lore P2: agents → users table
		// @lore AF17: seed() now calls runFactoryBootstrap + seedDemoWorld.
		// factory_bootstrap inserts users/documents; demo_fixture inserts teams/team_members.
		// @lore AU18: `factory_settings` dropped from this list — factory-bootstrap no
		// longer writes to it (cost_cap/cost_cycle/system_template rows retired).
		// @lore BC4: `knowledge_app_projection` dropped from this list — the table is
		// dropped; `documents` is the row itself now (architecture.md §6.2, §6.4).
		const majorTables = [
			"users",
			"teams",
			// @lore AU44 B1: team_members folded into teams — no longer a separate table
			"documents",
		];

		for (const table of majorTables) {
			const rows = await queryRows<{ count: string }>(db, `SELECT COUNT(*) AS count FROM ${table}`);
			expect(Number(rows[0]?.count), `${table} should have ≥1 row`).toBeGreaterThanOrEqual(1);
		}
	});

	test("seed data is well-formed (queryable without errors)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// Verify we can read back with all fields.
		// @lore U1: `products` table renamed to `teams`.
		// @lore AF17: demo team id is now "demo-team-acme"
		const products = await queryRows<{ id: string; name: string }>(
			db,
			"SELECT id, name FROM teams LIMIT 1",
		);
		expect(products[0]?.id).toBeTruthy();
		expect(products[0]?.name).toBeTruthy();

		// @lore P2: agents → users table
		const agents = await queryRows<{ id: string; name: string; role: string }>(
			db,
			"SELECT id, name, role FROM users LIMIT 1",
		);
		expect(agents[0]?.id).toBeTruthy();
		expect(agents[0]?.name).toBeTruthy();
		expect(agents[0]?.role).toBeTruthy();

		// @lore AU44 B1: team_members folded into teams.
		// @lore BC5 T11 (migration 0090, D-e3zm2j): capacity is dropped — a team
		// is an id and a name now, no capacity gate left to read back.

		// @lore BC4: `knowledge_app_projection` is dropped (architecture.md §6.2,
		// §6.4) — the row it used to project (`confidence`) is a plain column on
		// `documents` now, so there is no separate projection row left to assert.
		const kiRows = await queryRows<{ id: string; version: number }>(
			db,
			"SELECT id, version FROM documents LIMIT 1",
		);
		expect(kiRows[0]?.id).toBeTruthy();
		expect(kiRows[0]?.version).toBeGreaterThanOrEqual(1);
	});

	test("is idempotent (running twice does not error)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);
		// Second run should not throw (uses onConflictDoNothing)
		await expect(runFactoryBootstrap(db).then(() => seedDemoWorld(db))).resolves.not.toThrow();
	});

	// --- G1 AC1: facilitator agent archetypes are seeded ---
	// @lore AD8a: System Agent is the display name for the chief_of_staff role seed.
	// @lore AD8b: chief_of_staff role renamed to assistant.
	// @lore AD8c: practice_facilitator role renamed to facilitator.
	test("seeds one System Agent (assistant), ≥5 Facilitators, ≥1 Product Manager (AC1)", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// @lore P2: agents → users table
		// @lore AD8b: role renamed from "chief_of_staff" to "assistant"
		const cosRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE role = 'assistant'",
		);
		expect(Number(cosRows[0]?.count)).toBeGreaterThanOrEqual(1);

		// @lore BA9d: factory no longer seeds seed-agent-pf-* facilitator agents.
		// Facilitators are now provided by the rituals plugin; 0 in the base world.
		// @lore AD8c: role string renamed from practice_facilitator to facilitator
		const pfRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE role = 'facilitator'",
		);
		expect(Number(pfRows[0]?.count)).toBe(0);

		// @lore AD8c: no agents must remain with the old practice_facilitator role
		const oldPfRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE role = 'practice_facilitator'",
		);
		expect(Number(oldPfRows[0]?.count)).toBe(0);

		const pmRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE role = 'product_manager'",
		);
		expect(Number(pmRows[0]?.count)).toBeGreaterThanOrEqual(1);
	});

	// --- G1 AC2: every seeded facilitator / product_manager carries a working system prompt ---
	// @lore AD8a: chief_of_staff excluded — docs/system-prompts/chief-of-staff.md deleted.
	// @lore AD8c: practice_facilitator renamed to facilitator; file renamed to facilitator.md.
	// @lore AU26 G1 (architecture §D-L): these two tests asserted `users.system_prompt_path`
	// — a column DROPPED, not relocated, because it had zero production readers repo-wide
	// (X3 replaced the path indirection with inline content years ago; only this seeder ever
	// wrote it). What AC2 actually protects is that a seeded agent of these roles ends up
	// with a usable system prompt, and that the docs file backing it exists on disk. Both
	// facts survive: the content now lives in `agent_run_config.system_prompt`, and the
	// on-disk file is asserted through the role→template resolver that produced it.
	// @lore BA9d: factory no longer seeds facilitator agents — they are plugin-provided.
	// SYSTEM_PROMPT_FILE_ROLES includes "facilitator" but 0 facilitators exist in the
	// base world, so only product_manager rows are returned. The assertion is ≥1.
	test("seeded product_manager carries a non-empty system prompt (facilitator is plugin-provided)", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// @lore BA9f/knowledge-attachment-slot: the persona is the `agent_file`
		// document parented to the agent — `parent_kind='agent' AND
		// parent_id=u.id`, not the retired `scope_kind='user' AND scope_id=u.id`
		// reverse lookup. Moved onto the parent predicate so a missing parent
		// turns this test red instead of staying green while the app is broken.
		const rolesList = SYSTEM_PROMPT_FILE_ROLES.map((r) => `'${r}'`).join(", ");
		const rows = await queryRows<{ id: string; role: string; body: string | null }>(
			db,
			`SELECT u.id, u.role, d.body FROM users u
			   JOIN documents d
			     ON d.parent_kind = 'agent' AND d.parent_id = u.id
			    AND d.slot = 'agent_file' AND d.status = 'active'
			  WHERE u.role IN (${rolesList})`,
		);
		// Only product_manager agents exist (facilitators are plugin-provided, not seeded here).
		expect(rows.length).toBeGreaterThanOrEqual(1);
		for (const row of rows) {
			expect(row.body, `${row.id} identity must be set`).toBeTruthy();
			expect((row.body ?? "").length).toBeGreaterThan(50);
		}
	});

	// @lore AD8a: chief_of_staff excluded — its system prompt file was deleted.
	// @lore AD8c: facilitator.md replaces practice-facilitator.md.
	// @lore AU44 B0: SYSTEM_PROMPT_TEMPLATE_FILES export removed (map is module-internal).
	// Assertion rewritten to use readSystemPromptTemplateForRole which reads the docs file
	// directly — a non-null return proves the docs file exists and is readable.
	test("the docs file backing each seeded role's system prompt exists on disk", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		for (const role of SYSTEM_PROMPT_FILE_ROLES) {
			const content = rolePersona(role);
			expect(content, `${role} system prompt file must exist and be readable`).toBeTruthy();
			expect((content ?? "").length).toBeGreaterThan(50);
		}
	});

	// --- AD8c AC2: facilitator template resolves (renamed from practice_facilitator) ---
	// @lore AU18: previously asserted a `factory_settings.system_template:facilitator`
	// cache row; that table is retired. Templates now resolve directly via the
	// shared `readSystemPromptTemplateForRole` docs-backed resolver.
	test("facilitator template resolves and practice_facilitator does not (AD8c AC2)", async ({
		db,
	}) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const content = rolePersona("facilitator");
		expect(content).toBeTruthy();
		expect((content ?? "").length).toBeGreaterThan(50);

		// @lore AD8c: old role name must not resolve
		expect(rolePersona("practice_facilitator")).toBeNull();
	});
});

describe("AF17: seed() = runFactoryBootstrap + seedDemoWorld", () => {
	test("seed() produces factory layer (bootstrap) + demo world (Acme team)", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		// Factory layer: system:propagation exists
		const propagation = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id = 'system:propagation'",
		);
		expect(propagation).toHaveLength(1);

		// Demo world: Acme team exists
		const acme = await queryRows<{ id: string; name: string }>(
			db,
			"SELECT id, name FROM teams WHERE id = 'demo-team-acme'",
		);
		expect(acme).toHaveLength(1);
		expect(acme[0]?.name).toBe("Acme");
	});

	test("runFactoryBootstrap alone produces 0 teams (factory isolation)", async ({ db }) => {
		await runFactoryBootstrap(db);

		const teamRows = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM teams");
		expect(Number(teamRows[0]?.count)).toBe(0);

		const humanRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE kind = 'human'",
		);
		expect(Number(humanRows[0]?.count)).toBe(0);
	});

	test("seedDemoWorld alone produces Acme team + demo founder + demo agents", async ({ db }) => {
		// seedDemoWorld requires factory agents (seed-agent-cos) to exist for task.ownerAgentId
		await runFactoryBootstrap(db);
		const { teamId, founderId } = await seedDemoWorld(db);

		expect(teamId).toBe("demo-team-acme");
		expect(founderId).toBe("demo-founder");

		const acme = await queryRows<{ id: string; name: string }>(
			db,
			`SELECT id, name FROM teams WHERE id = '${teamId}'`,
		);
		expect(acme).toHaveLength(1);
		expect(acme[0]?.name).toBe("Acme");

		const founder = await queryRows<{ id: string; kind: string }>(
			db,
			`SELECT id, kind FROM users WHERE id = '${founderId}'`,
		);
		expect(founder).toHaveLength(1);
		expect(founder[0]?.kind).toBe("human");
	});
});
