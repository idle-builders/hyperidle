import {
	type HyperIdleDb,
	agents,
	bets,
	createTestDb,
	items,
	messages,
	products,
	sessions,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { type HandoffMetadata, handoff } from "../services/handoff-protocol.js";
import type { SessionContext } from "../services/session-lifecycle.js";

// --- Test helpers ---

function seedPrerequisites(db: HyperIdleDb): void {
	const now = new Date().toISOString();
	db.insert(products)
		.values({ id: "p1", name: "Test Product", phase: "build", createdAt: now })
		.run();
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
}

function insertAgent(
	db: HyperIdleDb,
	id: string,
	role: string,
	teamId: string,
	status = "active",
): void {
	const now = new Date().toISOString();
	db.insert(agents)
		.values({
			id,
			name: `Agent ${id}`,
			role,
			teamId,
			status,
			maxConcurrentSessions: 2,
			createdAt: now,
		})
		.run();
}

function insertTask(db: HyperIdleDb, id: string, state: string, ownerAgentId?: string): void {
	const now = new Date().toISOString();
	const threadId = `thread-${id}`;
	db.insert(threads).values({ id: threadId, kind: "task", createdAt: now }).run();
	db.insert(tasks)
		.values({
			id,
			betId: "b1",
			productId: "p1",
			teamId: "t1",
			ownerAgentId: ownerAgentId ?? null,
			title: `Task ${id}`,
			state,
			threadId,
			createdAt: now,
			updatedAt: now,
		})
		.run();
}

function insertSession(
	db: HyperIdleDb,
	id: string,
	taskId: string,
	agentId: string,
	state = "active",
): void {
	const now = new Date().toISOString();
	db.insert(sessions)
		.values({
			id,
			taskId,
			agentId,
			modelTier: "workhorse",
			startedAt: now,
			state,
			cost: 0,
		})
		.run();
}

function makeSessionContext(sessionId: string, agentId: string, taskId: string): SessionContext {
	return {
		sessionId,
		agentId,
		taskId,
		workspacePath: "/tmp/test-workspace",
		watcher: { stop: () => {} } as SessionContext["watcher"],
	};
}

function makeMetadata(overrides?: Partial<HandoffMetadata>): HandoffMetadata {
	return {
		context_id: "ctx-1",
		status: "in_progress",
		reason: "Need a builder to continue",
		artifacts: ["file1.ts", "file2.ts"],
		remaining_work: ["implement feature X", "write tests"],
		...overrides,
	};
}

describe("Handoff Protocol", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		seedPrerequisites(db);
	});

	describe("AC1: Agent A hands off to agent B", () => {
		it("ends A's session, sets B as owner, creates thread message with metadata", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			insertAgent(db, "agent-b", "builder", "t1");
			insertTask(db, "task-1", "in_progress", "agent-a");
			insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata();

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata,
			});

			expect(result.status).toBe("success");

			// A's session should be ended
			const session = db.select().from(sessions).where(eq(sessions.id, "session-a")).get();
			expect(session?.state).toBe("done");

			// B should be the owner
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.ownerAgentId).toBe("agent-b");

			// Thread message should exist with handoff metadata
			const threadMsgs = db
				.select()
				.from(messages)
				.where(eq(messages.threadId, "thread-task-1"))
				.all();
			expect(threadMsgs).toHaveLength(1);
			const body = JSON.parse(threadMsgs[0].body);
			expect(body.type).toBe("handoff");
			expect(body.context_id).toBe("ctx-1");
			expect(body.reason).toBe("Need a builder to continue");
			expect(body.artifacts).toEqual(["file1.ts", "file2.ts"]);
			expect(body.remaining_work).toEqual(["implement feature X", "write tests"]);
		});
	});

	describe("AC2: Handoff by role", () => {
		it("resolves toRole to available agent on same team", async () => {
			insertAgent(db, "agent-a", "product_manager", "t1");
			insertAgent(db, "agent-b", "builder", "t1");
			insertTask(db, "task-1", "in_progress", "agent-a");
			insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata();

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toRole: "builder",
				metadata,
			});

			expect(result.status).toBe("success");
			expect(result.targetAgentId).toBe("agent-b");

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.ownerAgentId).toBe("agent-b");
		});

		it("creates escalation item when no agent with role available", async () => {
			insertAgent(db, "agent-a", "product_manager", "t1");
			// No builder agents exist
			insertTask(db, "task-1", "in_progress", "agent-a");
			insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata();

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toRole: "builder",
				metadata,
			});

			expect(result.status).toBe("escalated");

			// Escalation item should be created
			const escalationItems = db.select().from(items).all();
			expect(escalationItems).toHaveLength(1);
			expect(escalationItems[0].kind).toBe("escalation");
			expect(escalationItems[0].title).toContain("builder");
		});

		it("excludes the handing-off agent from role resolution", async () => {
			// Agent A is also a builder -- should not hand off to itself
			insertAgent(db, "agent-a", "builder", "t1");
			insertTask(db, "task-1", "in_progress", "agent-a");
			insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata();

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toRole: "builder",
				metadata,
			});

			expect(result.status).toBe("escalated");
		});
	});

	describe("AC3: Handoff to human", () => {
		it("transitions task to blocked and creates review item", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			insertTask(db, "task-1", "in_progress", "agent-a");
			insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata({ status: "blocked", reason: "Need human review" });

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toHuman: true,
				metadata,
			});

			expect(result.status).toBe("success");

			// Task should be blocked
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.state).toBe("blocked");

			// Review item should be created
			const reviewItems = db.select().from(items).all();
			expect(reviewItems).toHaveLength(1);
			expect(reviewItems[0].kind).toBe("review");
			expect(reviewItems[0].title).toContain("task-1");
		});
	});

	describe("AC4: Thread message contains structured handoff metadata JSON", () => {
		it("includes all required fields in the thread message body", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			insertAgent(db, "agent-b", "builder", "t1");
			insertTask(db, "task-1", "in_progress", "agent-a");
			insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata({
				context_id: "ctx-42",
				status: "in_progress",
				reason: "Handing off for code review",
				artifacts: ["src/main.ts"],
				remaining_work: ["review PR #5"],
			});

			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata,
			});

			const threadMsgs = db
				.select()
				.from(messages)
				.where(eq(messages.threadId, "thread-task-1"))
				.all();
			expect(threadMsgs).toHaveLength(1);
			const body = JSON.parse(threadMsgs[0].body);
			expect(body).toEqual({
				type: "handoff",
				context_id: "ctx-42",
				status: "in_progress",
				reason: "Handing off for code review",
				artifacts: ["src/main.ts"],
				remaining_work: ["review PR #5"],
			});
		});
	});

	describe("AC5: Handoff with status failed includes error information", () => {
		it("includes error field in thread message when status is failed", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			insertAgent(db, "agent-b", "builder", "t1");
			insertTask(db, "task-1", "in_progress", "agent-a");
			insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata({
				status: "failed",
				reason: "Build failed",
				error: "TypeError: Cannot read properties of undefined",
			});

			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata,
			});

			const threadMsgs = db
				.select()
				.from(messages)
				.where(eq(messages.threadId, "thread-task-1"))
				.all();
			const body = JSON.parse(threadMsgs[0].body);
			expect(body.status).toBe("failed");
			expect(body.error).toBe("TypeError: Cannot read properties of undefined");
		});
	});

	describe("AC6: Task audit trail shows full handoff history", () => {
		it("logs handoff in task audit trail", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			insertAgent(db, "agent-b", "builder", "t1");
			insertTask(db, "task-1", "in_progress", "agent-a");
			insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata();

			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata,
			});

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			const audit = JSON.parse(task?.notes ?? "[]");
			const handoffEntry = audit.find((e: Record<string, unknown>) => e.type === "handoff");
			expect(handoffEntry).toBeDefined();
			expect(handoffEntry.fromAgent).toBe("agent-a");
			expect(handoffEntry.toAgent).toBe("agent-b");
			expect(handoffEntry.reason).toBe("Need a builder to continue");
			expect(handoffEntry.timestamp).toBeDefined();
		});

		it("preserves existing audit entries when adding handoff", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			insertAgent(db, "agent-b", "builder", "t1");

			// Insert task with existing audit trail
			const now = new Date().toISOString();
			const existingAudit = [{ from: "proposed", to: "accepted", timestamp: now }];
			const threadId = "thread-task-2";
			db.insert(threads).values({ id: threadId, kind: "task", createdAt: now }).run();
			db.insert(tasks)
				.values({
					id: "task-2",
					betId: "b1",
					productId: "p1",
					teamId: "t1",
					ownerAgentId: "agent-a",
					title: "Task 2",
					state: "in_progress",
					threadId,
					notes: JSON.stringify(existingAudit),
					createdAt: now,
					updatedAt: now,
				})
				.run();
			insertSession(db, "session-a2", "task-2", "agent-a");

			const ctx = makeSessionContext("session-a2", "agent-a", "task-2");
			const metadata = makeMetadata();

			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata,
			});

			const task = db.select().from(tasks).where(eq(tasks.id, "task-2")).get();
			const audit = JSON.parse(task?.notes ?? "[]");
			expect(audit).toHaveLength(2);
			expect(audit[0].from).toBe("proposed");
			expect(audit[1].type).toBe("handoff");
		});

		it("tracks multiple handoffs in sequence", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			insertAgent(db, "agent-b", "builder", "t1");
			insertAgent(db, "agent-c", "builder", "t1");
			insertTask(db, "task-1", "in_progress", "agent-a");
			insertSession(db, "session-a", "task-1", "agent-a");

			// First handoff: A -> B
			const ctxA = makeSessionContext("session-a", "agent-a", "task-1");
			await handoff(db, eventBus, {
				sessionContext: ctxA,
				toAgent: "agent-b",
				metadata: makeMetadata({ reason: "First handoff" }),
			});

			// Second handoff: B -> C
			insertSession(db, "session-b", "task-1", "agent-b");
			const ctxB = makeSessionContext("session-b", "agent-b", "task-1");
			await handoff(db, eventBus, {
				sessionContext: ctxB,
				toAgent: "agent-c",
				metadata: makeMetadata({ reason: "Second handoff" }),
			});

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			const audit = JSON.parse(task?.notes ?? "[]");
			const handoffEntries = audit.filter((e: Record<string, unknown>) => e.type === "handoff");
			expect(handoffEntries).toHaveLength(2);
			expect(handoffEntries[0].fromAgent).toBe("agent-a");
			expect(handoffEntries[0].toAgent).toBe("agent-b");
			expect(handoffEntries[1].fromAgent).toBe("agent-b");
			expect(handoffEntries[1].toAgent).toBe("agent-c");
		});
	});

	describe("edge cases", () => {
		it("throws when task not found", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			const ctx = makeSessionContext("session-a", "agent-a", "nonexistent-task");
			const metadata = makeMetadata();

			await expect(
				handoff(db, eventBus, { sessionContext: ctx, toAgent: "agent-a", metadata }),
			).rejects.toThrow("Task not found");
		});

		it("throws when target agent not found", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			insertTask(db, "task-1", "in_progress", "agent-a");
			insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata();

			await expect(
				handoff(db, eventBus, { sessionContext: ctx, toAgent: "nonexistent", metadata }),
			).rejects.toThrow("Agent not found");
		});
	});
});
