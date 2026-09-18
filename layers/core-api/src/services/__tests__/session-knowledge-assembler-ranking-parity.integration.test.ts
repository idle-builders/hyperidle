/**
 * AU21 §9 Increment 12 (Decision H3) — the regression-pin architecture.md's
 * Increment 12 test (b) requires: "baked ranking output matches the
 * pre-migration ranking for a fixed corpus."
 *
 * Exercises `@hyperidle/knowledge`'s `assembleSessionKnowledge` against a
 * fixed corpus (two teams, one agent-bound item, one factory-wide item) so a
 * genuine relocation bug (wrong scope, wrong budget cutoff) shows up as a set
 * mismatch against the hardcoded expected membership below.
 *
 * @lore nested-knowledge-items D1: "what an agent receives" collapses onto
 * scope alone — factory + its team + its own — replacing the L4/L2/L3 layer
 * fetch and the practice/community matching this test originally pinned.
 * The corpus below is rewritten to exercise the surviving three scope kinds
 * instead of the deleted layer/practice vocabulary.
 */

import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { assembleSessionKnowledge } from "@hyperidle/knowledge";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

const NOW = "2026-07-31T00:00:00.000Z";
const TEAM_ID = "team-i12-parity";
const OTHER_TEAM_ID = "team-i12-other";
const AGENT_ID = "agent-i12-parity";
const OTHER_AGENT_ID = "agent-i12-other";
const AGENT_ROLE = "builder";
const TASK_ID = "task-i12-parity";
const ROOT_TASK_ID = "bet-i12-parity";
const TASK_DESCRIPTION = "Ship the boundary seam parity check.";

async function seedFixedCorpus(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values([
		{ id: TEAM_ID, name: "Parity Team", phase: "build", createdAt: NOW },
		{ id: OTHER_TEAM_ID, name: "Other Team", phase: "build", createdAt: NOW },
	]);
	await db.insert(users).values({
		id: AGENT_ID,
		name: "Parity Agent",
		role: AGENT_ROLE,
		status: "active",
		createdAt: NOW,
	});
	await db.insert(threads).values({
		id: `thr-${ROOT_TASK_ID}`,
		hostKind: "team",
		hostId: TEAM_ID,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${ROOT_TASK_ID}`,
		id: ROOT_TASK_ID,
		parentTaskId: null,
		teamId: TEAM_ID,
		title: "I12 parity bet",
		description: "I12 parity bet",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: `thr-${TASK_ID}`,
		hostKind: "team",
		hostId: TEAM_ID,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${TASK_ID}`,
		id: TASK_ID,
		parentTaskId: ROOT_TASK_ID,
		teamId: TEAM_ID,
		title: "I12 parity task",
		description: TASK_DESCRIPTION,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});

	// factory — always included regardless of team/agent.
	await db.insert(knowledgeItems).values({
		id: "item-i12-factory",
		scopeKind: "factory",
		scopeId: null,
		title: "Factory-wide practice",
		body: "Applies to every team and every agent.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-factory",
		knowledgeItemId: "item-i12-factory",
		scopeId: null,
	});

	// team — scoped to TEAM_ID (must be included).
	await db.insert(knowledgeItems).values({
		id: "item-i12-team-in",
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
		id: "proj-i12-team-in",
		knowledgeItemId: "item-i12-team-in",
		scopeId: TEAM_ID,
	});

	// team — scoped to OTHER_TEAM_ID (must be EXCLUDED from a TEAM_ID assembly).
	await db.insert(knowledgeItems).values({
		id: "item-i12-team-out",
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
		id: "proj-i12-team-out",
		knowledgeItemId: "item-i12-team-out",
		scopeId: OTHER_TEAM_ID,
	});

	// user — bound to AGENT_ID (must be included: "its own").
	await db.insert(knowledgeItems).values({
		id: "item-i12-own-in",
		scopeKind: "user",
		scopeId: AGENT_ID,
		title: "The agent's own note",
		body: "Relevant only to this agent.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-own-in",
		knowledgeItemId: "item-i12-own-in",
		scopeId: AGENT_ID,
	});

	// user — bound to a DIFFERENT agent, must be EXCLUDED.
	await db.insert(knowledgeItems).values({
		id: "item-i12-own-out",
		scopeKind: "user",
		scopeId: OTHER_AGENT_ID,
		title: "Someone else's note",
		body: "Not relevant to this agent.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: OTHER_AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-own-out",
		knowledgeItemId: "item-i12-own-out",
		scopeId: OTHER_AGENT_ID,
	});
}

describe("assembleSessionKnowledge — scope-only selection (architecture.md D1)", () => {
	test("returns exactly the expected item-id set for the fixed corpus (budget/scope filter)", async ({
		db,
	}) => {
		await seedFixedCorpus(db);

		const budgeted = await assembleSessionKnowledge(db, {
			teamId: TEAM_ID,
			agentRole: AGENT_ROLE,
			taskDescription: TASK_DESCRIPTION,
			agentId: AGENT_ID,
		});
		const ids = new Set(budgeted.map((item) => item.id));

		// Anchor the actual expected membership — the corpus mixes in-scope and
		// out-of-scope items on purpose (team + agent exclusion), so a
		// coincidental empty-set match can't silently pass.
		expect([...ids].sort()).toEqual(
			["item-i12-team-in", "item-i12-own-in", "item-i12-factory"].sort(),
		);
		expect(ids.has("item-i12-team-out")).toBe(false);
		expect(ids.has("item-i12-own-out")).toBe(false);
	});

	test("each returned item carries the scope that put it in reach", async ({ db }) => {
		await seedFixedCorpus(db);

		const budgeted = await assembleSessionKnowledge(db, {
			teamId: TEAM_ID,
			agentRole: AGENT_ROLE,
			taskDescription: TASK_DESCRIPTION,
			agentId: AGENT_ID,
		});

		const expectedScopeById: Record<string, string> = {
			"item-i12-factory": "factory",
			"item-i12-team-in": "team",
			"item-i12-own-in": "user",
		};

		expect(budgeted.length).toBe(3);
		for (const item of budgeted) {
			expect(item.scopeKind).toBe(expectedScopeById[item.id]);
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
			.where(eq(knowledgeItems.id, "item-i12-team-out"));
		expect(row).toBeDefined();

		const budgeted = await assembleSessionKnowledge(db, {
			teamId: TEAM_ID,
			agentRole: AGENT_ROLE,
			taskDescription: TASK_DESCRIPTION,
			agentId: AGENT_ID,
		});
		const ids = new Set(budgeted.map((item) => item.id));
		expect(ids.has("item-i12-team-out")).toBe(false);
		expect(ids.has("item-i12-own-out")).toBe(false);
		expect(ids.has("item-i12-factory")).toBe(true);
	});
});
