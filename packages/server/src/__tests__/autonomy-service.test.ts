/**
 * L1 — Autonomy Schema (red phase, server service helper).
 *
 * Pins the contract for the shared `applyAutonomyChange` helper from
 * `docs/plans/L1.md` step E + §4 step 3. The helper is the single writer
 * of `agent_skills.autonomy_level` after L1; both the new `/autonomy`
 * routes AND the legacy `/skills/:skillId` route must call through it.
 *
 * MUST fail against `main`: the module doesn't exist yet.
 */
import {
	agentSkillAutonomyAudit,
	agentSkills,
	agents,
	createTestDb,
	type HyperIdleDb,
	products,
	teams,
} from "@hyperidle/db";
import { type DomainEvent, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
// Imported from the package barrel as a workspace import; service file does
// not yet exist — that's the point of the red phase.
import { applyAutonomyChange } from "../services/autonomy.js";

const NOW = "2026-04-26T12:00:00.000Z";

function seed(db: HyperIdleDb): void {
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
			id: "architect",
			name: "Architect",
			role: "builder",
			status: "idle",
			teamId: "team-1",
			createdAt: NOW,
		})
		.run();
	db.insert(agentSkills)
		.values({
			agentId: "architect",
			skillId: "deploy",
			autonomyLevel: 2,
			updatedAt: NOW,
			updatedBy: "system",
		})
		.run();
}

describe("L1: applyAutonomyChange (shared helper)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		seed(db);
	});

	it("creates the (agent, skill) row when missing — audit fromLevel=null", () => {
		applyAutonomyChange(db, eventBus, {
			agentId: "architect",
			skillId: "research",
			level: 2,
			rationale: "first-set",
			changedBy: "system",
		});

		const skillRow = db.select().from(agentSkills).where(eq(agentSkills.skillId, "research")).get();
		expect(skillRow?.autonomyLevel).toBe(2);

		const audit = db
			.select()
			.from(agentSkillAutonomyAudit)
			.where(eq(agentSkillAutonomyAudit.skillId, "research"))
			.get();
		expect(audit?.fromLevel).toBeNull();
		expect(audit?.toLevel).toBe(2);
		expect(audit?.rationale).toBe("first-set");
	});

	it("same level is a no-op: no audit, no events", () => {
		const seen: DomainEvent[] = [];
		eventBus.on("item_created", (e) => seen.push(e));

		applyAutonomyChange(db, eventBus, {
			agentId: "architect",
			skillId: "deploy",
			level: 2, // already at 2
			rationale: null,
			changedBy: "system",
		});

		const audit = db
			.select()
			.from(agentSkillAutonomyAudit)
			.where(eq(agentSkillAutonomyAudit.agentId, "architect"))
			.all();
		expect(audit).toHaveLength(0);
		expect(seen).toHaveLength(0);
	});

	it("level change writes audit + emits item_created", () => {
		const seen: DomainEvent[] = [];
		eventBus.on("item_created", (e) => seen.push(e));

		applyAutonomyChange(db, eventBus, {
			agentId: "architect",
			skillId: "deploy",
			level: 3,
			rationale: "trust earned",
			changedBy: "system",
		});

		const audit = db
			.select()
			.from(agentSkillAutonomyAudit)
			.where(eq(agentSkillAutonomyAudit.agentId, "architect"))
			.get();
		expect(audit).toBeDefined();
		expect(audit?.fromLevel).toBe(2);
		expect(audit?.toLevel).toBe(3);
		expect(audit?.rationale).toBe("trust earned");
		expect(audit?.changedBy).toBe("system");

		expect(seen).toHaveLength(1);
		expect(seen[0].type).toBe("item_created");
	});

	it("updates agent_skills.updated_at and updated_by on level change", () => {
		applyAutonomyChange(db, eventBus, {
			agentId: "architect",
			skillId: "deploy",
			level: 4,
			rationale: null,
			changedBy: "founder-1",
		});

		const skillRow = db.select().from(agentSkills).where(eq(agentSkills.skillId, "deploy")).get();
		expect(skillRow?.autonomyLevel).toBe(4);
		expect(skillRow?.updatedBy).toBe("founder-1");
		// updatedAt advances off the seeded value
		expect(skillRow?.updatedAt).not.toBe(NOW);
	});
});
