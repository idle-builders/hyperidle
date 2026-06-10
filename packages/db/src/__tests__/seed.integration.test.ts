import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";
import { seed } from "../seed.js";

// @lore AD8a: chief_of_staff soul file deleted (docs/souls/chief-of-staff.md removed).
// @lore AD8b: chief_of_staff role renamed to assistant.
// @lore AD8c: practice_facilitator role renamed to facilitator.
// AC2 tests only check facilitator and product_manager for soul_prompt_path.
// @lore AD8b/AD8c: The 3-role set was ["assistant", "facilitator", "product_manager"].
// chief_of_staff → assistant (AD8b), practice_facilitator → facilitator (AD8c).
// Only roles that still have soul files after AD8a and AD8c
const SOUL_FILE_ROLES = ["facilitator", "product_manager"] as const;

/** Resolve the repo root from this test file's location. */
function repoRoot(): string {
	// __dirname at runtime = packages/db/src/__tests__ (after build relative to src)
	return path.resolve(__dirname, "..", "..", "..", "..");
}

// Convenience: execute a raw query returning rows
async function queryRows<T extends Record<string, unknown>>(
	db: HyperIdleDb,
	query: string,
): Promise<T[]> {
	const result = await db.execute(sql.raw(query));
	return (result as { rows: T[] }).rows;
}

describe("A2: Seed script", () => {
	// --- AC4: Seed populates ≥1 row per major table ---
	test("populates at least 1 row per major table", async ({ db }) => {
		await seed(db);

		// @lore U1: `products` renamed to `teams`; old `teams` renamed to `team_members`.
		// @lore P2: agents → users table
		const majorTables = ["users", "teams", "team_members", "knowledge_items", "factory_settings"];

		for (const table of majorTables) {
			const rows = await queryRows<{ count: string }>(db, `SELECT COUNT(*) AS count FROM ${table}`);
			expect(Number(rows[0]?.count), `${table} should have ≥1 row`).toBeGreaterThanOrEqual(1);
		}
	});

	test("seed data is well-formed (queryable without errors)", async ({ db }) => {
		await seed(db);

		// Verify we can read back with all fields.
		// @lore U1: `products` table renamed to `teams`.
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

		// @lore U1: old `teams` (agent membership) renamed to `team_members`.
		// `capacity` column lives on `team_members`, not on the new `teams`.
		const teamMembers = await queryRows<{ id: string; capacity: number }>(
			db,
			"SELECT id, capacity FROM team_members LIMIT 1",
		);
		expect(teamMembers[0]?.id).toBeTruthy();
		expect(teamMembers[0]?.capacity).toBeGreaterThan(0);

		// @lore O2: layer moved to knowledgeStrategyFabric; query via JOIN.
		const kiRows = await queryRows<{ id: string; version: number }>(
			db,
			"SELECT id, version FROM knowledge_items LIMIT 1",
		);
		expect(kiRows[0]?.id).toBeTruthy();
		expect(kiRows[0]?.version).toBeGreaterThanOrEqual(1);

		// Verify layer is accessible via the extension table
		const ksfRows = await queryRows<{ layer: string | null }>(
			db,
			`SELECT layer FROM knowledge_strategy_fabric WHERE knowledge_item_id = '${kiRows[0]?.id}'`,
		);
		expect(ksfRows[0]?.layer).toBeTruthy();
	});

	test("is idempotent (running twice does not error)", async ({ db }) => {
		await seed(db);
		// Second run should not throw (uses onConflictDoNothing)
		await expect(seed(db)).resolves.not.toThrow();
	});

	// --- G1 AC1: facilitator agent archetypes are seeded ---
	// @lore AD8a: System Agent is the display name for the chief_of_staff role seed.
	// @lore AD8b: chief_of_staff role renamed to assistant.
	// @lore AD8c: practice_facilitator role renamed to facilitator.
	test("seeds one System Agent (assistant), ≥5 Facilitators, ≥1 Product Manager (AC1)", async ({
		db,
	}) => {
		await seed(db);

		// @lore P2: agents → users table
		// @lore AD8b: role renamed from "chief_of_staff" to "assistant"
		const cosRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE role = 'assistant'",
		);
		expect(Number(cosRows[0]?.count)).toBeGreaterThanOrEqual(1);

		// @lore AD8c: role string renamed from practice_facilitator to facilitator
		const pfRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE role = 'facilitator'",
		);
		expect(Number(pfRows[0]?.count)).toBe(5);

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

	// --- G1 AC2: every facilitator with a soul file carries a non-empty soul_prompt_path ---
	// @lore AD8a: chief_of_staff excluded — docs/souls/chief-of-staff.md deleted; soulPromptPath is null.
	// @lore AD8c: practice_facilitator renamed to facilitator; soul file renamed to facilitator.md.
	test("seeded facilitator and product_manager have non-empty soul_prompt_path (AC2)", async ({
		db,
	}) => {
		await seed(db);

		const rolesList = SOUL_FILE_ROLES.map((r) => `'${r}'`).join(", ");
		// biome-ignore lint/style/useNamingConvention: raw SQL result uses snake_case column names
		const rows = await queryRows<{ id: string; role: string; soul_prompt_path: string | null }>(
			db,
			`SELECT id, role, soul_prompt_path FROM users WHERE role IN (${rolesList})`,
		);
		expect(rows.length).toBeGreaterThanOrEqual(2);
		for (const row of rows) {
			expect(row.soul_prompt_path, `${row.id} soul_prompt_path must be set`).toBeTruthy();
			expect(row.soul_prompt_path?.endsWith(".md")).toBe(true);
		}
	});

	// @lore AD8a: chief_of_staff excluded — its soul file was deleted.
	// @lore AD8c: facilitator.md replaces practice-facilitator.md.
	test("soul_prompt_path files exist on disk for facilitator and product_manager", async ({
		db,
	}) => {
		await seed(db);

		const rolesList = SOUL_FILE_ROLES.map((r) => `'${r}'`).join(", ");
		// biome-ignore lint/style/useNamingConvention: raw SQL result uses snake_case column names
		const rows = await queryRows<{ id: string; soul_prompt_path: string | null }>(
			db,
			`SELECT id, soul_prompt_path FROM users WHERE role IN (${rolesList})`,
		);
		expect(rows.length).toBeGreaterThanOrEqual(2);
		const root = repoRoot();
		for (const row of rows) {
			expect(row.soul_prompt_path).toBeTruthy();
			const resolved = path.resolve(root, row.soul_prompt_path ?? "");
			expect(
				fs.existsSync(resolved),
				`${row.id} soul_prompt_path must resolve to an existing file: ${resolved}`,
			).toBe(true);
		}
	});

	// --- G4 AC6: seed creates all 4 builtin routines (AD8c: cost-sentinel removed) ---
	// @lore AD8c: builtin:cost-sentinel removed from routines; it is now application code.
	test("seeds exactly 4 G4 builtin routines with correct triggers (G4 AC6 + AD8c)", async ({
		db,
	}) => {
		await seed(db);

		// @lore AD8c: cost-sentinel is no longer a routine row; there are now 4 builtins.
		const expectedIds = [
			"builtin:practice-meeting",
			"builtin:post-bet-retro",
			"builtin:portfolio-retro",
			"builtin:knowledge-decay",
		] as const;

		type RoutineRow = {
			id: string;
			// biome-ignore lint/style/useNamingConvention: raw SQL result uses snake_case
			trigger_type: string;
			// biome-ignore lint/style/useNamingConvention: raw SQL result uses snake_case
			trigger_config: string | null;
			// biome-ignore lint/style/useNamingConvention: raw SQL result uses snake_case
			owner_agent_id: string;
			active: boolean;
		};
		const rows = await queryRows<RoutineRow>(
			db,
			"SELECT id, trigger_type, trigger_config, owner_agent_id, active FROM routines WHERE id LIKE 'builtin:%' ORDER BY id",
		);

		// Exactly 4 builtin routines (cost-sentinel extracted to app code)
		expect(rows).toHaveLength(4);

		const byId = new Map(rows.map((r) => [r.id, r]));
		for (const id of expectedIds) {
			expect(byId.has(id), `routine ${id} must be seeded`).toBe(true);
			expect(byId.get(id)?.active).toBe(true);
			expect(byId.get(id)?.trigger_config).toBeTruthy();
		}

		// @lore AD8c: cost-sentinel must NOT be in the routines table
		expect(byId.has("builtin:cost-sentinel"), "cost-sentinel must NOT be seeded as a routine").toBe(
			false,
		);

		expect(byId.get("builtin:practice-meeting")?.trigger_type).toBe("calendar");
		expect(byId.get("builtin:post-bet-retro")?.trigger_type).toBe("event");
		expect(byId.get("builtin:portfolio-retro")?.trigger_type).toBe("calendar");
		expect(byId.get("builtin:knowledge-decay")?.trigger_type).toBe("calendar");
	});

	// --- G4 review MAJOR-3: pin the full builtin-routine spec so any drift
	//     between packages/db/src/seed.ts and
	//     packages/fabric/src/services/builtin-routines.ts BUILTIN_SPECS is
	//     caught by CI. If you change this test, mirror the change in both files.
	// @lore AD8c: cost-sentinel removed; knowledge-decay owner changed to seed-agent-pf-facilitation.
	// ---
	test("pins the full trigger_config, owner, skill, human_review, silent for every builtin (G4 drift guard + AD8c)", async ({
		db,
	}) => {
		await seed(db);

		interface BuiltinPin {
			readonly id: string;
			readonly triggerType: "heartbeat" | "calendar" | "event";
			readonly triggerConfig: Record<string, unknown>;
			readonly ownerAgentId: string;
			readonly skillId: string;
			readonly humanReview: boolean;
			readonly silent: boolean;
		}

		// @lore AD8c: cost-sentinel removed; knowledge-decay owner is now seed-agent-pf-facilitation.
		const expected: readonly BuiltinPin[] = [
			{
				id: "builtin:practice-meeting",
				triggerType: "calendar",
				triggerConfig: { cron: "0 10 * * MON" },
				ownerAgentId: "seed-agent-pf-facilitation",
				skillId: "practice_meeting",
				humanReview: false,
				silent: false,
			},
			{
				id: "builtin:post-bet-retro",
				triggerType: "event",
				triggerConfig: { eventType: "bet_state_changed" },
				ownerAgentId: "seed-agent-pm-nimmly",
				skillId: "bet_retro",
				humanReview: true,
				silent: false,
			},
			{
				id: "builtin:portfolio-retro",
				triggerType: "calendar",
				triggerConfig: { cron: "0 10 1-7 * MON" },
				ownerAgentId: "seed-agent-cos",
				skillId: "portfolio_retro",
				humanReview: true,
				silent: false,
			},
			{
				id: "builtin:knowledge-decay",
				triggerType: "calendar",
				triggerConfig: { cron: "0 2 * * *" },
				// @lore AD8c: knowledge-decay ownership transferred from seed-agent-cos to seed-agent-pf-facilitation
				ownerAgentId: "seed-agent-pf-facilitation",
				skillId: "knowledge_decay",
				humanReview: false,
				silent: true,
			},
		];

		type RoutineDetailRow = {
			id: string;
			// biome-ignore lint/style/useNamingConvention: raw SQL result uses snake_case
			trigger_type: string;
			// biome-ignore lint/style/useNamingConvention: raw SQL result uses snake_case
			trigger_config: string | null;
			// biome-ignore lint/style/useNamingConvention: raw SQL result uses snake_case
			owner_agent_id: string;
			// biome-ignore lint/style/useNamingConvention: raw SQL result uses snake_case
			skill_id: string | null;
			// biome-ignore lint/style/useNamingConvention: raw SQL result uses snake_case
			human_review: boolean;
			silent: boolean;
		};
		const rows = await queryRows<RoutineDetailRow>(
			db,
			"SELECT id, trigger_type, trigger_config, owner_agent_id, skill_id, human_review, silent FROM routines WHERE id LIKE 'builtin:%' ORDER BY id",
		);
		const byId = new Map(rows.map((r) => [r.id, r]));

		for (const spec of expected) {
			const row = byId.get(spec.id);
			expect(row, `routine ${spec.id} must be seeded`).toBeTruthy();
			if (!row) continue;
			expect(row.trigger_type, `${spec.id} trigger_type`).toBe(spec.triggerType);
			expect(JSON.parse(row.trigger_config ?? "{}"), `${spec.id} trigger_config`).toEqual(
				spec.triggerConfig,
			);
			expect(row.owner_agent_id, `${spec.id} owner_agent_id`).toBe(spec.ownerAgentId);
			expect(row.skill_id, `${spec.id} skill_id`).toBe(spec.skillId);
			expect(row.human_review, `${spec.id} human_review`).toBe(spec.humanReview);
			expect(row.silent, `${spec.id} silent`).toBe(spec.silent);
		}
	});

	// --- AD8c AC3: knowledge-decay owned by facilitator agent ---
	test("builtin:knowledge-decay is owned by seed-agent-pf-facilitation (AD8c AC3)", async ({
		db,
	}) => {
		await seed(db);
		// biome-ignore lint/style/useNamingConvention: raw SQL result uses snake_case
		const rows = await queryRows<{ owner_agent_id: string }>(
			db,
			"SELECT owner_agent_id FROM routines WHERE id = 'builtin:knowledge-decay'",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.owner_agent_id).toBe("seed-agent-pf-facilitation");
	});

	// --- AD8c AC5: portfolio-retro not owned by a facilitator agent ---
	test("builtin:portfolio-retro is owned by seed-agent-cos, NOT a facilitator agent (AD8c AC5)", async ({
		db,
	}) => {
		await seed(db);
		// biome-ignore lint/style/useNamingConvention: raw SQL result uses snake_case
		const rows = await queryRows<{ owner_agent_id: string }>(
			db,
			"SELECT owner_agent_id FROM routines WHERE id = 'builtin:portfolio-retro'",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.owner_agent_id).toBe("seed-agent-cos");
		// Must NOT be any seed-agent-pf-* agent
		expect(rows[0]?.owner_agent_id).not.toMatch(/^seed-agent-pf-/);
	});

	// --- AD8c AC2: soul_template:facilitator key exists (renamed from practice_facilitator) ---
	test("factory_settings has soul_template:facilitator key and NOT soul_template:practice_facilitator (AD8c AC2)", async ({
		db,
	}) => {
		await seed(db);

		const facilitatorRows = await queryRows<{ key: string; value: string }>(
			db,
			"SELECT key, value FROM factory_settings WHERE key = 'soul_template:facilitator'",
		);
		expect(facilitatorRows).toHaveLength(1);
		expect(facilitatorRows[0]?.value).toBeTruthy();
		expect(facilitatorRows[0]?.value.length).toBeGreaterThan(50);

		// @lore AD8c: old key must not exist
		const oldRows = await queryRows<{ key: string }>(
			db,
			"SELECT key FROM factory_settings WHERE key = 'soul_template:practice_facilitator'",
		);
		expect(oldRows).toHaveLength(0);
	});
});
