/**
 * nested-knowledge-items — tree reads (architecture.md §4).
 *
 * The tree read excludes any row whose `parent_kind` is not `knowledge_item`
 * — today's live population of such rows is agent identities
 * (`parent_kind='agent'`, `role='agent_file'`) and routine prompts
 * (`parent_kind='routine'`, `role='prompt'`), both shipped by PR #545 (0077)
 * and both rendering in `KnowledgeList` today via the (soon deleted)
 * `role !== 'skill' && role !== 'rule'` filter.
 *
 * Visibility: a team-scoped branch is invisible to a viewer outside that
 * team, children included. The viewer's team arrives as a parameter — the
 * knowledge service may not join to `users` (table ownership,
 * tools/governance/table-owners.json).
 *
 * @lore RED phase (nested-knowledge-items): no tree-read variant exists on
 * `list()` yet. This file calls `list(db, { tree: { viewerTeamId } })`,
 * which is not a legal overload today — the smallest, most consistent-with-
 * existing-style shape for the green phase to implement. The `@ts-expect-error`
 * markers are the red signal for that gap; the call itself still executes at
 * runtime (falls through the discriminated union's base-filter branch) so the
 * resulting (wrong) rows can be asserted against.
 */
import { knowledgeItems } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { create, list } from "../knowledge-repository.js";

describe("nested-knowledge-items: tree reads", () => {
	test("excludes items whose parent_kind is not 'knowledge_item' — agent identities and routine prompts never appear", async ({
		db,
	}) => {
		const ordinary = await create(db, {
			layer: null,
			title: "Ordinary root",
			body: "b",
			format: "markdown",
			status: "active",
			updatedBy: "u-1",
		});

		await db.insert(knowledgeItems).values({
			id: "ki_af_agent-1",
			scopeKind: "user",
			scopeId: "agent-1",
			title: "Agent One — identity",
			body: "I am Agent One.",
			format: "markdown",
			status: "active",
			version: 1,
			role: "agent_file",
			parentKind: "agent",
			parentId: "agent-1",
			updatedBy: "u-1",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		await db.insert(knowledgeItems).values({
			id: "ki_rp_routine-1",
			scopeKind: "factory",
			scopeId: null,
			title: "Routine One — prompt",
			body: "Do the thing.",
			format: "markdown",
			status: "active",
			version: 1,
			role: "prompt",
			parentKind: "routine",
			parentId: "routine-1",
			updatedBy: "u-1",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		// @ts-expect-error — list() has no 'tree' discriminant yet (RED phase)
		const treeItems = await list(db, { tree: { viewerTeamId: null } });
		const ids = treeItems.map((i: { id: string }) => i.id);

		expect(ids).toContain(ordinary.id);
		expect(ids).not.toContain("ki_af_agent-1");
		expect(ids).not.toContain("ki_rp_routine-1");
	});

	test("a team-scoped branch is absent for a viewer outside that team, children included", async ({
		db,
	}) => {
		const teamRoot = await create(db, {
			layer: null,
			title: "Team-1 root",
			body: "b",
			format: "markdown",
			status: "active",
			updatedBy: "u-1",
			scopeKind: "team",
			scopeId: "team-1",
		});
		const teamChild = await create(db, {
			layer: null,
			title: "Team-1 child",
			body: "b",
			format: "markdown",
			status: "active",
			updatedBy: "u-1",
			scopeKind: "team",
			scopeId: "team-1",
			parentKind: "knowledge_item",
			parentId: teamRoot.id,
		});

		// @ts-expect-error — list() has no 'tree' discriminant yet (RED phase)
		const forOutsider = await list(db, { tree: { viewerTeamId: "team-2" } });
		const outsiderIds = forOutsider.map((i: { id: string }) => i.id);
		expect(outsiderIds).not.toContain(teamRoot.id);
		expect(outsiderIds).not.toContain(teamChild.id);

		// @ts-expect-error — list() has no 'tree' discriminant yet (RED phase)
		const forMember = await list(db, { tree: { viewerTeamId: "team-1" } });
		const memberIds = forMember.map((i: { id: string }) => i.id);
		expect(memberIds).toContain(teamRoot.id);
		expect(memberIds).toContain(teamChild.id);
	});
});
