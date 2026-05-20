import * as fs from "node:fs";
import * as path from "node:path";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import { seed } from "../seed.js";
import { createTestDb } from "../test-utils.js";

const FACILITATOR_ROLES = ["chief_of_staff", "practice_facilitator", "product_manager"] as const;

/** Resolve the repo root from this test file's location. */
function repoRoot(): string {
	// __dirname at runtime = packages/db/src/__tests__ (after build relative to src)
	return path.resolve(__dirname, "..", "..", "..", "..");
}

describe("A2: Seed script", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	// --- AC4: Seed populates ≥1 row per major table ---
	it("populates at least 1 row per major table", () => {
		seed(db);

		const majorTables = ["agents", "teams", "products", "knowledge_items", "factory_settings"];

		for (const table of majorTables) {
			const result = db.get<{ count: number }>(sql.raw(`SELECT COUNT(*) as count FROM ${table}`));
			expect(result?.count, `${table} should have ≥1 row`).toBeGreaterThanOrEqual(1);
		}
	});

	it("seed data is well-formed (queryable without errors)", () => {
		seed(db);

		// Verify we can read back with all fields
		const product = db.get<{ id: string; name: string }>(
			sql`SELECT id, name FROM products LIMIT 1`,
		);
		expect(product?.id).toBeTruthy();
		expect(product?.name).toBeTruthy();

		const agent = db.get<{ id: string; name: string; role: string }>(
			sql`SELECT id, name, role FROM agents LIMIT 1`,
		);
		expect(agent?.id).toBeTruthy();
		expect(agent?.name).toBeTruthy();
		expect(agent?.role).toBeTruthy();

		const team = db.get<{ id: string; capacity: number }>(
			sql`SELECT id, capacity FROM teams LIMIT 1`,
		);
		expect(team?.id).toBeTruthy();
		expect(team?.capacity).toBeGreaterThan(0);

		const ki = db.get<{ id: string; layer: string; version: number }>(
			sql`SELECT id, layer, version FROM knowledge_items LIMIT 1`,
		);
		expect(ki?.id).toBeTruthy();
		expect(ki?.layer).toBeTruthy();
		expect(ki?.version).toBeGreaterThanOrEqual(1);
	});

	it("is idempotent (running twice does not error)", () => {
		seed(db);
		// Second run should not throw (uses INSERT OR IGNORE or similar)
		expect(() => seed(db)).not.toThrow();
	});

	// --- G1 AC1: facilitator agent archetypes are seeded ---
	it("seeds one Chief of Staff, ≥1 Practice Facilitator, ≥1 Product Manager (AC1)", () => {
		seed(db);

		const cos = db.get<{ count: number }>(
			sql`SELECT COUNT(*) as count FROM agents WHERE role = 'chief_of_staff'`,
		);
		expect(cos?.count).toBe(1);

		const pf = db.get<{ count: number }>(
			sql`SELECT COUNT(*) as count FROM agents WHERE role = 'practice_facilitator'`,
		);
		expect(pf?.count).toBeGreaterThanOrEqual(1);

		const pm = db.get<{ count: number }>(
			sql`SELECT COUNT(*) as count FROM agents WHERE role = 'product_manager'`,
		);
		expect(pm?.count).toBeGreaterThanOrEqual(1);
	});

	// --- G1 AC2: every facilitator carries a non-empty soul_prompt_path ---
	it("every seeded facilitator has a non-empty soul_prompt_path (AC2)", () => {
		seed(db);

		const rolesList = FACILITATOR_ROLES.map((r) => `'${r}'`).join(", ");
		const rows = db.all<{ id: string; role: string; soulPromptPath: string | null }>(
			sql.raw(
				`SELECT id, role, soul_prompt_path AS "soulPromptPath" FROM agents WHERE role IN (${rolesList})`,
			),
		);
		expect(rows.length).toBeGreaterThanOrEqual(3);
		for (const row of rows) {
			expect(row.soulPromptPath, `${row.id} soul_prompt_path must be set`).toBeTruthy();
			expect(row.soulPromptPath?.endsWith(".md")).toBe(true);
		}
	});

	it("soul_prompt_path files exist on disk", () => {
		seed(db);

		const rolesList = FACILITATOR_ROLES.map((r) => `'${r}'`).join(", ");
		const rows = db.all<{ id: string; soulPromptPath: string | null }>(
			sql.raw(
				`SELECT id, soul_prompt_path AS "soulPromptPath" FROM agents WHERE role IN (${rolesList})`,
			),
		);
		expect(rows.length).toBeGreaterThanOrEqual(3);
		const root = repoRoot();
		for (const row of rows) {
			expect(row.soulPromptPath).toBeTruthy();
			const resolved = path.resolve(root, row.soulPromptPath ?? "");
			expect(
				fs.existsSync(resolved),
				`${row.id} soul_prompt_path must resolve to an existing file: ${resolved}`,
			).toBe(true);
		}
	});

	// --- G4 AC6: seed creates all 5 builtin routines with correct config ---
	it("seeds all 5 G4 builtin routines with correct triggers (G4 AC6)", () => {
		seed(db);

		const expectedIds = [
			"builtin:cost-sentinel",
			"builtin:practice-meeting",
			"builtin:post-bet-retro",
			"builtin:portfolio-retro",
			"builtin:knowledge-decay",
		] as const;

		const rows = db.all<{
			id: string;
			triggerType: string;
			triggerConfig: string | null;
			ownerAgentId: string;
			active: number;
		}>(
			sql.raw(
				"SELECT id, trigger_type AS triggerType, trigger_config AS triggerConfig, owner_agent_id AS ownerAgentId, active FROM routines WHERE id LIKE 'builtin:%' ORDER BY id",
			),
		);

		const byId = new Map(rows.map((r) => [r.id, r]));
		for (const id of expectedIds) {
			expect(byId.has(id), `routine ${id} must be seeded`).toBe(true);
			expect(byId.get(id)?.active).toBe(1);
			expect(byId.get(id)?.triggerConfig).toBeTruthy();
		}

		expect(byId.get("builtin:cost-sentinel")?.triggerType).toBe("heartbeat");
		expect(byId.get("builtin:practice-meeting")?.triggerType).toBe("calendar");
		expect(byId.get("builtin:post-bet-retro")?.triggerType).toBe("event");
		expect(byId.get("builtin:portfolio-retro")?.triggerType).toBe("calendar");
		expect(byId.get("builtin:knowledge-decay")?.triggerType).toBe("calendar");
	});

	// --- G4 review MAJOR-3: pin the full builtin-routine spec so any drift
	//     between packages/db/src/seed.ts and
	//     packages/server/src/services/builtin-routines.ts BUILTIN_SPECS is
	//     caught by CI. If you change this test, mirror the change in both
	//     files. ---
	it("pins the full trigger_config, owner, skill, human_review, silent for every builtin (G4 drift guard)", () => {
		seed(db);

		interface BuiltinPin {
			readonly id: string;
			readonly triggerType: "heartbeat" | "calendar" | "event";
			readonly triggerConfig: Record<string, unknown>;
			readonly ownerAgentId: string;
			readonly skillId: string;
			readonly humanReview: 0 | 1;
			readonly silent: 0 | 1;
		}

		const expected: readonly BuiltinPin[] = [
			{
				id: "builtin:cost-sentinel",
				triggerType: "heartbeat",
				triggerConfig: { intervalSeconds: 900 },
				ownerAgentId: "seed-agent-cos",
				skillId: "cost_watchdog",
				humanReview: 0,
				silent: 1,
			},
			{
				id: "builtin:practice-meeting",
				triggerType: "calendar",
				triggerConfig: { cron: "0 10 * * MON" },
				ownerAgentId: "seed-agent-pf-facilitation",
				skillId: "practice_meeting",
				humanReview: 0,
				silent: 0,
			},
			{
				id: "builtin:post-bet-retro",
				triggerType: "event",
				triggerConfig: { eventType: "bet_state_changed" },
				ownerAgentId: "seed-agent-pm-nimmly",
				skillId: "bet_retro",
				humanReview: 1,
				silent: 0,
			},
			{
				id: "builtin:portfolio-retro",
				triggerType: "calendar",
				triggerConfig: { cron: "0 10 1-7 * MON" },
				ownerAgentId: "seed-agent-cos",
				skillId: "portfolio_retro",
				humanReview: 1,
				silent: 0,
			},
			{
				id: "builtin:knowledge-decay",
				triggerType: "calendar",
				triggerConfig: { cron: "0 2 * * *" },
				ownerAgentId: "seed-agent-cos",
				skillId: "knowledge_decay",
				humanReview: 0,
				silent: 1,
			},
		];

		const rows = db.all<{
			id: string;
			triggerType: string;
			triggerConfig: string | null;
			ownerAgentId: string;
			skillId: string | null;
			humanReview: number;
			silent: number;
		}>(
			sql.raw(
				"SELECT id, trigger_type AS triggerType, trigger_config AS triggerConfig, owner_agent_id AS ownerAgentId, skill_id AS skillId, human_review AS humanReview, silent FROM routines WHERE id LIKE 'builtin:%' ORDER BY id",
			),
		);
		const byId = new Map(rows.map((r) => [r.id, r]));

		for (const spec of expected) {
			const row = byId.get(spec.id);
			expect(row, `routine ${spec.id} must be seeded`).toBeTruthy();
			if (!row) continue;
			expect(row.triggerType, `${spec.id} trigger_type`).toBe(spec.triggerType);
			expect(JSON.parse(row.triggerConfig ?? "{}"), `${spec.id} trigger_config`).toEqual(
				spec.triggerConfig,
			);
			expect(row.ownerAgentId, `${spec.id} owner_agent_id`).toBe(spec.ownerAgentId);
			expect(row.skillId, `${spec.id} skill_id`).toBe(spec.skillId);
			expect(row.humanReview, `${spec.id} human_review`).toBe(spec.humanReview);
			expect(row.silent, `${spec.id} silent`).toBe(spec.silent);
		}
	});
});
