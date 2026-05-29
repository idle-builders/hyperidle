import * as fs from "node:fs";
import * as path from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import { seed } from "../seed.js";
import { createTestDb, type TestDbHandle } from "../test-utils.js";

const FACILITATOR_ROLES = ["chief_of_staff", "practice_facilitator", "product_manager"] as const;

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

	// --- AC4: Seed populates ≥1 row per major table ---
	it("populates at least 1 row per major table", async () => {
		// @lore P2: agents → users table
		const majorTables = ["users", "teams", "products", "knowledge_items", "factory_settings"];

		for (const table of majorTables) {
			const rows = await queryRows<{ count: string }>(db, `SELECT COUNT(*) AS count FROM ${table}`);
			expect(Number(rows[0]?.count), `${table} should have ≥1 row`).toBeGreaterThanOrEqual(1);
		}
	});

	it("seed data is well-formed (queryable without errors)", async () => {
		// Verify we can read back with all fields
		const products = await queryRows<{ id: string; name: string }>(
			db,
			"SELECT id, name FROM products LIMIT 1",
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

		const teamsRows = await queryRows<{ id: string; capacity: number }>(
			db,
			"SELECT id, capacity FROM teams LIMIT 1",
		);
		expect(teamsRows[0]?.id).toBeTruthy();
		expect(teamsRows[0]?.capacity).toBeGreaterThan(0);

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

	it("is idempotent (running twice does not error)", async () => {
		// Second run should not throw (uses onConflictDoNothing)
		await expect(seed(db)).resolves.not.toThrow();
	});

	// --- G1 AC1: facilitator agent archetypes are seeded ---
	it("seeds one Chief of Staff, ≥1 Practice Facilitator, ≥1 Product Manager (AC1)", async () => {
		// @lore P2: agents → users table
		const cosRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE role = 'chief_of_staff'",
		);
		expect(Number(cosRows[0]?.count)).toBe(1);

		const pfRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE role = 'practice_facilitator'",
		);
		expect(Number(pfRows[0]?.count)).toBeGreaterThanOrEqual(1);

		const pmRows = await queryRows<{ count: string }>(
			db,
			"SELECT COUNT(*) AS count FROM users WHERE role = 'product_manager'",
		);
		expect(Number(pmRows[0]?.count)).toBeGreaterThanOrEqual(1);
	});

	// --- G1 AC2: every facilitator carries a non-empty soul_prompt_path ---
	it("every seeded facilitator has a non-empty soul_prompt_path (AC2)", async () => {
		const rolesList = FACILITATOR_ROLES.map((r) => `'${r}'`).join(", ");
		const rows = await queryRows<{ id: string; role: string; soul_prompt_path: string | null }>(
			db,
			`SELECT id, role, soul_prompt_path FROM users WHERE role IN (${rolesList})`,
		);
		expect(rows.length).toBeGreaterThanOrEqual(3);
		for (const row of rows) {
			expect(row.soul_prompt_path, `${row.id} soul_prompt_path must be set`).toBeTruthy();
			expect(row.soul_prompt_path?.endsWith(".md")).toBe(true);
		}
	});

	it("soul_prompt_path files exist on disk", async () => {
		const rolesList = FACILITATOR_ROLES.map((r) => `'${r}'`).join(", ");
		const rows = await queryRows<{ id: string; soul_prompt_path: string | null }>(
			db,
			`SELECT id, soul_prompt_path FROM users WHERE role IN (${rolesList})`,
		);
		expect(rows.length).toBeGreaterThanOrEqual(3);
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

	// --- G4 AC6: seed creates all 5 builtin routines with correct config ---
	it("seeds all 5 G4 builtin routines with correct triggers (G4 AC6)", async () => {
		const expectedIds = [
			"builtin:cost-sentinel",
			"builtin:practice-meeting",
			"builtin:post-bet-retro",
			"builtin:portfolio-retro",
			"builtin:knowledge-decay",
		] as const;

		const rows = await queryRows<{
			id: string;
			trigger_type: string;
			trigger_config: string | null;
			owner_agent_id: string;
			active: boolean;
		}>(
			db,
			"SELECT id, trigger_type, trigger_config, owner_agent_id, active FROM routines WHERE id LIKE 'builtin:%' ORDER BY id",
		);

		const byId = new Map(rows.map((r) => [r.id, r]));
		for (const id of expectedIds) {
			expect(byId.has(id), `routine ${id} must be seeded`).toBe(true);
			expect(byId.get(id)?.active).toBe(true);
			expect(byId.get(id)?.trigger_config).toBeTruthy();
		}

		expect(byId.get("builtin:cost-sentinel")?.trigger_type).toBe("heartbeat");
		expect(byId.get("builtin:practice-meeting")?.trigger_type).toBe("calendar");
		expect(byId.get("builtin:post-bet-retro")?.trigger_type).toBe("event");
		expect(byId.get("builtin:portfolio-retro")?.trigger_type).toBe("calendar");
		expect(byId.get("builtin:knowledge-decay")?.trigger_type).toBe("calendar");
	});

	// --- G4 review MAJOR-3: pin the full builtin-routine spec so any drift
	//     between packages/db/src/seed.ts and
	//     packages/server/src/services/builtin-routines.ts BUILTIN_SPECS is
	//     caught by CI. If you change this test, mirror the change in both
	//     files. ---
	it("pins the full trigger_config, owner, skill, human_review, silent for every builtin (G4 drift guard)", async () => {
		interface BuiltinPin {
			readonly id: string;
			readonly triggerType: "heartbeat" | "calendar" | "event";
			readonly triggerConfig: Record<string, unknown>;
			readonly ownerAgentId: string;
			readonly skillId: string;
			readonly humanReview: boolean;
			readonly silent: boolean;
		}

		const expected: readonly BuiltinPin[] = [
			{
				id: "builtin:cost-sentinel",
				triggerType: "heartbeat",
				triggerConfig: { intervalSeconds: 900 },
				ownerAgentId: "seed-agent-cos",
				skillId: "cost_watchdog",
				humanReview: false,
				silent: true,
			},
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
				ownerAgentId: "seed-agent-cos",
				skillId: "knowledge_decay",
				humanReview: false,
				silent: true,
			},
		];

		const rows = await queryRows<{
			id: string;
			trigger_type: string;
			trigger_config: string | null;
			owner_agent_id: string;
			skill_id: string | null;
			human_review: boolean;
			silent: boolean;
		}>(
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
});
