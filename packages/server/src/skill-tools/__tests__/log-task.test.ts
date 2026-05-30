import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	createTestDb,
	type HyperIdleDb,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { logTaskTool } from "../log-task.js";
import type { ToolContext } from "../tool-registry.js";

function seed(db: HyperIdleDb): void {
	const now = new Date().toISOString();
	db.insert(teams).values({ id: "p1", name: "Test", phase: "build", createdAt: now }).run();
	db.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(bets)
		.values({
			id: "b1",
			teamId: "p1",
			description: "Test bet",
			appetite: "small",
			status: "active",
			createdAt: now,
		})
		.run();
	db.insert(users)
		.values({
			id: "agent-a",
			name: "A",
			role: "builder",
			teamId: "t1",
			status: "active",
			maxConcurrentSessions: 2,
			createdAt: now,
		})
		.run();
	db.insert(threads)
		.values({
			id: "thread-task-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "agent-1",
			participants: JSON.stringify(["agent-1"]),
			lastActiveAt: now,
			createdAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "b1",
			teamId: "p1",
			ownerAgentId: "agent-a",
			title: "T1",
			state: "in_progress",
			threadId: "thread-task-1",
			createdAt: now,
			updatedAt: now,
		})
		.run();
}

function makeContext(db: HyperIdleDb): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		workspacePath: path.join(os.tmpdir(), `hi-d4-logtask-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

describe("log_task tool", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seed(db);
	});

	describe("AC3: appends 'Discovered X' to task.notes", () => {
		it("appends note prose to task.notes", async () => {
			// I1 C2 decision: log_task writes agent-authored prose (not
			// audit entries) to tasks.notes. The storage representation is
			// implementation-defined (JSON array of note objects OR plain
			// text with a separator) — the assertion here only checks that
			// the note content shows up somewhere in the notes column.
			const result = await logTaskTool.handler({ note: "Discovered X" }, makeContext(db));
			expect(result.success).toBe(true);
			if (!result.success) return;
			expect((result.data as { taskId: string }).taskId).toBe("task-1");

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.notes ?? "").toContain("Discovered X");
		});

		it("preserves pre-existing notes content when appending", async () => {
			// Seed notes with prior agent prose; log_task must preserve it
			// and append the new note. We use prose (not JSON) to reflect
			// C2's plain-text lane; if the impl keeps JSON, the assertions
			// still hold via substring match.
			const priorNote = "earlier thought";
			db.update(tasks).set({ notes: priorNote }).where(eq(tasks.id, "task-1")).run();

			const result = await logTaskTool.handler({ note: "Another note" }, makeContext(db));
			expect(result.success).toBe(true);

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			const notesText = task?.notes ?? "";
			expect(notesText).toContain(priorNote);
			expect(notesText).toContain("Another note");
		});

		it("appends multiple notes in order", async () => {
			await logTaskTool.handler({ note: "First" }, makeContext(db));
			await logTaskTool.handler({ note: "Second" }, makeContext(db));
			await logTaskTool.handler({ note: "Third" }, makeContext(db));

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			const notesText = task?.notes ?? "";
			// All three must appear, in order.
			const posFirst = notesText.indexOf("First");
			const posSecond = notesText.indexOf("Second");
			const posThird = notesText.indexOf("Third");
			expect(posFirst).toBeGreaterThanOrEqual(0);
			expect(posSecond).toBeGreaterThan(posFirst);
			expect(posThird).toBeGreaterThan(posSecond);
		});
	});

	// ---------------- I1 C2/C3: log_task must never touch auditTrail ----------------
	describe("I1 C2/C3: log_task never writes to tasks.auditTrail", () => {
		it("leaves auditTrail untouched when appending a note", async () => {
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			const auditBefore = task?.auditTrail ?? null;

			const result = await logTaskTool.handler({ note: "Discovered Y" }, makeContext(db));
			expect(result.success).toBe(true);

			const after = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(after?.auditTrail ?? null).toBe(auditBefore);
		});

		it("does not corrupt a pre-existing auditTrail entry (state transition)", async () => {
			const now = new Date().toISOString();
			const existing = [{ from: "accepted", to: "in_progress", timestamp: now }];
			db.update(tasks)
				.set({ auditTrail: JSON.stringify(existing) })
				.where(eq(tasks.id, "task-1"))
				.run();

			await logTaskTool.handler({ note: "Another note" }, makeContext(db));

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			// auditTrail is still the pristine state transition — log_task
			// did not append its note to the wrong column.
			const audit = JSON.parse(task?.auditTrail ?? "[]") as Array<Record<string, unknown>>;
			expect(audit).toHaveLength(1);
			expect(audit[0].from).toBe("accepted");
			expect(audit[0].to).toBe("in_progress");
			// Note landed in notes, not auditTrail.
			expect(task?.notes ?? "").toContain("Another note");
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		it("returns INVALID_INPUT when note is empty", async () => {
			const result = await logTaskTool.handler({ note: "" }, makeContext(db));
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns INVALID_INPUT when note is missing", async () => {
			const result = await logTaskTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{} as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns NOT_FOUND when ctx.taskId does not exist", async () => {
			const ctx = { ...makeContext(db), taskId: "ghost-task" };
			const result = await logTaskTool.handler({ note: "x" }, ctx);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		});
	});
});
