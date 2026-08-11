import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
// @lore U1: `products` renamed to `teams`; old `teams` (membership) renamed to `teamMembers`.
import { bets, teamMembers, teams } from "../schema.js";

/**
 * I3 — foreign-key action acceptance tests.
 *
 * Per AC (TRACK-I.md L132-135):
 * - Reference-data FKs (teams, users, teamMembers, threads) use ON DELETE RESTRICT.
 * - Audit-trail FKs (knowledge_edit_log, knowledge_conflicts on
 *   knowledge_items) use ON DELETE RESTRICT — the audit must outlive its
 *   subject (I3 review sec HIGH-2).
 * - L1a: legacy `responses` table dropped; verdicts now project as
 *   `verdict`-typed messages bound to the thread (RESTRICT via
 *   messages.thread_id), decoupled from the item lifecycle.
 *
 * PGlite enforces FK constraints by default (no PRAGMA needed).
 *
 * @lore this file used to probe ten delete-rejection scenarios; eight are gone. Production never
 * deletes a `users`, `threads`, `knowledgeItems` or `items` row (no mechanism exists anywhere in the
 * codebase — repository/service function, route, agent tool, reaper, migration, cascade — for any of
 * the four), so those RESTRICT constraints, real as they are, guard an operation nothing in
 * production performs. A founder ruling on a companion work package settled that a test may not
 * arrange a state production can never reach, and that an unreachable operation is not worth a
 * constraint test protecting it: the schema keeps every one of those FKs, but their tests are gone.
 * A ninth (`teamMembers` deletion while a user references it) probed a reachable production path
 * (`deleteTeam`) but asserted nothing at all — an outcome-tolerant `try/catch` that could not fail —
 * so it went too, on the separate ground that a test that cannot fail is not a test. What remains:
 * the two `teams`-deletion tests below, because `deleteTeam` really does delete a team in production
 * (the team-creation rollback), and the RESTRICT FKs it can actually trip are worth guarding.
 */

const NOW = new Date().toISOString();

describe("I3: FK actions — RESTRICT on reference data", () => {
	// @lore U1: `products` renamed to `teams`; `teams` (membership) renamed to `teamMembers`.
	test("rejects deleting a team while a teamMembers row references it", async ({ db, ids }) => {
		await db.insert(teams).values({ id: ids("p1"), name: "P", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: ids("p1-members"), teamId: ids("p1"), capacity: 5, activeBets: 0, formedAt: NOW });
		// teamMembers.team_id → teams.id must block
		await expect(db.delete(teams).where(eq(teams.id, ids("p1")))).rejects.toThrow();
	});

	test("rejects deleting a team while a bet references it", async ({ db, ids }) => {
		await db.insert(teams).values({ id: ids("p1"), name: "P", phase: "build", createdAt: NOW });
		// The team is an arranged entity, so it arrives with its membership companion (no arranged
		// entity stays partial) — but that companion's own RESTRICT FK would then be a second
		// sufficient cause of the rejection this test asserts, over-determining it.
		await db
			.insert(teamMembers)
			.values({ id: ids("p1-members"), teamId: ids("p1"), capacity: 5, activeBets: 0, formedAt: NOW });
		await db.insert(bets).values({
			id: ids("b1"),
			teamId: ids("p1"),
			description: "x",
			appetite: "2w",
			status: "draft",
			createdAt: NOW,
		});
		// @lore restoring the sole cause: `deleteTeam` (layers/core-api/org/src/team-lookup.ts:304-307)
		// deletes teamMembers rows first, then the team — and it is NOT wrapped in a transaction (two
		// sequential awaits on `db`). So when the team delete rejects on the bets FK, the membership
		// delete has already durably committed; production really does produce a member-less team in
		// exactly this shape, not just transiently. Mirroring that order here — remove the membership
		// row, then attempt the team delete — restores `bets.teamId` as the single cause without
		// touching the assertion below.
		await db.delete(teamMembers).where(eq(teamMembers.teamId, ids("p1")));
		// `bets.team_id → teams.id` must block
		await expect(db.delete(teams).where(eq(teams.id, ids("p1")))).rejects.toThrow();
	});
});
