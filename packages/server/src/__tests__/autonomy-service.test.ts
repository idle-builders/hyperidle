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
	items,
	products,
	teams,
	threads,
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

	it("creates the (agent, skill) row when missing — audit fromLevel=null, silent (no thread/item/event)", () => {
		// L1 review M3: first-set is silent — audit row records the
		// `null → toLevel` baseline, but no review thread/item is created
		// and no `item_created` event is emitted. Bulk seeding must not
		// generate review noise.
		const seen: DomainEvent[] = [];
		eventBus.on("item_created", (e) => seen.push(e));

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

		// First-set is silent: no review thread, no item, no event.
		const reviewThreads = db.select().from(threads).where(eq(threads.kind, "review")).all();
		expect(reviewThreads).toHaveLength(0);
		const allItems = db.select().from(items).all();
		expect(allItems).toHaveLength(0);
		expect(seen).toHaveLength(0);
	});

	it("same level is a no-op: no audit, no thread, no item, no events", () => {
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
		// L1 review M2: no-op must NOT create a review thread or item either.
		const reviewThreads = db.select().from(threads).where(eq(threads.kind, "review")).all();
		expect(reviewThreads).toHaveLength(0);
		const allItems = db.select().from(items).all();
		expect(allItems).toHaveLength(0);
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
		// L1 review M1: assert that the new actor ("founder-1") replaces
		// the seeded actor ("system") and that the audit row records the
		// new actor in `changed_by`. The seeded `updated_by` is
		// distinct from the change actor so we cannot pass the assertion
		// trivially via a self-comparison.
		const before = db.select().from(agentSkills).where(eq(agentSkills.skillId, "deploy")).get();
		expect(before?.updatedBy).toBe("system"); // sanity: seed used "system"

		applyAutonomyChange(db, eventBus, {
			agentId: "architect",
			skillId: "deploy",
			level: 4,
			rationale: null,
			changedBy: "founder-1",
		});

		const skillRow = db.select().from(agentSkills).where(eq(agentSkills.skillId, "deploy")).get();
		expect(skillRow?.autonomyLevel).toBe(4);
		// New actor mirrored into the row.
		expect(skillRow?.updatedBy).toBe("founder-1");
		// updatedAt advances off the seeded value
		expect(skillRow?.updatedAt).not.toBe(NOW);

		// Audit row carries the change actor — the only "from/to actor" the
		// schema models is `changed_by` (no `from_actor` column exists).
		const audit = db
			.select()
			.from(agentSkillAutonomyAudit)
			.where(eq(agentSkillAutonomyAudit.skillId, "deploy"))
			.get();
		expect(audit?.changedBy).toBe("founder-1");
	});

	// ------------------------------------------------------------------
	// L1 review B2 — concurrent writers cannot double-audit
	// ------------------------------------------------------------------

	it("two concurrent writers to the same (agent, skill) write exactly one audit row", () => {
		// Both calls target the same (agent, skill, level=4) transition.
		// The first commit changes the level from 2 -> 4. The second
		// observes excluded.autonomy_level == agent_skills.autonomy_level
		// inside its conditional ON CONFLICT, performs no UPDATE, and
		// therefore does NOT write an audit row or emit an event.
		const seen: DomainEvent[] = [];
		eventBus.on("item_created", (e) => seen.push(e));

		// better-sqlite3 is synchronous so "concurrent" inside one process
		// means back-to-back invocations. The transactional + conditional
		// upsert is what protects against the lost-update / double-audit;
		// even if these were truly parallel the second-to-commit would
		// observe the post-first state and skip the audit insert.
		applyAutonomyChange(db, eventBus, {
			agentId: "architect",
			skillId: "deploy",
			level: 4,
			rationale: "first",
			changedBy: "founder-1",
		});
		applyAutonomyChange(db, eventBus, {
			agentId: "architect",
			skillId: "deploy",
			level: 4,
			rationale: "second",
			changedBy: "founder-2",
		});

		const audit = db
			.select()
			.from(agentSkillAutonomyAudit)
			.where(eq(agentSkillAutonomyAudit.skillId, "deploy"))
			.all();
		expect(audit).toHaveLength(1);
		expect(audit[0].rationale).toBe("first");
		expect(audit[0].toLevel).toBe(4);

		expect(seen).toHaveLength(1);
	});
});

// L1 review N3: `agent_skill_autonomy_audit` is logically append-only —
// the audit trail's value as evidence depends on its rows surviving
// unmodified. This static invariant prevents drift: any future call to
// `db.update(agentSkillAutonomyAudit)` or `db.delete(agentSkillAutonomyAudit)`
// in the server package must explicitly remove the guard below.
describe("L1: agent_skill_autonomy_audit is append-only (static invariant)", () => {
	it("no server source file UPDATEs or DELETEs agent_skill_autonomy_audit", async () => {
		const fs = await import("node:fs/promises");
		const path = await import("node:path");

		const serverSrc = path.resolve(__dirname, "..");
		// Match `db.update(agentSkillAutonomyAudit` / `tx.update(agentSkillAutonomyAudit`
		// and the equivalent `delete` calls. Whitespace tolerant.
		const pattern = /\b(?:update|delete)\s*\(\s*agentSkillAutonomyAudit\b/;
		const skipFile = "autonomy-service.test.ts";

		async function listTsFiles(dir: string): Promise<string[]> {
			const entries = await fs.readdir(dir, { withFileTypes: true });
			const out: string[] = [];
			for (const entry of entries) {
				if (entry.name === "node_modules" || entry.name === "dist") continue;
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					out.push(...(await listTsFiles(full)));
				} else if (entry.isFile() && entry.name.endsWith(".ts")) {
					out.push(full);
				}
			}
			return out;
		}

		const allFiles = await listTsFiles(serverSrc);
		const offenders: string[] = [];
		for (const full of allFiles) {
			// Skip this very test file (the regex above appears in this
			// description and would self-trigger).
			if (full.endsWith(skipFile)) continue;
			const content = await fs.readFile(full, "utf8");
			if (pattern.test(content)) {
				offenders.push(path.relative(serverSrc, full));
			}
		}

		expect(offenders).toEqual([]);
	});
});
