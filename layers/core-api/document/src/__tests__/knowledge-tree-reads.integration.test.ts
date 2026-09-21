/**
 * Knowledge tree reads (architecture.md §4).
 *
 * The tree read excludes any row whose `parent_kind` is not `document`
 * — today's live population of such rows is agent identities
 * (`parent_kind='agent'`, `slot='agent_file'`) and routine prompts
 * (`parent_kind='routine'`, `slot='prompt'`), both shipped by PR #545 (0077)
 * and both rendering in `KnowledgeList` today via the (soon deleted)
 * `role !== 'skill' && role !== 'rule'` filter.
 *
 * Visibility: a team-scoped branch is invisible to a viewer outside that
 * team, children included. The viewer's team arrives as a parameter — the
 * knowledge service may not join to `users` (table ownership,
 * tools/governance/table-owners.json). `GET /api/knowledge` and
 * `GET /knowledge/:id`'s children read both call this same `{tree}` /
 * `{childrenOf}` variant (review.md B2/B3) — this is not a dead read.
 */
import { documents } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { create, list } from "../knowledge-repository.js";

describe("knowledge tree reads (architecture.md §4)", () => {
	test("excludes items whose parent_kind is not 'document' — agent identities and routine prompts never appear", async ({
		db,
	}) => {
		const ordinary = await create(db, {
			title: "Ordinary root",
			body: "b",
			format: "markdown",
			status: "active",
			updatedBy: "u-1",
		});

		await db.insert(documents).values({
			id: "ki_af_agent-1",
			scopeKind: "user",
			scopeId: "agent-1",
			title: "Agent One — identity",
			body: "I am Agent One.",
			format: "markdown",
			status: "active",
			version: 1,
			slot: "agent_file",
			parentKind: "agent",
			parentId: "agent-1",
			updatedBy: "u-1",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		await db.insert(documents).values({
			id: "ki_rp_routine-1",
			scopeKind: "factory",
			scopeId: null,
			title: "Routine One — prompt",
			body: "Do the thing.",
			format: "markdown",
			status: "active",
			version: 1,
			slot: "prompt",
			parentKind: "routine",
			parentId: "routine-1",
			updatedBy: "u-1",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		const treeItems = await list(db, { tree: { viewerUserId: "u-1", viewerTeamId: null } });
		const ids = treeItems.map((i: { id: string }) => i.id);

		expect(ids).toContain(ordinary.id);
		expect(ids).not.toContain("ki_af_agent-1");
		expect(ids).not.toContain("ki_rp_routine-1");
	});

	test("a team-scoped branch is absent for a viewer outside that team, children included", async ({
		db,
	}) => {
		const teamRoot = await create(db, {
			title: "Team-1 root",
			body: "b",
			format: "markdown",
			status: "active",
			updatedBy: "u-1",
			scopeKind: "team",
			scopeId: "team-1",
		});
		const teamChild = await create(db, {
			title: "Team-1 child",
			body: "b",
			format: "markdown",
			status: "active",
			updatedBy: "u-1",
			scopeKind: "team",
			scopeId: "team-1",
			parentKind: "document",
			parentId: teamRoot.id,
		});

		const forOutsider = await list(db, { tree: { viewerUserId: "u-1", viewerTeamId: "team-2" } });
		const outsiderIds = forOutsider.map((i: { id: string }) => i.id);
		expect(outsiderIds).not.toContain(teamRoot.id);
		expect(outsiderIds).not.toContain(teamChild.id);

		const forMember = await list(db, { tree: { viewerUserId: "u-1", viewerTeamId: "team-1" } });
		const memberIds = forMember.map((i: { id: string }) => i.id);
		expect(memberIds).toContain(teamRoot.id);
		expect(memberIds).toContain(teamChild.id);
	});

	test("a user-scoped item stays private to its author (Q2), same {tree} read as the team check", async ({
		db,
	}) => {
		const mine = await create(db, {
			title: "My private note",
			body: "b",
			format: "markdown",
			status: "active",
			updatedBy: "u-1",
			scopeKind: "user",
		});
		const theirs = await create(db, {
			title: "Their private note",
			body: "b",
			format: "markdown",
			status: "active",
			updatedBy: "u-2",
			scopeKind: "user",
		});

		const forViewer = await list(db, { tree: { viewerUserId: "u-1", viewerTeamId: null } });
		const ids = forViewer.map((i: { id: string }) => i.id);
		expect(ids).toContain(mine.id);
		expect(ids).not.toContain(theirs.id);
	});
});
