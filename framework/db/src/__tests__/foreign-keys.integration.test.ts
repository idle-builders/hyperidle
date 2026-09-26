import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { tasks, teams, threads } from "../schema.js";

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
 * the `team_members` table is gone.
 * @lore BB1: `bets` table dropped. The RESTRICT constraint is now on
 * `tasks.team_id → teams.id` — a root task blocks team deletion.
 */

const NOW = new Date().toISOString();

describe("FK actions — RESTRICT on reference data", () => {
	test("rejects deleting a team while a task references it", async ({ db }) => {
		// @lore BB1: tasks.team_id → teams.id must block team deletion.
		await db.insert(teams).values({
			id: "p1",
			name: "P",
			createdAt: NOW,
		});
		// Every task has a real thread (`tasks.thread_id` is NOT NULL).
		await db.insert(threads).values({
			id: "thr-t1",
			hostKind: "team",
			hostId: "p1",
			initiatorId: "u1",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "t1",
			parentTaskId: null,
			teamId: "p1",
			title: "Root task",
			state: "proposed",
			threadId: "thr-t1",
			createdAt: NOW,
			updatedAt: NOW,
		});
		// `tasks.team_id → teams.id` must block team deletion
		await expect(db.delete(teams).where(eq(teams.id, "p1"))).rejects.toThrow();
	});
});
