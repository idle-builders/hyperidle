/**
 * Exercises `@hyperidle/document`'s `assembleSessionDocuments` against a
 * fixed corpus (two teams, one agent-bound item, one factory-wide item) so a
 * genuine relocation bug (wrong scope) shows up as a set mismatch against the
 * hardcoded expected membership below.
 *
 * @lore: what an agent receives — collapses onto scope alone; no budget or cutoff to exercise, every scope-selected item is returned.
 */

import { documents, type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import { assembleSessionDocuments } from "@hyperidle/document";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

const NOW = "2026-07-31T00:00:00.000Z";
const TEAM_ID = "team-doc-parity";
const OTHER_TEAM_ID = "team-doc-other";
const AGENT_ID = "agent-doc-parity";
const OTHER_AGENT_ID = "agent-doc-other";
const AGENT_ROLE = "builder";
const TASK_ID = "task-doc-parity";
const ROOT_TASK_ID = "bet-doc-parity";
const TASK_DESCRIPTION = "Ship the boundary seam parity check.";

async function seedFixedCorpus(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values([
		{ id: TEAM_ID, name: "Parity Team", createdAt: NOW },
		{ id: OTHER_TEAM_ID, name: "Other Team", createdAt: NOW },
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
		title: "Doc parity bet",
		description: "Doc parity bet",
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
		title: "Doc parity task",
		description: TASK_DESCRIPTION,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});

	// factory — always included regardless of team/agent.
	await db.insert(documents).values({
		id: "item-factory",
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

	// team — scoped to TEAM_ID (must be included).
	await db.insert(documents).values({
		id: "item-team-in",
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

	// team — scoped to OTHER_TEAM_ID (must be EXCLUDED from a TEAM_ID assembly).
	await db.insert(documents).values({
		id: "item-team-out",
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

	// user — bound to AGENT_ID (must be included: "its own").
	await db.insert(documents).values({
		id: "item-own-in",
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

	// user — bound to a DIFFERENT agent, must be EXCLUDED.
	await db.insert(documents).values({
		id: "item-own-out",
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
}

describe("assembleSessionDocuments — scope-only selection", () => {
	test("returns exactly the expected item-id set for the fixed corpus (scope filter)", async ({
		db,
	}) => {
		await seedFixedCorpus(db);

		const assembled = await assembleSessionDocuments(db, {
			teamId: TEAM_ID,
			taskDescription: TASK_DESCRIPTION,
			agentId: AGENT_ID,
		});
		const ids = new Set(assembled.map((item) => item.id));

		// Anchor the actual expected membership — the corpus mixes in-scope and
		// out-of-scope items on purpose (team + agent exclusion), so a
		// coincidental empty-set match can't silently pass.
		expect([...ids].sort()).toEqual(["item-team-in", "item-own-in", "item-factory"].sort());
		expect(ids.has("item-team-out")).toBe(false);
		expect(ids.has("item-own-out")).toBe(false);
	});

	test("each returned item carries the scope that put it in reach", async ({ db }) => {
		await seedFixedCorpus(db);

		const assembled = await assembleSessionDocuments(db, {
			teamId: TEAM_ID,
			taskDescription: TASK_DESCRIPTION,
			agentId: AGENT_ID,
		});

		const expectedScopeById: Record<string, string> = {
			"item-factory": "factory",
			"item-team-in": "team",
			"item-own-in": "user",
		};

		expect(assembled.length).toBe(3);
		for (const item of assembled) {
			expect(item.scopeKind).toBe(expectedScopeById[item.id]);
		}
	});

	test("sanity check: assembleSessionDocuments genuinely excludes out-of-scope items (not a vacuous corpus)", async ({
		db,
	}) => {
		await seedFixedCorpus(db);

		// Confirm the seeded corpus really does contain the out-of-scope rows
		// (a fixture sanity guard — the exclusion below would be vacuous if
		// these rows didn't exist).
		const [row] = await db
			.select({ id: documents.id })
			.from(documents)
			.where(eq(documents.id, "item-team-out"));
		expect(row).toBeDefined();

		const assembled = await assembleSessionDocuments(db, {
			teamId: TEAM_ID,
			taskDescription: TASK_DESCRIPTION,
			agentId: AGENT_ID,
		});
		const ids = new Set(assembled.map((item) => item.id));
		expect(ids.has("item-team-out")).toBe(false);
		expect(ids.has("item-own-out")).toBe(false);
		expect(ids.has("item-factory")).toBe(true);
	});
});
