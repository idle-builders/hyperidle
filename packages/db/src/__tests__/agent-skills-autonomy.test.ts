/**
 * L1 — Autonomy Schema (red phase, DB layer).
 *
 * Pins the migration contract from `docs/plans/L1.md` Decision 3:
 *   1. `agent_skills` gains `updated_at` (NOT NULL) and `updated_by` (nullable).
 *      Existing rows are backfilled (no `1970-01-01` sentinel left after migrate).
 *   2. New table `agent_skill_autonomy_audit` with indexes:
 *      - `asaa_agent_idx` on (agent_id)
 *      - `asaa_pair_idx`  on (agent_id, skill_id)
 *      - `asaa_changed_at_desc_idx` on (changed_at)
 *
 * MUST fail against `main` (table + columns + indexes don't exist yet).
 */
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import { agentSkillAutonomyAudit, agentSkills, agents, products, teams } from "../schema.js";
import { createTestDb } from "../test-utils.js";

const NOW = "2026-04-26T12:00:00.000Z";
const SENTINEL = "1970-01-01T00:00:00.000Z";

function seedAgent(db: HyperIdleDb, agentId = "agent-1"): void {
	db.insert(products).values({ id: "prod-1", name: "P", phase: "build", createdAt: NOW }).run();
	db.insert(teams)
		.values({
			id: "team-1",
			productId: "prod-1",
			capacity: 1,
			activeBets: 0,
			formedAt: NOW,
		})
		.run();
	db.insert(agents)
		.values({
			id: agentId,
			name: "Agent",
			role: "builder",
			status: "idle",
			teamId: "team-1",
			createdAt: NOW,
		})
		.run();
}

describe("L1: agent_skills audit columns", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it("agent_skills has the updated_at column (NOT NULL TEXT)", () => {
		const cols = db
			.all<{ name: string; type: string; notnull: number }>(sql`PRAGMA table_info("agent_skills")`)
			.map((c) => ({ name: c.name, type: c.type, notnull: c.notnull }));

		const updatedAt = cols.find((c) => c.name === "updated_at");
		expect(updatedAt).toBeDefined();
		expect(updatedAt?.type.toUpperCase()).toContain("TEXT");
		expect(updatedAt?.notnull).toBe(1);
	});

	it("agent_skills has the updated_by column (nullable TEXT)", () => {
		const cols = db
			.all<{ name: string; type: string; notnull: number }>(sql`PRAGMA table_info("agent_skills")`)
			.map((c) => ({ name: c.name, type: c.type, notnull: c.notnull }));

		const updatedBy = cols.find((c) => c.name === "updated_by");
		expect(updatedBy).toBeDefined();
		expect(updatedBy?.type.toUpperCase()).toContain("TEXT");
		expect(updatedBy?.notnull).toBe(0);
	});

	it("inserts and selects with explicit updated_at / updated_by", () => {
		seedAgent(db);
		db.insert(agentSkills)
			.values({
				agentId: "agent-1",
				skillId: "deploy",
				autonomyLevel: 2,
				updatedAt: NOW,
				updatedBy: "system",
			})
			.run();

		const row = db.select().from(agentSkills).where(eq(agentSkills.agentId, "agent-1")).get();

		expect(row).toBeDefined();
		expect(row?.updatedAt).toBe(NOW);
		expect(row?.updatedBy).toBe("system");
	});

	it("updated_by is permitted to be null (system / pre-audit rows)", () => {
		seedAgent(db);
		db.insert(agentSkills)
			.values({
				agentId: "agent-1",
				skillId: "deploy",
				autonomyLevel: 1,
				updatedAt: NOW,
				updatedBy: null,
			})
			.run();

		const row = db.select().from(agentSkills).where(eq(agentSkills.agentId, "agent-1")).get();

		expect(row?.updatedBy).toBeNull();
	});

	it("post-migration: no row carries the 1970 sentinel updated_at", () => {
		// The migration must UPDATE every backfilled row off the sentinel
		// before app code runs (per docs/plans/L1.md Risk row 2). With a fresh
		// in-memory DB there are no rows yet, so the assertion is over an empty
		// set — but the moment seed/fixture rows arrive the assertion still
		// holds. The presence of any sentinel value in production would be a
		// migration bug.
		const stale = db
			.all<{ count: number }>(
				sql`SELECT COUNT(*) AS count FROM agent_skills WHERE updated_at = ${SENTINEL}`,
			)
			.map((r) => r.count)[0];
		expect(stale).toBe(0);
	});
});

describe("L1: agent_skill_autonomy_audit table", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedAgent(db);
	});

	it("table exists with the expected columns", () => {
		const cols = db
			.all<{ name: string; type: string; notnull: number; pk: number }>(
				sql`PRAGMA table_info("agent_skill_autonomy_audit")`,
			)
			.map((c) => c.name);

		expect(cols).toEqual(
			expect.arrayContaining([
				"id",
				"agent_id",
				"skill_id",
				"from_level",
				"to_level",
				"rationale",
				"changed_by",
				"changed_at",
			]),
		);
	});

	it("declares the asaa_agent_idx + asaa_pair_idx + asaa_changed_at_desc_idx indexes", () => {
		const indexes = db
			.all<{ name: string }>(sql`PRAGMA index_list("agent_skill_autonomy_audit")`)
			.map((r) => r.name);

		expect(indexes).toEqual(
			expect.arrayContaining(["asaa_agent_idx", "asaa_pair_idx", "asaa_changed_at_desc_idx"]),
		);
	});

	it("accepts an audit row with rationale + changedBy + both levels", () => {
		db.insert(agentSkillAutonomyAudit)
			.values({
				id: "audit-1",
				agentId: "agent-1",
				skillId: "deploy",
				fromLevel: 2,
				toLevel: 3,
				rationale: "shipped 5 deploys, no incidents",
				changedBy: "system",
				changedAt: NOW,
			})
			.run();

		const row = db
			.select()
			.from(agentSkillAutonomyAudit)
			.where(eq(agentSkillAutonomyAudit.id, "audit-1"))
			.get();

		expect(row).toBeDefined();
		expect(row?.fromLevel).toBe(2);
		expect(row?.toLevel).toBe(3);
		expect(row?.rationale).toBe("shipped 5 deploys, no incidents");
		expect(row?.changedBy).toBe("system");
	});

	it("permits null fromLevel (first-set / no prior row)", () => {
		db.insert(agentSkillAutonomyAudit)
			.values({
				id: "audit-2",
				agentId: "agent-1",
				skillId: "deploy",
				fromLevel: null,
				toLevel: 1,
				rationale: null,
				changedBy: "system",
				changedAt: NOW,
			})
			.run();

		const row = db
			.select()
			.from(agentSkillAutonomyAudit)
			.where(eq(agentSkillAutonomyAudit.id, "audit-2"))
			.get();

		expect(row?.fromLevel).toBeNull();
		expect(row?.toLevel).toBe(1);
	});

	it("rejects audit rows referencing a missing agent (FK on agent_id)", () => {
		// SQLite enforces FKs only when `PRAGMA foreign_keys = ON` (createTestDb
		// does this). A reference to a nonexistent agent must be rejected.
		expect(() =>
			db
				.insert(agentSkillAutonomyAudit)
				.values({
					id: "audit-bad",
					agentId: "ghost-agent",
					skillId: "deploy",
					fromLevel: null,
					toLevel: 1,
					rationale: null,
					changedBy: "system",
					changedAt: NOW,
				})
				.run(),
		).toThrow();
	});

	it("requires changed_by, to_level, changed_at (NOT NULL contract)", () => {
		const cols = db
			.all<{ name: string; notnull: number }>(sql`PRAGMA table_info("agent_skill_autonomy_audit")`)
			.reduce<Record<string, number>>((acc, c) => {
				acc[c.name] = c.notnull;
				return acc;
			}, {});

		expect(cols.changed_by).toBe(1);
		expect(cols.to_level).toBe(1);
		expect(cols.changed_at).toBe(1);

		// Nullable per plan
		expect(cols.from_level).toBe(0);
		expect(cols.rationale).toBe(0);
	});
});
