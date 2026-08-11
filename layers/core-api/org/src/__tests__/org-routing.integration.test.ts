/**
 * P2 — resolveReviewRecipients fallback behavior.
 *
 * @lore P2: resolveReviewRecipients is the kernel-level routing function.
 * It queries org_edges for matching context (direct/function/team mechanism),
 * unions the fromUserId values, then falls back to ALL human users when
 * no edges match. This replaces the strategy-layer founder-router.ts
 * for actual review routing; founder-router.ts (dead, 0 real callers) was
 * deleted in AU11.
 *
 * Resolution algorithm (from architecture critique WARNING #3):
 *  1. Query WHERE mechanism="direct" AND target=context.userId
 *  2. Query WHERE mechanism="function" AND target=context.agentRole
 *  3. Query WHERE mechanism="team" AND target=context.teamId
 *  4. Union the fromUserId values (deduplicated)
 *  5. If result set is empty, return all human user IDs
 *
 * @lore AU19 Increment 1c: moved from `packages/server/src/__tests__/
 * P2-fallback-routing.integration.test.ts` — only needs `{ db }` (no `{ app }`),
 * so it moves into the owning package's own `src/__tests__/`, switches its
 * fixture import to `@hyperidle/db/test-fixtures`, and supplies a local
 * `listUsersByKind` stand-in (a plain drizzle query against `users` — the
 * exact query `@hyperidle/org`'s real `OrgUserDirectory` port wires to in
 * production) instead of importing `packages/server`'s `user-store.ts`
 * across the package boundary.
 */

import { type HyperIdleDb, orgEdges, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { resolveReviewRecipients } from "../org-routing.js";

const NOW = new Date().toISOString();

/** Test stand-in for `@hyperidle/org`'s `OrgUserDirectory.listUsersByKind` port. */
const orgUsers = {
	async listUsersByKind(db: HyperIdleDb, kind: string) {
		return db.select().from(users).where(eq(users.kind, kind));
	},
};

describe("resolveReviewRecipients — fallback routing", () => {
	// -------------------------------------------------------------------------
	// no org edges → all human users receive reviews
	// -------------------------------------------------------------------------
	describe("no org edges → returns all human user IDs", () => {
		test("returns empty array when the user directory lists no humans and no org edges exist", async ({
			db,
			ids,
		}) => {
			// @lore AU38 P4: "no users exist" is a global-world claim a test can
			// no longer assume. The fallback returns whatever the user directory
			// lists, so arrange the EMPTY directory on this test's own scope: the
			// stand-in filters to a scoped id nobody inserted → lists nothing,
			// and the empty-fallback path is still what gets asserted.
			const emptyDirectory = {
				async listUsersByKind(db: HyperIdleDb, kind: string) {
					return db
						.select()
						.from(users)
						.where(and(eq(users.kind, kind), eq(users.id, ids("nobody"))));
				},
			};
			const result = await resolveReviewRecipients(db, {}, emptyDirectory);
			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(0);
		});

		test("returns all human user IDs when no org edges exist", async ({ db, ids }) => {
			// Seed two human users
			await db.insert(users).values([
				{
					id: ids("u-h1"),
					kind: "human",
					name: "Human 1",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: ids("u-h2"),
					kind: "human",
					name: "Human 2",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
			]);

			// Seed an AI user — should NOT be in result
			await db.insert(users).values({
				id: ids("u-ai1"),
				kind: "ai",
				name: "AI Bot",
				role: "builder",
				status: "active",
				createdAt: NOW,
			});

			const result = await resolveReviewRecipients(db, {}, orgUsers);
			// Should return all human users, not AI users
			expect(result).toContain(ids("u-h1"));
			expect(result).toContain(ids("u-h2"));
			expect(result).not.toContain(ids("u-ai1"));
			// AU38 P6: the fallback is a global list — assert "exactly my humans"
			// only over the ids this test arranged, not over the whole table.
			const arranged = result.filter((id) => [ids("u-h1"), ids("u-h2"), ids("u-ai1")].includes(id));
			expect(arranged).toHaveLength(2);
		});
	});

	// -------------------------------------------------------------------------
	// AC8: org edges exist and match → returns matched human user IDs
	// -------------------------------------------------------------------------
	describe("matching org edges → returns matched human users only", () => {
		test("returns matched fromUserId when a direct edge matches context.userId", async ({
			db,
			ids,
		}) => {
			await db.insert(users).values([
				{
					id: ids("u-reviewer"),
					kind: "human",
					name: "Reviewer",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: ids("u-other-human"),
					kind: "human",
					name: "Other Human",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: ids("u-target-ai"),
					kind: "ai",
					name: "Target AI",
					role: "builder",
					status: "active",
					createdAt: NOW,
				},
			]);

			// Edge: u-reviewer reviews u-target-ai directly
			await db.insert(orgEdges).values({
				id: ids("e-direct"),
				fromUserId: ids("u-reviewer"),
				mechanism: "direct",
				target: ids("u-target-ai"),
				createdAt: NOW,
			});

			const result = await resolveReviewRecipients(db, { userId: ids("u-target-ai") }, orgUsers);
			// Only u-reviewer has a direct edge to u-target-ai
			expect(result).toContain(ids("u-reviewer"));
			expect(result).not.toContain(ids("u-other-human"));
		});

		test("returns matched fromUserId when a function edge matches context.agentRole", async ({
			db,
			ids,
		}) => {
			await db.insert(users).values([
				{
					id: ids("u-func-reviewer"),
					kind: "human",
					name: "Function Reviewer",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: ids("u-other"),
					kind: "human",
					name: "Other",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
			]);

			// Edge: u-func-reviewer reviews all "builder" role agents
			await db.insert(orgEdges).values({
				id: ids("e-func"),
				fromUserId: ids("u-func-reviewer"),
				mechanism: "function",
				target: "builder",
				createdAt: NOW,
			});

			const result = await resolveReviewRecipients(db, { agentRole: "builder" }, orgUsers);
			expect(result).toContain(ids("u-func-reviewer"));
			expect(result).not.toContain(ids("u-other"));
		});

		test("returns matched fromUserId when a team edge matches context.teamId", async ({
			db,
			ids,
		}) => {
			await db.insert(users).values([
				{
					id: ids("u-team-reviewer"),
					kind: "human",
					name: "Team Reviewer",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: ids("u-unrelated"),
					kind: "human",
					name: "Unrelated Human",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
			]);

			// Edge: u-team-reviewer reviews team-alpha
			await db.insert(orgEdges).values({
				id: ids("e-team"),
				fromUserId: ids("u-team-reviewer"),
				mechanism: "team",
				target: ids("team-alpha"),
				createdAt: NOW,
			});

			const result = await resolveReviewRecipients(db, { teamId: ids("team-alpha") }, orgUsers);
			expect(result).toContain(ids("u-team-reviewer"));
			expect(result).not.toContain(ids("u-unrelated"));
		});

		test("deduplicates fromUserId when multiple edges match the same human user", async ({
			db,
			ids,
		}) => {
			await db.insert(users).values({
				id: ids("u-multi-match"),
				kind: "human",
				name: "Multi Match",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			// Two edges that both match different aspects of the context
			await db.insert(orgEdges).values([
				{
					id: ids("e-multi-direct"),
					fromUserId: ids("u-multi-match"),
					mechanism: "direct",
					target: ids("u-ai-x"),
					createdAt: NOW,
				},
				{
					id: ids("e-multi-func"),
					fromUserId: ids("u-multi-match"),
					mechanism: "function",
					target: "builder",
					createdAt: NOW,
				},
			]);

			const result = await resolveReviewRecipients(
				db,
				{
					userId: ids("u-ai-x"),
					agentRole: "builder",
				},
				orgUsers,
			);
			// u-multi-match should appear only ONCE even though two edges matched
			const occurrences = result.filter((id) => id === ids("u-multi-match")).length;
			expect(occurrences).toBe(1);
		});
	});

	// -------------------------------------------------------------------------
	// AC8: non-matching org edges → falls back to all human users
	// -------------------------------------------------------------------------
	describe("non-matching edges → falls back to all human users", () => {
		test("returns all human users when edges exist but none match the context", async ({
			db,
			ids,
		}) => {
			await db.insert(users).values([
				{
					id: ids("u-fallback-h1"),
					kind: "human",
					name: "Fallback Human 1",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: ids("u-fallback-h2"),
					kind: "human",
					name: "Fallback Human 2",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
			]);

			// Edge exists but for a different target
			await db.insert(orgEdges).values({
				id: ids("e-no-match"),
				fromUserId: ids("u-fallback-h1"),
				mechanism: "direct",
				target: ids("u-some-other-ai"),
				createdAt: NOW,
			});

			// Query for a completely different userId — no edge matches
			const result = await resolveReviewRecipients(db, { userId: ids("u-unrelated-ai") }, orgUsers);
			// Falls back to ALL human users
			expect(result).toContain(ids("u-fallback-h1"));
			expect(result).toContain(ids("u-fallback-h2"));
		});

		test("returns all human users when context is empty and edges exist", async ({ db, ids }) => {
			await db.insert(users).values([
				{
					id: ids("u-empty-ctx-h1"),
					kind: "human",
					name: "Empty Context H1",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: ids("u-empty-ctx-h2"),
					kind: "human",
					name: "Empty Context H2",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
			]);

			await db.insert(orgEdges).values({
				id: ids("e-exists-but-empty-ctx"),
				fromUserId: ids("u-empty-ctx-h1"),
				mechanism: "direct",
				target: ids("u-some-ai"),
				createdAt: NOW,
			});

			// Empty context cannot match any edge — falls back to all humans
			const result = await resolveReviewRecipients(db, {}, orgUsers);
			expect(result).toContain(ids("u-empty-ctx-h1"));
			expect(result).toContain(ids("u-empty-ctx-h2"));
		});
	});
});
