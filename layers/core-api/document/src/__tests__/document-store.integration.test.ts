/**
 * The document store (architecture.md §5.1 search, §4.2 tree invariants,
 * §6.6 cascade read, §6.7 usage counting). Real PGlite via the `{ db }`
 * fixture — no stub of `documents`.
 */
import { documents } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq, inArray } from "drizzle-orm";
import {
	assertParentInvariants,
	assertSlotFree,
	bumpRead,
	bumpSessionUse,
	type DocumentSearchViewer,
	getDocument,
	insertDocument,
	listAncestors,
	listWiderDescendants,
	narrowDescendantScope,
	nextPositionForParent,
	resolveParentChain,
	searchDocumentRows,
	updateDocument,
} from "../document-store.js";
import { docValues } from "./_helpers.js";

/** No `scope: 'user'`/`'team'` rows are visible-by-default fixtures use — every
 * capability test that isn't specifically about visibility uses this viewer
 * against `factory`-scoped rows, where visibility never excludes anything. */
const ANY_VIEWER: DocumentSearchViewer = { subjects: ["viewer-1"], viewerTeamId: null };

describe("search_documents — the one query", () => {
	test("inTree excludes a task-parented row and another person's private memory — exact ids, exact length", async ({
		db,
	}) => {
		const root = await insertDocument(db, docValues({ id: "red-root", title: "Root" }));
		await insertDocument(
			db,
			docValues({ id: "red-artifact", title: "Artifact", parentKind: "task", parentId: "task-1" }),
		);
		await insertDocument(
			db,
			docValues({
				id: "red-private",
				title: "Someone else's note",
				scopeKind: "user",
				scopeId: "someone-else",
				slot: "ordinary",
			}),
		);

		const rows = await searchDocumentRows(db, { inTree: true }, ANY_VIEWER);

		expect(rows.map((r) => r.id)).toEqual([root.id]);
		expect(rows).toHaveLength(1);
	});

	test("ids returns exactly the rows named, regardless of shape", async ({ db }) => {
		const a = await insertDocument(db, docValues({ id: "ids-a" }));
		const b = await insertDocument(db, docValues({ id: "ids-b" }));
		await insertDocument(db, docValues({ id: "ids-c" }));

		const rows = await searchDocumentRows(db, { ids: [a.id, b.id] }, ANY_VIEWER);

		expect(rows.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
	});

	test("text matches title or body via ILIKE", async ({ db }) => {
		const titleHit = await insertDocument(
			db,
			docValues({ id: "text-title", title: "Onboarding Runbook", body: "irrelevant" }),
		);
		const bodyHit = await insertDocument(
			db,
			docValues({ id: "text-body", title: "Something else", body: "the onboarding steps" }),
		);
		await insertDocument(db, docValues({ id: "text-miss", title: "Nope", body: "nothing here" }));

		const rows = await searchDocumentRows(db, { text: "onboard" }, ANY_VIEWER);

		expect(rows.map((r) => r.id).sort()).toEqual([bodyHit.id, titleHit.id].sort());
	});

	// @lore: `%`/`_` are ILIKE wildcards — `text` must match them literally, or a one-character query returns every row.
	test("text escapes ILIKE wildcards — % and _ match literally, not as wildcards", async ({
		db,
	}) => {
		await insertDocument(
			db,
			docValues({ id: "wc-plain", title: "Unrelated title", body: "nothing special" }),
		);
		const percentHit = await insertDocument(
			db,
			docValues({ id: "wc-percent", title: "Discount: 10% off", body: "irrelevant" }),
		);
		const underscoreHit = await insertDocument(
			db,
			docValues({ id: "wc-underscore", title: "snake_case_name", body: "irrelevant" }),
		);

		const percentRows = await searchDocumentRows(db, { text: "%" }, ANY_VIEWER);
		expect(percentRows.map((r) => r.id)).toEqual([percentHit.id]);

		const underscoreRows = await searchDocumentRows(db, { text: "_" }, ANY_VIEWER);
		expect(underscoreRows.map((r) => r.id)).toEqual([underscoreHit.id]);
	});

	test("slot filters to exactly the named slot", async ({ db }) => {
		const skill = await insertDocument(
			db,
			docValues({ id: "slot-skill", parentKind: "agent", parentId: "agent-1", slot: "skill" }),
		);
		await insertDocument(
			db,
			docValues({ id: "slot-rule", parentKind: "agent", parentId: "agent-1", slot: "rule" }),
		);

		const rows = await searchDocumentRows(db, { slot: "skill" }, ANY_VIEWER);

		expect(rows.map((r) => r.id)).toEqual([skill.id]);
	});

	test("status filters to exactly the named status", async ({ db }) => {
		const proposed = await insertDocument(
			db,
			docValues({ id: "status-proposed", status: "proposed" }),
		);
		await insertDocument(db, docValues({ id: "status-active", status: "active" }));

		const rows = await searchDocumentRows(db, { status: "proposed" }, ANY_VIEWER);

		expect(rows.map((r) => r.id)).toEqual([proposed.id]);
	});

	test("scopeKind filters to exactly the named scope", async ({ db }) => {
		const team = await insertDocument(
			db,
			docValues({ id: "scope-team", scopeKind: "team", scopeId: "team-1" }),
		);
		await insertDocument(db, docValues({ id: "scope-factory", scopeKind: "factory" }));

		const rows = await searchDocumentRows(
			db,
			{ scopeKind: "team" },
			{
				subjects: ["viewer-1"],
				viewerTeamId: "team-1",
			},
		);

		expect(rows.map((r) => r.id)).toEqual([team.id]);
	});

	test("parent {kind,id} returns exactly that named parent's children", async ({ db }) => {
		const match = await insertDocument(
			db,
			docValues({
				id: "parent-a",
				parentKind: "subscription",
				parentId: "subscription-1",
				slot: "prompt",
			}),
		);
		await insertDocument(
			db,
			docValues({
				id: "parent-b",
				parentKind: "subscription",
				parentId: "subscription-2",
				slot: "prompt",
			}),
		);

		const rows = await searchDocumentRows(
			db,
			{ parent: { kind: "subscription", id: "subscription-1" } },
			ANY_VIEWER,
		);

		expect(rows.map((r) => r.id)).toEqual([match.id]);
	});

	test("parent {kind,ids} batches multiple named parents in one call", async ({ db }) => {
		const a = await insertDocument(
			db,
			docValues({
				id: "parent-ids-a",
				parentKind: "agent",
				parentId: "agent-a",
				slot: "agent_file",
			}),
		);
		const b = await insertDocument(
			db,
			docValues({
				id: "parent-ids-b",
				parentKind: "agent",
				parentId: "agent-b",
				slot: "agent_file",
			}),
		);
		await insertDocument(
			db,
			docValues({
				id: "parent-ids-c",
				parentKind: "agent",
				parentId: "agent-c",
				slot: "agent_file",
			}),
		);

		const rows = await searchDocumentRows(
			db,
			{ parent: { kind: "agent", ids: ["agent-a", "agent-b"] } },
			ANY_VIEWER,
		);

		expect(rows.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
	});

	test("parent with neither id nor ids throws — a defensive backstop, so an internal caller cannot bypass the declaration's own refusal and run an unbounded parent-kind-only query", async ({
		db,
	}) => {
		await insertDocument(
			db,
			docValues({ id: "parent-no-id", parentKind: "task", parentId: "task-unbounded" }),
		);

		expect(() => searchDocumentRows(db, { parent: { kind: "task" } }, ANY_VIEWER)).toThrow(
			"parent filter must name id or ids",
		);
	});

	describe("as", () => {
		test("as: artifact matches only task/thread-parented rows", async ({ db }) => {
			const artifact = await insertDocument(
				db,
				docValues({ id: "as-artifact", parentKind: "task", parentId: "task-1" }),
			);
			await insertDocument(db, docValues({ id: "as-plain-doc", parentKind: null }));
			await insertDocument(
				db,
				docValues({ id: "as-memory", scopeKind: "user", scopeId: "writer-1", slot: "ordinary" }),
			);

			const rows = await searchDocumentRows(
				db,
				{ as: "artifact" },
				{
					subjects: ["writer-1"],
					viewerTeamId: null,
				},
			);

			expect(rows.map((r) => r.id)).toEqual([artifact.id]);
		});

		test("as: memory matches only ordinary, user-scoped rows", async ({ db }) => {
			await insertDocument(
				db,
				docValues({ id: "as-artifact-2", parentKind: "task", parentId: "task-1" }),
			);
			await insertDocument(db, docValues({ id: "as-plain-doc-2", parentKind: null }));
			const memory = await insertDocument(
				db,
				docValues({ id: "as-memory-2", scopeKind: "user", scopeId: "writer-1", slot: "ordinary" }),
			);

			const rows = await searchDocumentRows(
				db,
				{ as: "memory" },
				{
					subjects: ["writer-1"],
					viewerTeamId: null,
				},
			);

			expect(rows.map((r) => r.id)).toEqual([memory.id]);
		});

		test("as: memory excludes a user-scoped, ordinary-slot row that is ALSO task-parented — an artifact, not a memory", async ({
			db,
		}) => {
			const artifactShapedLikeMemory = await insertDocument(
				db,
				docValues({
					id: "as-memory-artifact-shape",
					scopeKind: "user",
					scopeId: "writer-1",
					slot: "ordinary",
					parentKind: "task",
					parentId: "task-1",
				}),
			);
			const memory = await insertDocument(
				db,
				docValues({ id: "as-memory-4", scopeKind: "user", scopeId: "writer-1", slot: "ordinary" }),
			);

			const rows = await searchDocumentRows(
				db,
				{ as: "memory" },
				{ subjects: ["writer-1"], viewerTeamId: null },
			);

			expect(rows.map((r) => r.id)).not.toContain(artifactShapedLikeMemory.id);
			expect(rows.map((r) => r.id)).toEqual([memory.id]);
		});

		test("as: memory excludes a user-scoped, parentless row with a non-ordinary slot — review-found defect: that shape reads as PUBLIC (visibilityPredicate's non-ordinary-slot exemption), so `as` must agree and call it a document, not a memory", async ({
			db,
		}) => {
			const publicShapedLikeMemory = await insertDocument(
				db,
				docValues({
					id: "as-memory-public-slot",
					scopeKind: "user",
					scopeId: "writer-1",
					slot: "skill",
					parentKind: null,
				}),
			);
			const memory = await insertDocument(
				db,
				docValues({ id: "as-memory-5", scopeKind: "user", scopeId: "writer-1", slot: "ordinary" }),
			);

			const asMemory = await searchDocumentRows(
				db,
				{ as: "memory" },
				{ subjects: ["writer-1"], viewerTeamId: null },
			);
			expect(asMemory.map((r) => r.id)).not.toContain(publicShapedLikeMemory.id);
			expect(asMemory.map((r) => r.id)).toEqual([memory.id]);

			const asDocument = await searchDocumentRows(
				db,
				{ as: "document" },
				{ subjects: ["writer-1"], viewerTeamId: null },
			);
			expect(asDocument.map((r) => r.id)).toContain(publicShapedLikeMemory.id);
		});

		test("as: document includes a user-scoped row that HAS a parent — a private document, not a memory (gate-walk finding, founder decision: a memory is a user-scoped row with no parent)", async ({
			db,
		}) => {
			const folder = await insertDocument(db, docValues({ id: "as-folder", parentKind: null }));
			const privateInTree = await insertDocument(
				db,
				docValues({
					id: "as-private-doc",
					scopeKind: "user",
					scopeId: "writer-1",
					slot: "ordinary",
					parentKind: "document",
					parentId: folder.id,
				}),
			);

			const asDocument = await searchDocumentRows(
				db,
				{ as: "document" },
				{ subjects: ["writer-1"], viewerTeamId: null },
			);
			expect(asDocument.map((r) => r.id)).toContain(privateInTree.id);

			const asMemory = await searchDocumentRows(
				db,
				{ as: "memory" },
				{ subjects: ["writer-1"], viewerTeamId: null },
			);
			expect(asMemory.map((r) => r.id)).not.toContain(privateInTree.id);
		});

		test("as: document matches everything else, including a NULL-parent root", async ({ db }) => {
			await insertDocument(
				db,
				docValues({ id: "as-artifact-3", parentKind: "task", parentId: "task-1" }),
			);
			const plainDoc = await insertDocument(
				db,
				docValues({ id: "as-plain-doc-3", parentKind: null }),
			);
			await insertDocument(
				db,
				docValues({ id: "as-memory-3", scopeKind: "user", scopeId: "writer-1", slot: "ordinary" }),
			);

			const rows = await searchDocumentRows(
				db,
				{ as: "document" },
				{
					subjects: ["writer-1"],
					viewerTeamId: null,
				},
			);

			expect(rows.map((r) => r.id)).toEqual([plainDoc.id]);
		});
	});

	describe("unusedSince", () => {
		test("matches a never-used document by falling back to its created date", async ({ db }) => {
			const old = await insertDocument(
				db,
				docValues({
					id: "unused-old",
					createdAt: "2020-01-01T00:00:00.000Z",
					updatedAt: "2020-01-01T00:00:00.000Z",
				}),
			);
			await insertDocument(
				db,
				docValues({
					id: "unused-recent",
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				}),
			);

			const rows = await searchDocumentRows(
				db,
				{ unusedSince: "2025-01-01T00:00:00.000Z" },
				ANY_VIEWER,
			);

			const ids = rows.map((r) => r.id);
			expect(ids).toContain(old.id);
			expect(ids).not.toContain("unused-recent");
		});

		test("excludes a document read after the cutoff even though it was created long ago", async ({
			db,
		}) => {
			const doc = await insertDocument(
				db,
				docValues({
					id: "unused-but-read",
					createdAt: "2020-01-01T00:00:00.000Z",
					updatedAt: "2020-01-01T00:00:00.000Z",
				}),
			);
			await bumpRead(db, doc.id, "2026-05-05T00:00:00.000Z");

			const rows = await searchDocumentRows(
				db,
				{ unusedSince: "2025-01-01T00:00:00.000Z" },
				ANY_VIEWER,
			);

			expect(rows.map((r) => r.id)).not.toContain(doc.id);
		});
	});

	describe("sort", () => {
		test("least_used orders by COALESCE(last_used_at, created_at) ascending", async ({ db }) => {
			const usedRecently = await insertDocument(
				db,
				docValues({
					id: "sort-lu-used",
					createdAt: "2024-01-01T00:00:00.000Z",
					updatedAt: "2024-01-01T00:00:00.000Z",
				}),
			);
			const neverUsedOld = await insertDocument(
				db,
				docValues({
					id: "sort-lu-old",
					createdAt: "2023-01-01T00:00:00.000Z",
					updatedAt: "2023-01-01T00:00:00.000Z",
				}),
			);
			await bumpSessionUse(db, [usedRecently.id], "2026-06-06T00:00:00.000Z");

			const rows = await searchDocumentRows(
				db,
				{ ids: [usedRecently.id, neverUsedOld.id], sort: "least_used" },
				ANY_VIEWER,
			);

			expect(rows.map((r) => r.id)).toEqual([neverUsedOld.id, usedRecently.id]);
		});

		test("most_read orders by read_count descending", async ({ db }) => {
			const readTwice = await insertDocument(db, docValues({ id: "sort-mr-two" }));
			const readOnce = await insertDocument(db, docValues({ id: "sort-mr-one" }));
			await bumpRead(db, readTwice.id, "2026-01-01T00:00:00.000Z");
			await bumpRead(db, readTwice.id, "2026-01-02T00:00:00.000Z");
			await bumpRead(db, readOnce.id, "2026-01-01T00:00:00.000Z");

			const rows = await searchDocumentRows(
				db,
				{ ids: [readTwice.id, readOnce.id], sort: "most_read" },
				ANY_VIEWER,
			);

			expect(rows.map((r) => r.id)).toEqual([readTwice.id, readOnce.id]);
		});
	});

	describe("visibility", () => {
		test("a writer sees their own private memory", async ({ db }) => {
			const memory = await insertDocument(
				db,
				docValues({ id: "vis-writer", scopeKind: "user", scopeId: "writer-1", slot: "ordinary" }),
			);

			const rows = await searchDocumentRows(db, {}, { subjects: ["writer-1"], viewerTeamId: null });

			expect(rows.map((r) => r.id)).toContain(memory.id);
		});

		test("the owner of the writing agent sees the agent's memory", async ({ db }) => {
			const memory = await insertDocument(
				db,
				docValues({
					id: "vis-agent-memory",
					scopeKind: "user",
					scopeId: "agent-1",
					slot: "ordinary",
				}),
			);

			const rows = await searchDocumentRows(
				db,
				{},
				{
					subjects: ["owner-1", "agent-1"],
					viewerTeamId: null,
				},
			);

			expect(rows.map((r) => r.id)).toContain(memory.id);
		});

		test("a stranger cannot see another person's private memory", async ({ db }) => {
			const memory = await insertDocument(
				db,
				docValues({ id: "vis-stranger", scopeKind: "user", scopeId: "writer-1", slot: "ordinary" }),
			);

			const rows = await searchDocumentRows(
				db,
				{},
				{ subjects: ["stranger-1"], viewerTeamId: null },
			);

			expect(rows.map((r) => r.id)).not.toContain(memory.id);
		});

		test("a team-scoped document is excluded for a viewer outside that team, included for a member", async ({
			db,
		}) => {
			const teamDoc = await insertDocument(
				db,
				docValues({ id: "vis-team-doc", scopeKind: "team", scopeId: "team-1" }),
			);

			const outsiderRows = await searchDocumentRows(
				db,
				{},
				{ subjects: ["u-outsider"], viewerTeamId: "team-2" },
			);
			expect(outsiderRows.map((r) => r.id)).not.toContain(teamDoc.id);

			const memberRows = await searchDocumentRows(
				db,
				{},
				{ subjects: ["u-member"], viewerTeamId: "team-1" },
			);
			expect(memberRows.map((r) => r.id)).toContain(teamDoc.id);
		});

		test("an artifact is never private — visible to a viewer on a different team with no matching subject", async ({
			db,
		}) => {
			const artifact = await insertDocument(
				db,
				docValues({
					id: "vis-artifact",
					parentKind: "task",
					parentId: "task-shared",
					scopeKind: "team",
					scopeId: "team-other",
				}),
			);

			const rows = await searchDocumentRows(
				db,
				{ parent: { kind: "task", id: "task-shared" } },
				{ subjects: ["nobody"], viewerTeamId: "team-mine" },
			);

			expect(rows.map((r) => r.id)).toContain(artifact.id);
		});
	});
});

describe("ancestor chain", () => {
	test("listAncestors returns full rows, root first, stopping at the first non-document parent", async ({
		db,
	}) => {
		const root = await insertDocument(db, docValues({ id: "anc-root", title: "Root" }));
		const mid = await insertDocument(
			db,
			docValues({ id: "anc-mid", title: "Mid", parentKind: "document", parentId: root.id }),
		);
		const leaf = await insertDocument(
			db,
			docValues({ id: "anc-leaf", title: "Leaf", parentKind: "document", parentId: mid.id }),
		);

		const ancestors = await listAncestors(db, leaf.id);

		expect(ancestors.map((a) => a.id)).toEqual([root.id, mid.id]);
		expect(ancestors[0]?.title).toBe("Root");
	});

	test("resolveParentChain matches listAncestors' ids, root first", async ({ db }) => {
		const root = await insertDocument(db, docValues({ id: "rpc-root" }));
		const child = await insertDocument(
			db,
			docValues({ id: "rpc-child", parentKind: "document", parentId: root.id }),
		);

		const chain = await resolveParentChain(db, child.id);

		expect(chain.map((a) => a.id)).toEqual([root.id]);
	});

	// Moved from the deleted `knowledge-parent-chain.integration.test.ts` (B21)
	// — the two edge cases the "matches listAncestors" case above doesn't pin.
	test("resolveParentChain is empty for a root item", async ({ db }) => {
		const solo = await insertDocument(db, docValues({ id: "rpc-solo" }));
		const chain = await resolveParentChain(db, solo.id);
		expect(chain).toEqual([]);
	});

	test("resolveParentChain stops at a non-document parent — a task-parented item has no ancestors", async ({
		db,
	}) => {
		const taskChild = await insertDocument(
			db,
			docValues({ id: "rpc-task-child", parentKind: "task", parentId: "some-task-id" }),
		);
		const chain = await resolveParentChain(db, taskChild.id);
		expect(chain).toEqual([]);
	});
});

describe("cycle/depth/slot/scope checks", () => {
	test("assertParentInvariants throws cycle when reparenting a root under its own descendant", async ({
		db,
	}) => {
		const root = await insertDocument(db, docValues({ id: "inv-cycle-root" }));
		const child = await insertDocument(
			db,
			docValues({ id: "inv-cycle-child", parentKind: "document", parentId: root.id }),
		);

		await expect(
			assertParentInvariants(db, {
				documentId: root.id,
				newParentId: child.id,
				childScopeKind: "factory",
			}),
		).rejects.toMatchObject({ code: "cycle" });
	});

	test("assertParentInvariants throws depth_exceeded past 32 levels", async ({ db }) => {
		let parentId: string | null = null;
		for (let level = 0; level < 32; level++) {
			const created = await insertDocument(
				db,
				docValues({
					id: `inv-depth-${level}`,
					parentKind: parentId ? "document" : null,
					parentId,
				}),
			);
			parentId = created.id;
		}

		await expect(
			assertParentInvariants(db, {
				newParentId: parentId as string,
				childScopeKind: "factory",
			}),
		).rejects.toMatchObject({ code: "depth_exceeded" });
	});

	test("assertParentInvariants throws scope_too_wide when the child is wider than the parent", async ({
		db,
	}) => {
		const parent = await insertDocument(
			db,
			docValues({ id: "inv-scope-parent", scopeKind: "team", scopeId: "team-1" }),
		);

		await expect(
			assertParentInvariants(db, {
				newParentId: parent.id,
				childScopeKind: "factory",
			}),
		).rejects.toMatchObject({ code: "scope_too_wide" });
	});

	test("assertParentInvariants throws parent_not_found for a missing document parent", async ({
		db,
	}) => {
		await expect(
			assertParentInvariants(db, { newParentId: "inv-does-not-exist", childScopeKind: "factory" }),
		).rejects.toMatchObject({ code: "parent_not_found" });
	});

	test("assertSlotFree throws slot_taken when the named slot is already occupied", async ({
		db,
	}) => {
		await insertDocument(
			db,
			docValues({
				id: "inv-slot-taken",
				parentKind: "subscription",
				parentId: "subscription-slot-1",
				slot: "prompt",
			}),
		);

		await expect(
			assertSlotFree(db, "subscription", "subscription-slot-1", "prompt"),
		).rejects.toMatchObject({
			code: "slot_taken",
		});
	});

	test("assertSlotFree resolves when the slot is free", async ({ db }) => {
		await expect(
			assertSlotFree(db, "subscription", "subscription-slot-2", "prompt"),
		).resolves.toBeUndefined();
	});

	test("nextPositionForParent appends after the current max position among siblings", async ({
		db,
	}) => {
		const parent = await insertDocument(db, docValues({ id: "pos-parent" }));
		await insertDocument(
			db,
			docValues({ id: "pos-child-1", parentKind: "document", parentId: parent.id, position: 0 }),
		);
		await insertDocument(
			db,
			docValues({ id: "pos-child-2", parentKind: "document", parentId: parent.id, position: 1 }),
		);

		const next = await nextPositionForParent(db, "document", parent.id);

		expect(next).toBe(2);
	});

	// Moved from the deleted `knowledge-tree-invariants.integration.test.ts`
	// (B21) — siblings order by position then title (architecture.md §5.1):
	// same position (both created at the tree's default, 0) falls through to
	// title order, not insertion order — "Zebra" is inserted first here.
	test("searchDocumentRows orders same-position siblings by title", async ({ db }) => {
		const parent = await insertDocument(db, docValues({ id: "order-parent" }));
		await insertDocument(
			db,
			docValues({
				id: "order-zebra",
				title: "Zebra",
				parentKind: "document",
				parentId: parent.id,
				position: 0,
			}),
		);
		await insertDocument(
			db,
			docValues({
				id: "order-apple",
				title: "Apple",
				parentKind: "document",
				parentId: parent.id,
				position: 0,
			}),
		);

		const rows = await searchDocumentRows(
			db,
			{ parent: { kind: "document", id: parent.id } },
			ANY_VIEWER,
		);

		expect(rows.map((r) => r.title)).toEqual(["Apple", "Zebra"]);
	});
});

describe("listWiderDescendants", () => {
	test("returns only wider descendants at any depth, including archived and slotted children; skips an already-narrow branch's own rank but still walks past it", async ({
		db,
	}) => {
		const root = await insertDocument(db, docValues({ id: "casc-root", scopeKind: "factory" }));
		const widerChild = await insertDocument(
			db,
			docValues({
				id: "casc-wide-child",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "factory",
			}),
		);
		const narrowChild = await insertDocument(
			db,
			docValues({
				id: "casc-narrow-child",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "user",
				scopeId: "someone",
			}),
		);
		const grandchildUnderNarrow = await insertDocument(
			db,
			docValues({
				id: "casc-grandchild",
				parentKind: "document",
				parentId: narrowChild.id,
				scopeKind: "factory",
			}),
		);
		const archivedChild = await insertDocument(
			db,
			docValues({
				id: "casc-archived",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "factory",
				status: "archived",
			}),
		);
		const slottedChild = await insertDocument(
			db,
			docValues({
				id: "casc-slotted",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "factory",
				slot: "skill",
			}),
		);

		const wider = await listWiderDescendants(db, root.id, "team");
		const ids = wider.map((r) => r.id).sort();

		expect(ids).toEqual(
			[widerChild.id, grandchildUnderNarrow.id, archivedChild.id, slottedChild.id].sort(),
		);
		expect(ids).not.toContain(narrowChild.id);
	});
});

describe("narrowDescendantScope", () => {
	test("clamps both scope columns and bumps version, leaving an untouched id's row alone", async ({
		db,
	}) => {
		const clamped = await insertDocument(
			db,
			docValues({ id: "narrow-clamped", scopeKind: "factory", scopeId: null }),
		);
		const untouched = await insertDocument(
			db,
			docValues({ id: "narrow-untouched", scopeKind: "factory", scopeId: null }),
		);

		await narrowDescendantScope(
			db,
			[clamped.id],
			"team",
			"team-narrow-1",
			"2026-07-07T00:00:00.000Z",
		);

		const clampedRow = await getDocument(db, clamped.id);
		expect(clampedRow?.scopeKind).toBe("team");
		expect(clampedRow?.scopeId).toBe("team-narrow-1");
		expect(clampedRow?.version).toBe(clamped.version + 1);
		expect(clampedRow?.updatedAt).toBe("2026-07-07T00:00:00.000Z");

		const untouchedRow = await getDocument(db, untouched.id);
		expect(untouchedRow?.scopeKind).toBe("factory");
		expect(untouchedRow?.version).toBe(untouched.version);
	});

	test("batches every id named in one call", async ({ db }) => {
		const a = await insertDocument(db, docValues({ id: "narrow-batch-a", scopeKind: "factory" }));
		const b = await insertDocument(db, docValues({ id: "narrow-batch-b", scopeKind: "factory" }));

		await narrowDescendantScope(db, [a.id, b.id], "user", "user-1", "2026-07-08T00:00:00.000Z");

		const rowA = await getDocument(db, a.id);
		const rowB = await getDocument(db, b.id);
		expect(rowA?.scopeKind).toBe("user");
		expect(rowA?.scopeId).toBe("user-1");
		expect(rowB?.scopeKind).toBe("user");
		expect(rowB?.scopeId).toBe("user-1");
	});

	test("an empty id list is a no-op", async ({ db }) => {
		await expect(
			narrowDescendantScope(db, [], "team", "team-x", "2026-07-09T00:00:00.000Z"),
		).resolves.toBeUndefined();
	});
});

describe("getDocument", () => {
	test("reads a row by raw id, unfiltered by visibility", async ({ db }) => {
		await insertDocument(
			db,
			docValues({ id: "raw-get", scopeKind: "user", scopeId: "someone-else", slot: "ordinary" }),
		);

		const row = await getDocument(db, "raw-get");

		expect(row?.id).toBe("raw-get");
	});

	test("returns null for a missing id", async ({ db }) => {
		expect(await getDocument(db, "raw-get-missing")).toBeNull();
	});
});

describe("updateDocument — the transactional write shape", () => {
	test("applies a version-guarded patch, bumping version and updatedAt", async ({ db }) => {
		const doc = await insertDocument(db, docValues({ id: "write-ok", title: "Before" }));

		const updated = await updateDocument(
			db,
			doc.id,
			doc.version,
			{ title: "After", updatedBy: "editor-1" },
			"2026-04-04T00:00:00.000Z",
		);

		expect(updated?.title).toBe("After");
		expect(updated?.version).toBe(doc.version + 1);
		expect(updated?.updatedAt).toBe("2026-04-04T00:00:00.000Z");
	});

	test("returns null when the version does not match", async ({ db }) => {
		const doc = await insertDocument(db, docValues({ id: "write-stale" }));

		const result = await updateDocument(
			db,
			doc.id,
			doc.version + 1,
			{ title: "x", updatedBy: "editor-1" },
			"2026-04-04T00:00:00.000Z",
		);

		expect(result).toBeNull();
	});
});

describe("usage counting", () => {
	test("bumpRead increments read_count and last_read_at, leaving version and updatedAt untouched", async ({
		db,
	}) => {
		const doc = await insertDocument(db, docValues({ id: "use-read" }));

		await bumpRead(db, doc.id, "2026-02-02T00:00:00.000Z");

		const [row] = await db.select().from(documents).where(eq(documents.id, doc.id)).limit(1);
		expect(row?.readCount).toBe(1);
		expect(row?.lastReadAt).toBe("2026-02-02T00:00:00.000Z");
		expect(row?.version).toBe(doc.version);
		expect(row?.updatedAt).toBe(doc.updatedAt);
	});

	test("bumpSessionUse increments session_use_count and last_used_at for every id in one batch, leaving version and updatedAt untouched", async ({
		db,
	}) => {
		const a = await insertDocument(db, docValues({ id: "use-session-a" }));
		const b = await insertDocument(db, docValues({ id: "use-session-b" }));

		await bumpSessionUse(db, [a.id, b.id], "2026-03-03T00:00:00.000Z");

		const rows = await db
			.select()
			.from(documents)
			.where(inArray(documents.id, [a.id, b.id]));
		for (const row of rows) {
			expect(row.sessionUseCount).toBe(1);
			expect(row.lastUsedAt).toBe("2026-03-03T00:00:00.000Z");
		}
		const refetchedA = rows.find((r) => r.id === a.id);
		expect(refetchedA?.version).toBe(a.version);
		expect(refetchedA?.updatedAt).toBe(a.updatedAt);
	});
});
