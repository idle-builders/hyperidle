/**
 * resolveReviewRecipients — team-scoped routing + fallback.
 *
 * @lore AU44 B1: `teamMembers` table dissolved into `teams`. Tests updated:
 * - No more `teamMembers` inserts; capacity/activeBets/formedAt are now
 *   columns on `teams`.
 * - `users.teamId` now references `teams.id` directly.
 * - `orgUsersPort` (the injected DI stub) removed — `resolveReviewRecipients`
 *   now calls `listUsers` from `@hyperidle/users` directly (2-arg signature).
 * - `userId` / `agentRole` fields removed from context (edge-matrix remnants).
 */

import { teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { describe } from "vitest";
import { resolveReviewRecipients } from "../org-routing.js";

const NOW = new Date().toISOString();

describe("resolveReviewRecipients — team-scoped routing", () => {
	// -------------------------------------------------------------------------
	// No teamId → fallback to all humans
	// -------------------------------------------------------------------------
	describe("no teamId → returns all human user IDs", () => {
		test("returns empty array when no humans exist", async ({ db }) => {
			const result = await resolveReviewRecipients(db, {});
			expect(result).toHaveLength(0);
		});

		test("returns all human user IDs when teamId is not provided", async ({ db }) => {
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
				{
					id: "u-ai1",
					kind: "ai",
					name: "AI Bot",
					role: "builder",
					status: "active",
					createdAt: NOW,
				},
			]);

			const result = await resolveReviewRecipients(db, {});
			expect(result).toContain("u-h1");
			expect(result).toContain("u-h2");
			expect(result).not.toContain("u-ai1");
		});
	});

	// -------------------------------------------------------------------------
	// teamId provided, team HAS humans → return team humans only
	// -------------------------------------------------------------------------
	describe("teamId provided + humans on team → returns team humans only", () => {
		test("returns only the humans on the given team", async ({ db }) => {
			// @lore AU44 B1: teams now carry capacity/activeBets/formedAt directly.
			// users.teamId references teams.id (no more two-hop through teamMembers).
			await db.insert(teams).values({
				id: "team-alpha",
				name: "Alpha",
				phase: "build",
				capacity: 3,
				activeBets: 0,
				formedAt: NOW,
				createdAt: NOW,
			});

			// Human ON the team
			await db.insert(users).values({
				id: "u-team-human",
				kind: "human",
				name: "Team Human",
				role: "founder",
				status: "active",
				teamId: "team-alpha",
				createdAt: NOW,
			});

			// Human NOT on the team
			await db.insert(users).values({
				id: "u-other-human",
				kind: "human",
				name: "Other Human",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			const result = await resolveReviewRecipients(db, { teamId: "team-alpha" });

			expect(result).toContain("u-team-human");
			expect(result).not.toContain("u-other-human");
		});

		test("returns multiple humans when several are on the team", async ({ db }) => {
			await db.insert(teams).values({
				id: "team-beta",
				name: "Beta",
				phase: "build",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
				createdAt: NOW,
			});

			await db.insert(users).values([
				{
					id: "u-beta-h1",
					kind: "human",
					name: "Beta H1",
					role: "founder",
					status: "active",
					teamId: "team-beta",
					createdAt: NOW,
				},
				{
					id: "u-beta-h2",
					kind: "human",
					name: "Beta H2",
					role: "founder",
					status: "active",
					teamId: "team-beta",
					createdAt: NOW,
				},
				{
					id: "u-beta-ai",
					kind: "ai",
					name: "Beta AI",
					role: "builder",
					status: "active",
					teamId: "team-beta",
					createdAt: NOW,
				},
			]);

			const result = await resolveReviewRecipients(db, { teamId: "team-beta" });

			expect(result).toContain("u-beta-h1");
			expect(result).toContain("u-beta-h2");
			expect(result).not.toContain("u-beta-ai");
		});
	});

	// -------------------------------------------------------------------------
	// teamId provided, team has NO humans → fallback to all humans
	// -------------------------------------------------------------------------
	describe("teamId provided + no humans on team → fallback to all humans", () => {
		test("falls back to all humans when the team has no human members", async ({ db }) => {
			await db.insert(teams).values({
				id: "team-gamma",
				name: "Gamma",
				phase: "build",
				capacity: 2,
				activeBets: 0,
				formedAt: NOW,
				createdAt: NOW,
			});

			// AI on the team — no humans
			await db.insert(users).values({
				id: "u-gamma-ai",
				kind: "ai",
				name: "Gamma AI",
				role: "builder",
				status: "active",
				teamId: "team-gamma",
				createdAt: NOW,
			});

			// A human elsewhere (no team)
			await db.insert(users).values({
				id: "u-global-human",
				kind: "human",
				name: "Global Human",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			const result = await resolveReviewRecipients(db, { teamId: "team-gamma" });

			// Fallback: every human is returned so the review still reaches someone.
			expect(result).toContain("u-global-human");
			expect(result).not.toContain("u-gamma-ai");
		});

		test("falls back when teamId resolves to a team with no human members", async ({ db }) => {
			await db.insert(teams).values({
				id: "team-orphan",
				name: "Orphan",
				phase: "build",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
				createdAt: NOW,
			});
			await db.insert(users).values({
				id: "u-orphan-human",
				kind: "human",
				name: "Orphan Human",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			const result = await resolveReviewRecipients(db, { teamId: "team-orphan" });

			expect(result).toContain("u-orphan-human");
		});
	});
});
