/**
 * resolveReviewRecipients — team-scoped routing + fallback.
 *
 * @lore AU20 ruling 1: the old org-edges matrix (direct/function/team edges)
 * was an approval chart and is permanently removed. The new algorithm:
 *  1. If teamId provided, find teamMembers row for that team.
 *  2. Return humans whose users.teamId = teamMembers.id.
 *  3. If no team humans found (or no teamId), fall back to ALL humans.
 *
 * Every review still reaches someone — the fallback ensures that.
 */

import { type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { resolveReviewRecipients } from "../org-routing.js";

const NOW = new Date().toISOString();

/**
 * Test port that queries users filtered by teamMembersId (when provided)
 * or returns all humans (when omitted). This is the exact shape the
 * production route injects (`listUsers(db, { kind: 'human', teamIds?: [...] })`).
 */
const orgUsersPort = {
	async listHumans(db2: HyperIdleDb, teamMembersId?: string) {
		const q = db2.select({ id: users.id }).from(users);
		if (teamMembersId !== undefined) {
			return q.where(eq(users.teamId, teamMembersId));
		}
		return q.where(eq(users.kind, "human"));
	},
};

describe("resolveReviewRecipients — team-scoped routing", () => {
	// -------------------------------------------------------------------------
	// No teamId → fallback to all humans
	// -------------------------------------------------------------------------
	describe("no teamId → returns all human user IDs", () => {
		test("returns empty array when no humans exist", async ({ db }) => {
			const result = await resolveReviewRecipients(db, {}, orgUsersPort);
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

			const result = await resolveReviewRecipients(db, {}, orgUsersPort);
			expect(result).toContain("u-h1");
			expect(result).toContain("u-h2");
			expect(result).not.toContain("u-ai1");
		});

		test("ignores userId and agentRole — they no longer drive routing", async ({ db }) => {
			await db.insert(users).values([
				{
					id: "u-h1",
					kind: "human",
					name: "Human",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
			]);

			// Old edge-matrix context fields — now ignored; result is the same as
			// the no-teamId fallback.
			const result = await resolveReviewRecipients(
				db,
				{ userId: "some-agent", agentRole: "builder" },
				orgUsersPort,
			);
			expect(result).toContain("u-h1");
		});
	});

	// -------------------------------------------------------------------------
	// teamId provided, team HAS humans → return team humans only
	// -------------------------------------------------------------------------
	describe("teamId provided + humans on team → returns team humans only", () => {
		test("returns only the humans on the given team", async ({ db }) => {
			// Team setup
			await db
				.insert(teams)
				.values({ id: "team-alpha", name: "Alpha", phase: "build", createdAt: NOW });
			await db.insert(teamMembers).values({
				id: "tm-alpha",
				teamId: "team-alpha",
				capacity: 3,
				activeBets: 0,
				formedAt: NOW,
			});

			// Human ON the team
			await db.insert(users).values({
				id: "u-team-human",
				kind: "human",
				name: "Team Human",
				role: "founder",
				status: "active",
				teamId: "tm-alpha",
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

			const result = await resolveReviewRecipients(db, { teamId: "team-alpha" }, orgUsersPort);

			expect(result).toContain("u-team-human");
			expect(result).not.toContain("u-other-human");
		});

		test("returns multiple humans when several are on the team", async ({ db }) => {
			await db
				.insert(teams)
				.values({ id: "team-beta", name: "Beta", phase: "build", createdAt: NOW });
			await db
				.insert(teamMembers)
				.values({ id: "tm-beta", teamId: "team-beta", capacity: 5, activeBets: 0, formedAt: NOW });

			await db.insert(users).values([
				{
					id: "u-beta-h1",
					kind: "human",
					name: "Beta H1",
					role: "founder",
					status: "active",
					teamId: "tm-beta",
					createdAt: NOW,
				},
				{
					id: "u-beta-h2",
					kind: "human",
					name: "Beta H2",
					role: "founder",
					status: "active",
					teamId: "tm-beta",
					createdAt: NOW,
				},
				{
					id: "u-beta-ai",
					kind: "ai",
					name: "Beta AI",
					role: "builder",
					status: "active",
					teamId: "tm-beta",
					createdAt: NOW,
				},
			]);

			const result = await resolveReviewRecipients(db, { teamId: "team-beta" }, orgUsersPort);

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
			await db
				.insert(teams)
				.values({ id: "team-gamma", name: "Gamma", phase: "build", createdAt: NOW });
			await db.insert(teamMembers).values({
				id: "tm-gamma",
				teamId: "team-gamma",
				capacity: 2,
				activeBets: 0,
				formedAt: NOW,
			});

			// AI on the team — no humans
			await db.insert(users).values({
				id: "u-gamma-ai",
				kind: "ai",
				name: "Gamma AI",
				role: "builder",
				status: "active",
				teamId: "tm-gamma",
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

			const result = await resolveReviewRecipients(db, { teamId: "team-gamma" }, orgUsersPort);

			// Fallback: every human is returned so the review still reaches someone.
			expect(result).toContain("u-global-human");
			expect(result).not.toContain("u-gamma-ai");
		});

		test("falls back when teamId resolves to a team with no teamMembers row", async ({ db }) => {
			// A team with no teamMembers companion → getTeamMembers returns undefined → fallback
			await db
				.insert(teams)
				.values({ id: "team-orphan", name: "Orphan", phase: "build", createdAt: NOW });
			await db.insert(users).values({
				id: "u-orphan-human",
				kind: "human",
				name: "Orphan Human",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			const result = await resolveReviewRecipients(db, { teamId: "team-orphan" }, orgUsersPort);

			expect(result).toContain("u-orphan-human");
		});
	});
});
