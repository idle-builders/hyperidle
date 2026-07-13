/**
 * P2 RED — resolveReviewRecipients fallback behavior.
 *
 * These tests FAIL until:
 *  - packages/server/src/services/org-routing.ts is created
 *  - resolveReviewRecipients(db, context) is exported from that file
 *  - With no org edges: returns all human user IDs
 *  - With matching org edges: returns matched human user IDs from fromUserId
 *  - With non-matching edges: falls back to all human user IDs
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
 */

import { resolveReviewRecipients } from "@hyperidle/core-app";
import {
	// P2: import new symbols — compile error until implementation done
	orgEdges,
	users,
} from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../test-fixtures.js";

const NOW = new Date().toISOString();

describe("P2 — resolveReviewRecipients fallback routing (AC8)", () => {
	// -------------------------------------------------------------------------
	// AC8: no org edges → all human users receive reviews
	// -------------------------------------------------------------------------
	describe("AC8: no org edges → returns all human user IDs", () => {
		test("returns empty array when no users exist and no org edges exist", async ({ db }) => {
			const result = await resolveReviewRecipients(db, {});
			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(0);
		});

		test("returns all human user IDs when no org edges exist", async ({ db }) => {
			// Seed two human users
			await db.insert(users).values([
				{
					id: "u-h1",
					kind: "human",
					name: "Human 1",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: "u-h2",
					kind: "human",
					name: "Human 2",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
			]);

			// Seed an AI user — should NOT be in result
			await db.insert(users).values({
				id: "u-ai1",
				kind: "ai",
				name: "AI Bot",
				role: "builder",
				status: "active",
				createdAt: NOW,
			});

			const result = await resolveReviewRecipients(db, {});
			// Should return all human users, not AI users
			expect(result).toHaveLength(2);
			expect(result).toContain("u-h1");
			expect(result).toContain("u-h2");
			expect(result).not.toContain("u-ai1");
		});
	});

	// -------------------------------------------------------------------------
	// AC8: org edges exist and match → returns matched human user IDs
	// -------------------------------------------------------------------------
	describe("AC8: matching org edges → returns matched human users only", () => {
		test("returns matched fromUserId when a direct edge matches context.userId", async ({ db }) => {
			await db.insert(users).values([
				{
					id: "u-reviewer",
					kind: "human",
					name: "Reviewer",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: "u-other-human",
					kind: "human",
					name: "Other Human",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: "u-target-ai",
					kind: "ai",
					name: "Target AI",
					role: "builder",
					status: "active",
					createdAt: NOW,
				},
			]);

			// Edge: u-reviewer reviews u-target-ai directly
			await db.insert(orgEdges).values({
				id: "e-direct",
				fromUserId: "u-reviewer",
				mechanism: "direct",
				target: "u-target-ai",
				createdAt: NOW,
			});

			const result = await resolveReviewRecipients(db, { userId: "u-target-ai" });
			// Only u-reviewer has a direct edge to u-target-ai
			expect(result).toContain("u-reviewer");
			expect(result).not.toContain("u-other-human");
		});

		test("returns matched fromUserId when a function edge matches context.agentRole", async ({
			db,
		}) => {
			await db.insert(users).values([
				{
					id: "u-func-reviewer",
					kind: "human",
					name: "Function Reviewer",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: "u-other",
					kind: "human",
					name: "Other",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
			]);

			// Edge: u-func-reviewer reviews all "builder" role agents
			await db.insert(orgEdges).values({
				id: "e-func",
				fromUserId: "u-func-reviewer",
				mechanism: "function",
				target: "builder",
				createdAt: NOW,
			});

			const result = await resolveReviewRecipients(db, { agentRole: "builder" });
			expect(result).toContain("u-func-reviewer");
			expect(result).not.toContain("u-other");
		});

		test("returns matched fromUserId when a team edge matches context.teamId", async ({ db }) => {
			await db.insert(users).values([
				{
					id: "u-team-reviewer",
					kind: "human",
					name: "Team Reviewer",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: "u-unrelated",
					kind: "human",
					name: "Unrelated Human",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
			]);

			// Edge: u-team-reviewer reviews team-alpha
			await db.insert(orgEdges).values({
				id: "e-team",
				fromUserId: "u-team-reviewer",
				mechanism: "team",
				target: "team-alpha",
				createdAt: NOW,
			});

			const result = await resolveReviewRecipients(db, { teamId: "team-alpha" });
			expect(result).toContain("u-team-reviewer");
			expect(result).not.toContain("u-unrelated");
		});

		test("deduplicates fromUserId when multiple edges match the same human user", async ({
			db,
		}) => {
			await db.insert(users).values({
				id: "u-multi-match",
				kind: "human",
				name: "Multi Match",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			// Two edges that both match different aspects of the context
			await db.insert(orgEdges).values([
				{
					id: "e-multi-direct",
					fromUserId: "u-multi-match",
					mechanism: "direct",
					target: "u-ai-x",
					createdAt: NOW,
				},
				{
					id: "e-multi-func",
					fromUserId: "u-multi-match",
					mechanism: "function",
					target: "builder",
					createdAt: NOW,
				},
			]);

			const result = await resolveReviewRecipients(db, {
				userId: "u-ai-x",
				agentRole: "builder",
			});
			// u-multi-match should appear only ONCE even though two edges matched
			const occurrences = result.filter((id) => id === "u-multi-match").length;
			expect(occurrences).toBe(1);
		});
	});

	// -------------------------------------------------------------------------
	// AC8: non-matching org edges → falls back to all human users
	// -------------------------------------------------------------------------
	describe("AC8: non-matching edges → falls back to all human users", () => {
		test("returns all human users when edges exist but none match the context", async ({ db }) => {
			await db.insert(users).values([
				{
					id: "u-fallback-h1",
					kind: "human",
					name: "Fallback Human 1",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: "u-fallback-h2",
					kind: "human",
					name: "Fallback Human 2",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
			]);

			// Edge exists but for a different target
			await db.insert(orgEdges).values({
				id: "e-no-match",
				fromUserId: "u-fallback-h1",
				mechanism: "direct",
				target: "u-some-other-ai",
				createdAt: NOW,
			});

			// Query for a completely different userId — no edge matches
			const result = await resolveReviewRecipients(db, { userId: "u-unrelated-ai" });
			// Falls back to ALL human users
			expect(result).toContain("u-fallback-h1");
			expect(result).toContain("u-fallback-h2");
		});

		test("returns all human users when context is empty and edges exist", async ({ db }) => {
			await db.insert(users).values([
				{
					id: "u-empty-ctx-h1",
					kind: "human",
					name: "Empty Context H1",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: "u-empty-ctx-h2",
					kind: "human",
					name: "Empty Context H2",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
			]);

			await db.insert(orgEdges).values({
				id: "e-exists-but-empty-ctx",
				fromUserId: "u-empty-ctx-h1",
				mechanism: "direct",
				target: "u-some-ai",
				createdAt: NOW,
			});

			// Empty context cannot match any edge — falls back to all humans
			const result = await resolveReviewRecipients(db, {});
			expect(result).toContain("u-empty-ctx-h1");
			expect(result).toContain("u-empty-ctx-h2");
		});
	});
});
