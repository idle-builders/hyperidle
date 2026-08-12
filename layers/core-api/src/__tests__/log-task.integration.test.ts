import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { bets, type HyperIdleDb, tasks, teamMembers, teams, threads, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/tool-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

function buildLogTaskTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "log_task",
	)!;
}

async function seed(db: HyperIdleDb, ids: ScopedIds): Promise<{ taskId: string; agentId: string }> {
	const now = new Date().toISOString();
	const teamId = ids("p1");
	const tmId = ids("t1");
	const agentId = ids("agent-a");
	const betId = ids("b1");
	const threadId = ids("thread-task-1");
	const taskId = ids("task-1");
	await db.insert(teams).values({ id: teamId, name: "Test", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: tmId, teamId, capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "Test bet",
		appetite: "small",
		status: "active",
		createdAt: now,
	});

	await db.insert(users).values({
		id: agentId,
		name: "A",
		role: "builder",
		teamId: tmId,
		status: "active",
		createdAt: now,
	});

	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: taskId,
		initiatorId: ids("agent-1"),
		participants: JSON.stringify([ids("agent-1")]),
		lastActiveAt: now,
		createdAt: now,
	});

	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "T1",
		state: "in_progress",
		threadId,
		createdAt: now,
		updatedAt: now,
	});
	return { taskId, agentId };
}

function makeContext(db: HyperIdleDb, agentId: string, taskId: string): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId,
		sessionId: "session-1",
		taskId,
		sandboxPath: path.join(os.tmpdir(), `hi-d4-logtask-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("log_task tool", () => {
	describe("AC3: appends 'Discovered X' to task.notes", () => {
		test("appends note prose to task.notes", async ({ db, app, ids }) => {
			const logTaskTool = buildLogTaskTool(app);
			const { taskId, agentId } = await seed(db, ids);
			// I1 C2 decision: log_task writes agent-authored prose (not
			// audit entries) to tasks.notes. The storage representation is
			// implementation-defined (JSON array of note objects OR plain
			// text with a separator) — the assertion here only checks that
			// the note content shows up somewhere in the notes column.
			const result = await logTaskTool.handler(
				{ note: "Discovered X" },
				makeContext(db, agentId, taskId),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			expect((result.data as { taskId: string }).taskId).toBe(taskId);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
			expect(task?.notes ?? "").toContain("Discovered X");
		});

		test("preserves pre-existing notes content when appending", async ({ db, app, ids }) => {
			const logTaskTool = buildLogTaskTool(app);
			const { taskId, agentId } = await seed(db, ids);
			// Seed notes with prior agent prose; log_task must preserve it
			// and append the new note. We use prose (not JSON) to reflect
			// C2's plain-text lane; if the impl keeps JSON, the assertions
			// still hold via substring match.
			const priorNote = "earlier thought";
			await db.update(tasks).set({ notes: priorNote }).where(eq(tasks.id, taskId));

			const result = await logTaskTool.handler(
				{ note: "Another note" },
				makeContext(db, agentId, taskId),
			);
			expect(result.success).toBe(true);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
			const notesText = task?.notes ?? "";
			expect(notesText).toContain(priorNote);
			expect(notesText).toContain("Another note");
		});

		test("appends multiple notes in order", async ({ db, app, ids }) => {
			const logTaskTool = buildLogTaskTool(app);
			const { taskId, agentId } = await seed(db, ids);
			await logTaskTool.handler({ note: "First" }, makeContext(db, agentId, taskId));
			await logTaskTool.handler({ note: "Second" }, makeContext(db, agentId, taskId));
			await logTaskTool.handler({ note: "Third" }, makeContext(db, agentId, taskId));

			const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
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
		test("leaves auditTrail untouched when appending a note", async ({ db, app, ids }) => {
			const logTaskTool = buildLogTaskTool(app);
			const { taskId, agentId } = await seed(db, ids);
			const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
			const auditBefore = task?.auditTrail ?? null;

			const result = await logTaskTool.handler(
				{ note: "Discovered Y" },
				makeContext(db, agentId, taskId),
			);
			expect(result.success).toBe(true);

			const [after] = await db.select().from(tasks).where(eq(tasks.id, taskId));
			expect(after?.auditTrail ?? null).toBe(auditBefore);
		});

		test("does not corrupt a pre-existing auditTrail entry (state transition)", async ({
			db,
			app,
			ids,
		}) => {
			const logTaskTool = buildLogTaskTool(app);
			const { taskId, agentId } = await seed(db, ids);
			const now = new Date().toISOString();
			const existing = [{ from: "accepted", to: "in_progress", timestamp: now }];
			await db
				.update(tasks)
				.set({ auditTrail: JSON.stringify(existing) })
				.where(eq(tasks.id, taskId));

			await logTaskTool.handler({ note: "Another note" }, makeContext(db, agentId, taskId));

			const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
			// auditTrail is still the pristine state transition — log_task
			// did not append its note to the wrong column.
			const audit = JSON.parse(task?.auditTrail ?? "[]") as Array<Record<string, unknown>>;
			expect(audit).toHaveLength(1);
			expect(audit[0]!.from).toBe("accepted");
			expect(audit[0]!.to).toBe("in_progress");
			// Note landed in notes, not auditTrail.
			expect(task?.notes ?? "").toContain("Another note");
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		test("returns INVALID_INPUT when note is empty", async ({ db, app, ids }) => {
			const logTaskTool = buildLogTaskTool(app);
			const { taskId, agentId } = await seed(db, ids);
			const result = await logTaskTool.handler({ note: "" }, makeContext(db, agentId, taskId));
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT when note is missing", async ({ db, app, ids }) => {
			const logTaskTool = buildLogTaskTool(app);
			const { taskId, agentId } = await seed(db, ids);
			const result = await logTaskTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{} as any,
				makeContext(db, agentId, taskId),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns NOT_FOUND when ctx.taskId does not exist", async ({ db, app, ids }) => {
			const logTaskTool = buildLogTaskTool(app);
			const { agentId } = await seed(db, ids);
			const ctx = { ...makeContext(db, agentId, ids("task-1")), taskId: ids("ghost-task") };
			const result = await logTaskTool.handler({ note: "x" }, ctx);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		});
	});
});
