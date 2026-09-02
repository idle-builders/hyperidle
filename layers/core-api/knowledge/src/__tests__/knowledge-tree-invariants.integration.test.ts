/**
 * nested-knowledge-items — tree invariants (architecture.md §3, §7 D5).
 *
 * Three rules must hold on every write that sets a parent, checked INSIDE the
 * same transaction as the write (architecture §3):
 *   1. No cycle — self-parent and reparenting under a descendant are rejected.
 *   2. Scope no wider than the parent's (factory > team > user), only when
 *      parent_kind = 'knowledge_item'.
 *   3. Depth <= 32.
 * Plus: scope narrowing on a parent cascades to its subtree (D5), and
 * `position` defaults to creation order within a parent.
 *
 * @lore RED phase (nested-knowledge-items): `reparent()` does not exist yet —
 * today nothing can change an existing item's parent at all
 * (`UpdateKnowledgeItemInput` has no parentKind/parentId field), so the
 * cycle-focused tests below import a function this package does not yet
 * export. That import failure IS the red signal for those cases; every other
 * case in this file fails on a real assertion against the current `create()`/
 * `update()` behaviour (which does not validate parent invariants at all).
 */
import { knowledgeItems } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq, sql } from "drizzle-orm";
// @lore RED phase: this export does not exist yet — see file header. The
// green-phase implementation owns choosing the real signature; this is the
// smallest one that lets every cycle/depth-via-move case in this file be
// expressed.
// @ts-expect-error — reparent does not exist on knowledge-repository.js yet (RED phase)
import { create, reparent, update } from "../knowledge-repository.js";

describe("nested-knowledge-items: tree invariants", () => {
	describe("cycle rejection", () => {
		test("self-parent is rejected", async ({ db }) => {
			const item = await create(db, {
				layer: null,
				title: "Root",
				body: "root body",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
			});

			await expect(
				reparent(db, item.id, {
					parentKind: "knowledge_item",
					parentId: item.id,
					updatedBy: "u-1",
				}),
			).rejects.toThrow();
		});

		test("reparenting a node under its own descendant is rejected", async ({ db }) => {
			const grandparent = await create(db, {
				layer: null,
				title: "Grandparent",
				body: "gp",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
			});
			const parent = await create(db, {
				layer: null,
				title: "Parent",
				body: "p",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
				parentKind: "knowledge_item",
				parentId: grandparent.id,
			});
			const child = await create(db, {
				layer: null,
				title: "Child",
				body: "c",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
				parentKind: "knowledge_item",
				parentId: parent.id,
			});

			// Reparenting the grandparent under its own grandchild is a cycle.
			await expect(
				reparent(db, grandparent.id, {
					parentKind: "knowledge_item",
					parentId: child.id,
					updatedBy: "u-1",
				}),
			).rejects.toThrow();
		});

		test("the check holds inside the write's own transaction: two reparents that are each individually legal against the pre-race tree must not both succeed", async ({
			db,
		}) => {
			const x = await create(db, {
				layer: null,
				title: "X",
				body: "x",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
			});
			const y = await create(db, {
				layer: null,
				title: "Y",
				body: "y",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
			});

			// X and Y are both roots. Reparenting X under Y and Y under X are each
			// legal read against the state before either commits — only a check
			// that runs inside the same transaction as the write (re-reading
			// live state) can stop the pair from together producing a 2-cycle.
			const results = await Promise.allSettled([
				reparent(db, x.id, { parentKind: "knowledge_item", parentId: y.id, updatedBy: "u-1" }),
				reparent(db, y.id, { parentKind: "knowledge_item", parentId: x.id, updatedBy: "u-1" }),
			]);

			const succeeded = results.filter((r) => r.status === "fulfilled").length;
			expect(succeeded).toBeLessThanOrEqual(1);
		});
	});

	describe("scope widening rejection", () => {
		test("a child's scope may not be wider than its parent's (factory > team > user)", async ({
			db,
		}) => {
			const parent = await create(db, {
				layer: null,
				title: "Team parent",
				body: "p",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
				scopeKind: "team",
				scopeId: "team-1",
			});

			await expect(
				create(db, {
					layer: null,
					title: "Wider child",
					body: "c",
					format: "markdown",
					status: "active",
					updatedBy: "u-1",
					scopeKind: "factory",
					parentKind: "knowledge_item",
					parentId: parent.id,
				}),
			).rejects.toThrow();
		});

		test("only enforced when parent_kind = 'knowledge_item' — a task-parented child may carry any scope", async ({
			db,
		}) => {
			// Task-parented items never appear in the tree and inherit nothing
			// (architecture §3): the scope-widening rule must not fire for them.
			const created = await create(db, {
				layer: null,
				title: "Task-parented note",
				body: "n",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
				scopeKind: "factory",
				parentKind: "task",
				parentId: "task-1",
			});
			expect(created.parentKind).toBe("task");
			expect(created.scopeKind).toBe("factory");
		});
	});

	describe("depth", () => {
		test("a 33rd level is rejected; the 32nd is accepted", async ({ db }) => {
			let parentId: string | null = null;
			for (let level = 1; level <= 32; level++) {
				const created = await create(db, {
					layer: null,
					title: `Level ${level}`,
					body: `body ${level}`,
					format: "markdown",
					status: "active",
					updatedBy: "u-1",
					parentKind: parentId ? "knowledge_item" : null,
					parentId,
				});
				parentId = created.id;
			}

			// 32 levels deep must be legal.
			expect(parentId).not.toBeNull();

			// A 33rd level must be refused.
			await expect(
				create(db, {
					layer: null,
					title: "Level 33",
					body: "too deep",
					format: "markdown",
					status: "active",
					updatedBy: "u-1",
					parentKind: "knowledge_item",
					parentId: parentId as string,
				}),
			).rejects.toThrow();
		});
	});

	describe("D5 — scope narrowing on a parent cascades to its subtree", () => {
		test("narrowing a parent's scope narrows its children too", async ({ db }) => {
			const parent = await create(db, {
				layer: null,
				title: "Cascading parent",
				body: "p",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
				scopeKind: "factory",
			});
			const child = await create(db, {
				layer: null,
				title: "Cascading child",
				body: "c",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
				scopeKind: "factory",
				parentKind: "knowledge_item",
				parentId: parent.id,
			});

			await update(db, parent.id, { scopeKind: "team", scopeId: "team-1", updatedBy: "u-1" }, 1);

			const [refetchedChild] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, child.id))
				.limit(1);

			expect(refetchedChild?.scopeKind).toBe("team");
		});
	});

	describe("position", () => {
		test("defaults to creation order within a parent; siblings order by position then title", async ({
			db,
		}) => {
			const parent = await create(db, {
				layer: null,
				title: "Ordered parent",
				body: "p",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
			});
			const first = await create(db, {
				layer: null,
				title: "Zebra",
				body: "z",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
				parentKind: "knowledge_item",
				parentId: parent.id,
			});
			const second = await create(db, {
				layer: null,
				title: "Apple",
				body: "a",
				format: "markdown",
				status: "active",
				updatedBy: "u-1",
				parentKind: "knowledge_item",
				parentId: parent.id,
			});

			// `position` does not exist on the schema yet — this is a raw read of
			// the column the migration is meant to add.
			const result = await db.execute(
				sql`SELECT id, position FROM knowledge_items WHERE id IN (${first.id}, ${second.id}) ORDER BY position`,
			);
			const positions = (result as unknown as { rows: Array<{ id: string; position: number }> })
				.rows;
			expect(positions.map((r) => r.id)).toEqual([first.id, second.id]);
		});
	});
});
