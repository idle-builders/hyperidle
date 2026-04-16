import * as os from "node:os";
import * as path from "node:path";
import {
	type HyperIdleDb,
	agents,
	bets,
	createTestDb,
	products,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { logTaskTool } from "../log-task.js";
import type { ToolContext } from "../tool-registry.js";

function seed(db: HyperIdleDb): void {
	const now = new Date().toISOString();
	db.insert(products).values({ id: "p1", name: "Test", phase: "build", createdAt: now }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(bets)
		.values({
			id: "b1",
			productId: "p1",
			teamId: "t1",
			pitch: "Test bet",
			appetite: "small",
			status: "committed",
			createdAt: now,
		})
		.run();
	db.insert(agents)
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
	db.insert(threads).values({ id: "thread-task-1", kind: "task", createdAt: now }).run();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "b1",
			productId: "p1",
			teamId: "t1",
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
	};
}

describe("log_task tool", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seed(db);
	});

	describe("AC3: appends 'Discovered X' to task.notes", () => {
		it("appends a note entry to task.notes JSON array", async () => {
			const result = await logTaskTool.handler({ note: "Discovered X" }, makeContext(db));
			expect(result.success).toBe(true);
			if (!result.success) return;
			expect((result.data as { taskId: string }).taskId).toBe("task-1");

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			const audit = JSON.parse(task?.notes ?? "[]") as Array<Record<string, unknown>>;
			const noteEntries = audit.filter((e) => e.type === "note");
			expect(noteEntries).toHaveLength(1);
			expect(noteEntries[0].text).toBe("Discovered X");
			expect(noteEntries[0].agentId).toBe("agent-a");
			expect(noteEntries[0].sessionId).toBe("session-1");
			expect(noteEntries[0].timestamp).toBeDefined();
		});

		it("preserves existing audit entries (e.g. state transitions)", async () => {
			const now = new Date().toISOString();
			const existing = [{ from: "accepted", to: "in_progress", timestamp: now }];
			db.update(tasks)
				.set({ notes: JSON.stringify(existing) })
				.where(eq(tasks.id, "task-1"))
				.run();

			const result = await logTaskTool.handler({ note: "Another note" }, makeContext(db));
			expect(result.success).toBe(true);

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			const audit = JSON.parse(task?.notes ?? "[]") as Array<Record<string, unknown>>;
			expect(audit).toHaveLength(2);
			expect(audit[0].from).toBe("accepted");
			expect(audit[1].type).toBe("note");
			expect(audit[1].text).toBe("Another note");
		});

		it("appends multiple notes in order", async () => {
			await logTaskTool.handler({ note: "First" }, makeContext(db));
			await logTaskTool.handler({ note: "Second" }, makeContext(db));
			await logTaskTool.handler({ note: "Third" }, makeContext(db));

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			const audit = JSON.parse(task?.notes ?? "[]") as Array<Record<string, unknown>>;
			const notes = audit.filter((e) => e.type === "note");
			expect(notes.map((n) => n.text)).toEqual(["First", "Second", "Third"]);
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
