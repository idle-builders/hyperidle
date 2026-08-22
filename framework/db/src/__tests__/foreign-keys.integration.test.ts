import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { bets, teams } from "../schema.js";

/**
 * I3 — foreign-key action acceptance tests.
 *
 * Per AC (TRACK-I.md L132-135):
 * - Reference-data FKs (teams, users, threads) use ON DELETE RESTRICT.
 * - Audit-trail FKs (knowledge_edit_log, knowledge_conflicts on
 *   knowledge_items) use ON DELETE RESTRICT — the audit must outlive its
 *   subject (I3 review sec HIGH-2).
 *
 * PGlite enforces FK constraints by default (no PRAGMA needed).
 *
 * @lore AU44 B1: `team_members` dissolved into `teams`. The test probing
 * "rejects deleting a team while a teamMembers row references it" is removed —
 * the `team_members` table is gone. The surviving test asserts the still-live
 * `bets.team_id → teams.id` RESTRICT constraint.
 */

const NOW = new Date().toISOString();

describe("I3: FK actions — RESTRICT on reference data", () => {
	test("rejects deleting a team while a bet references it", async ({ db }) => {
		// @lore AU44 B1: no more teamMembers insert needed; capacity/activeBets/formedAt
		// are now columns on teams. The single cause of rejection is bets.team_id → teams.id.
		await db.insert(teams).values({
			id: "p1",
			name: "P",
			phase: "build",
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
			createdAt: NOW,
		});
		await db.insert(bets).values({
			id: "b1",
			teamId: "p1",
			description: "x",
			appetite: "2w",
			status: "draft",
			createdAt: NOW,
		});
		// `bets.team_id → teams.id` must block team deletion
		await expect(db.delete(teams).where(eq(teams.id, "p1"))).rejects.toThrow();
	});
});
