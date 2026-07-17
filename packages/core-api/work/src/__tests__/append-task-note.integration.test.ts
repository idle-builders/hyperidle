/**
 * AU20 I0a: `appendTaskNote` — atomic note append, no lost-update race.
 *
 * The concurrent-appends test is the primary correctness proof: the old
 * `getTaskById → concat → updateTaskById` path loses one note when two calls
 * race (both read the same null state before either write). The atomic
 * UPDATE-with-CASE eliminates the race by letting the DB concatenate
 * inside a single statement referencing the live column value.
 *
 * Uses the `{ db }`-only fixture — no `app` / `eventBus` needed.
 */

import { bets, type HyperIdleDb, tasks, teams } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { describe } from "vitest";
import { appendTaskNote, getTaskById } from "../work-service.js";

/** Must match the separator defined in work-service.ts. */
const NOTE_SEPARATOR = "\n\n---\n\n";

async function seedTask(db: HyperIdleDb, id: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: `${id}-team`, name: "Test", phase: "build", createdAt: now });
	await db.insert(bets).values({
		id: `${id}-bet`,
		teamId: `${id}-team`,
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id,
		betId: `${id}-bet`,
		teamId: `${id}-team`,
		title: "Test Task",
		state: "accepted",
		createdAt: now,
		updatedAt: now,
	});
}

describe("appendTaskNote", () => {
	test("appends entry to empty notes and returns the task id", async ({ db }) => {
		await seedTask(db, "ant-task-1");
		const result = await appendTaskNote(
			db,
			"ant-task-1",
			"[2026-01-01T00:00:00.000Z agent-1] first note",
		);
		expect(result).toEqual({ id: "ant-task-1" });
		const task = await getTaskById(db, "ant-task-1");
		expect(task?.notes).toBe("[2026-01-01T00:00:00.000Z agent-1] first note");
	});

	test("appends second entry separated by NOTE_SEPARATOR", async ({ db }) => {
		await seedTask(db, "ant-task-2");
		await appendTaskNote(db, "ant-task-2", "[2026-01-01T00:00:00.000Z agent-1] first note");
		await appendTaskNote(db, "ant-task-2", "[2026-01-01T00:00:01.000Z agent-1] second note");
		const task = await getTaskById(db, "ant-task-2");
		expect(task?.notes).toBe(
			`[2026-01-01T00:00:00.000Z agent-1] first note${NOTE_SEPARATOR}[2026-01-01T00:00:01.000Z agent-1] second note`,
		);
	});

	test("concurrent appends preserve BOTH notes — no lost-update (the race fix)", async ({ db }) => {
		await seedTask(db, "ant-task-3");

		// Fire two overlapping appends. The old read-modify-write path causes both
		// calls to read the same initial state (notes = null) before either write,
		// so the second write clobbers the first. The atomic CASE UPDATE prevents
		// that by concatenating inside a single SQL statement.
		await Promise.all([
			appendTaskNote(db, "ant-task-3", "[2026-01-01T00:00:00.000Z agent-1] note-alpha"),
			appendTaskNote(db, "ant-task-3", "[2026-01-01T00:00:00.001Z agent-2] note-beta"),
		]);

		const task = await getTaskById(db, "ant-task-3");
		expect(task?.notes).toContain("note-alpha");
		expect(task?.notes).toContain("note-beta");
	});

	test("returns undefined when the task does not exist", async ({ db }) => {
		const result = await appendTaskNote(db, "nonexistent-task-id", "[ts agent] note");
		expect(result).toBeUndefined();
	});
});
