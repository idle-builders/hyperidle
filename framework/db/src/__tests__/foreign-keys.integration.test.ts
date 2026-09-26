import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { tasks, teams, threads } from "../schema.js";

/**
 * Reference-data FKs (teams, users, threads) use ON DELETE RESTRICT — `tasks.team_id → teams.id`
 * blocks deleting a team a root task still references. PGlite enforces FK constraints by default.
 */

const NOW = new Date().toISOString();

describe("FK actions — RESTRICT on reference data", () => {
	test("rejects deleting a team while a task references it", async ({ db }) => {
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
