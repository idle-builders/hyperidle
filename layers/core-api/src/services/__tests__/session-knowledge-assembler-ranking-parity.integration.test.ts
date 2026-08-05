/**
 * AU21 §9 Increment 12 (Decision H3) — the regression-pin architecture.md's
 * Increment 12 test (b) requires: "baked ranking output matches the
 * pre-migration ranking for a fixed corpus."
 *
 * Exercises `@hyperidle/knowledge`'s `assembleSessionKnowledge` (Wave A —
 * the relocated `list`+`rank` core-side, the exact logic `context.ts`'s
 * DB-reading `assembleContext` used to run at launch, verbatim) against a
 * fixed corpus (two teams, two practice communities, one factory-wide item)
 * so a genuine relocation bug (wrong scope, wrong community mapping, wrong
 * budget cutoff) shows up as a set mismatch against the hardcoded expected
 * membership below.
 *
 * @lore Wave C (GREEN, revised — flagged for reviewer): the RED-phase version
 * of this test additionally ran `runSession(...,{mode:"assemble", input:
 * {db,...}})` (the pre-migration DB-reading `assembleContext` path, wired to
 * the real `contextPorts.knowledge.{list,rankAndBudget}`) to derive an
 * "old path" id set to diff against. Wave C deletes that path AND
 * `contextPorts.knowledge`/`.org` entirely (required for
 * `context-assembly-anti-regrowth.test.ts` to prove ZERO
 * `run-orchestration -> knowledge/org` edges) — there is no live "old path"
 * left to run. The hardcoded anchor assertions below (membership +
 * exclusions) already fully specify the expected set independent of any
 * "old path" comparison, so dropping that comparison does not weaken this
 * test's proof obligation — it removes a comparison against code that no
 * longer exists, keeping the equally-strong direct assertions.
 */

import {
	bets,
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { assembleSessionKnowledge } from "@hyperidle/knowledge";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

const NOW = "2026-07-31T00:00:00.000Z";
const TEAM_ID = "team-i12-parity";
const OTHER_TEAM_ID = "team-i12-other";
const AGENT_ID = "agent-i12-parity";
const AGENT_ROLE = "builder"; // communityForRole("builder") === "building"
const TASK_ID = "task-i12-parity";
const BET_ID = "bet-i12-parity";
const TASK_DESCRIPTION = "Ship the boundary seam parity check.";

async function seedFixedCorpus(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values([
		{ id: TEAM_ID, name: "Parity Team", phase: "build", createdAt: NOW },
		{ id: OTHER_TEAM_ID, name: "Other Team", phase: "build", createdAt: NOW },
	]);
	await db
		.insert(teamMembers)
		.values({ id: "tm-i12-parity", teamId: TEAM_ID, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: AGENT_ID,
		name: "Parity Agent",
		role: AGENT_ROLE,
		status: "active",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: BET_ID,
		teamId: TEAM_ID,
		description: "I12 parity bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: TASK_ID,
		betId: BET_ID,
		teamId: TEAM_ID,
		title: "I12 parity task",
		description: TASK_DESCRIPTION,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});

	// L4 — factory-wide, always included regardless of team/community.
	await db.insert(knowledgeItems).values({
		id: "item-i12-l4",
		scopeKind: "factory",
		scopeId: null,
		title: "Factory-wide practice",
		body: "Applies to every team and every community.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-l4",
		knowledgeItemId: "item-i12-l4",
		layer: "L4",
		scopeId: null,
	});

	// L2 — scoped to TEAM_ID (must be included).
	await db.insert(knowledgeItems).values({
		id: "item-i12-l2-in",
		scopeKind: "team",
		scopeId: TEAM_ID,
		title: "Team-scoped product knowledge",
		body: "Specific to the parity team's product.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-l2-in",
		knowledgeItemId: "item-i12-l2-in",
		layer: "L2",
		scopeId: TEAM_ID,
	});

	// L2 — scoped to OTHER_TEAM_ID (must be EXCLUDED from a TEAM_ID assembly).
	await db.insert(knowledgeItems).values({
		id: "item-i12-l2-out",
		scopeKind: "team",
		scopeId: OTHER_TEAM_ID,
		title: "Other team's product knowledge",
		body: "Must not leak into the parity team's context.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-l2-out",
		knowledgeItemId: "item-i12-l2-out",
		layer: "L2",
		scopeId: OTHER_TEAM_ID,
	});

	// L3 — scoped to "building" (communityForRole("builder")), must be included.
	await db.insert(knowledgeItems).values({
		id: "item-i12-l3-in",
		scopeKind: "practice",
		scopeId: "building",
		title: "Building practice knowledge",
		body: "Relevant to the builder community.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-l3-in",
		knowledgeItemId: "item-i12-l3-in",
		layer: "L3",
		scopeId: "building",
	});

	// L3 — scoped to "growth" (a different community), must be EXCLUDED.
	await db.insert(knowledgeItems).values({
		id: "item-i12-l3-out",
		scopeKind: "practice",
		scopeId: "growth",
		title: "Growth practice knowledge",
		body: "Not relevant to the builder community.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-l3-out",
		knowledgeItemId: "item-i12-l3-out",
		layer: "L3",
		scopeId: "growth",
	});
}

describe("assembleSessionKnowledge — ranking parity with the pre-migration path (Increment 12)", () => {
	test("returns exactly the expected item-id set for the fixed corpus (budget/scope/community filter)", async ({
		db,
	}) => {
		await seedFixedCorpus(db);

		const budgeted = await assembleSessionKnowledge(db, {
			teamId: TEAM_ID,
			agentRole: AGENT_ROLE,
			taskDescription: TASK_DESCRIPTION,
		});
		const ids = new Set(budgeted.map((item) => item.id));

		// Anchor the actual expected membership — the corpus mixes in-scope and
		// out-of-scope items on purpose (team + community exclusion), so a
		// coincidental empty-set match can't silently pass.
		expect([...ids].sort()).toEqual(["item-i12-l2-in", "item-i12-l3-in", "item-i12-l4"].sort());
		expect(ids.has("item-i12-l2-out")).toBe(false);
		expect(ids.has("item-i12-l3-out")).toBe(false);
	});

	test("each returned item's layer identifies the correct sandbox zone it belongs to", async ({
		db,
	}) => {
		await seedFixedCorpus(db);

		const budgeted = await assembleSessionKnowledge(db, {
			teamId: TEAM_ID,
			agentRole: AGENT_ROLE,
			taskDescription: TASK_DESCRIPTION,
		});

		const zoneByLayer: Record<string, string> = {
			L4: "context/factory",
			L2: "context/product",
			L3: "context/practices",
		};
		const expectedLayerById: Record<string, string> = {
			"item-i12-l4": "L4",
			"item-i12-l2-in": "L2",
			"item-i12-l3-in": "L3",
		};

		expect(budgeted.length).toBe(3);
		for (const item of budgeted) {
			expect(item.layer).toBe(expectedLayerById[item.id]);
			expect(item.layer ? zoneByLayer[item.layer] : undefined).toBeDefined();
		}
	});

	test("sanity check: assembleSessionKnowledge genuinely excludes out-of-scope items (not a vacuous corpus)", async ({
		db,
	}) => {
		await seedFixedCorpus(db);

		// Confirm the seeded corpus really does contain the out-of-scope rows
		// (a fixture sanity guard — the exclusion below would be vacuous if
		// these rows didn't exist).
		const [row] = await db
			.select({ id: knowledgeItems.id })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, "item-i12-l2-out"));
		expect(row).toBeDefined();

		const budgeted = await assembleSessionKnowledge(db, {
			teamId: TEAM_ID,
			agentRole: AGENT_ROLE,
			taskDescription: TASK_DESCRIPTION,
		});
		const ids = new Set(budgeted.map((item) => item.id));
		expect(ids.has("item-i12-l2-out")).toBe(false);
		expect(ids.has("item-i12-l3-out")).toBe(false);
		expect(ids.has("item-i12-l4")).toBe(true);
	});
});
