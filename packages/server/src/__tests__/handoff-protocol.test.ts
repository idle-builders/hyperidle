import {
	bets,
	createTestDb,
	type HyperIdleDb,
	items,
	messages,
	products,
	sessions,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
// @lore O2: sessions.cost stripped; cost tracking moved to agents.costActual.
import { EventBus } from "@hyperidle/shared";
import { eq, sql } from "drizzle-orm";
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
	db.insert(users)
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
	db.insert(threads)
		.values({
			id: threadId,
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
			// L1a: handoff message body lives in the JSON `payload` column
			// (subject/body dropped — see plan §5.3).
			const body = JSON.parse(threadMsgs[0].payload);
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
			// L1a: handoff message body lives in the JSON `payload` column
			// (subject/body dropped — see plan §5.3).
			const body = JSON.parse(threadMsgs[0].payload);
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
			// L1a: handoff message body lives in the JSON `payload` column
			// (subject/body dropped — see plan §5.3).
			const body = JSON.parse(threadMsgs[0].payload);
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
			const audit = JSON.parse(task?.auditTrail ?? "[]");
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

			// Insert task with existing audit trail (in the auditTrail column,
			// per the schema contract) AND agent prose in `notes` — handoff
			// must append to auditTrail and leave notes untouched.
			const now = new Date().toISOString();
			const existingAudit = [{ from: "proposed", to: "accepted", timestamp: now }];
			const agentProse = "Pre-handoff agent note prose.";
			const threadId = "thread-task-2";
			db.insert(threads)
				.values({
					id: threadId,
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
					id: "task-2",
					betId: "b1",
					productId: "p1",
					teamId: "t1",
					ownerAgentId: "agent-a",
					title: "Task 2",
					state: "in_progress",
					threadId,
					notes: agentProse,
					auditTrail: JSON.stringify(existingAudit),
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
			const audit = JSON.parse(task?.auditTrail ?? "[]");
			expect(audit).toHaveLength(2);
			expect(audit[0].from).toBe("proposed");
			expect(audit[1].type).toBe("handoff");
			// Agent prose in `notes` must survive the handoff unchanged —
			// handoff writes to auditTrail, not notes.
			expect(task?.notes).toBe(agentProse);
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
			const audit = JSON.parse(task?.auditTrail ?? "[]");
			const handoffEntries = audit.filter((e: Record<string, unknown>) => e.type === "handoff");
			expect(handoffEntries).toHaveLength(2);
			expect(handoffEntries[0].fromAgent).toBe("agent-a");
			expect(handoffEntries[0].toAgent).toBe("agent-b");
			expect(handoffEntries[1].fromAgent).toBe("agent-b");
			expect(handoffEntries[1].toAgent).toBe("agent-c");
		});
	});

	// ---------------- I1 / Handoff data integrity (H1, H3) ----------------
	describe("I1 H1: handoff writes to auditTrail, not notes", () => {
		it("leaves tasks.notes prose untouched and appends handoff entry to tasks.auditTrail", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			insertAgent(db, "agent-b", "builder", "t1");

			// Seed task with agent-authored prose in `notes`. Handoff must
			// not touch this column.
			const now = new Date().toISOString();
			const agentProse = "Scribbled thought: feature is almost done.";
			const threadId = "thread-h1";
			db.insert(threads)
				.values({
					id: threadId,
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
					id: "task-h1",
					betId: "b1",
					productId: "p1",
					teamId: "t1",
					ownerAgentId: "agent-a",
					title: "H1 task",
					state: "in_progress",
					threadId,
					notes: agentProse,
					createdAt: now,
					updatedAt: now,
				})
				.run();
			insertSession(db, "session-h1", "task-h1", "agent-a");

			const ctx = makeSessionContext("session-h1", "agent-a", "task-h1");
			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata: makeMetadata({ reason: "H1 reason" }),
			});

			const task = db.select().from(tasks).where(eq(tasks.id, "task-h1")).get();
			// notes prose preserved verbatim.
			expect(task?.notes).toBe(agentProse);
			// auditTrail contains the handoff entry (and only JSON, no prose).
			expect(task?.auditTrail).toBeTruthy();
			const audit = JSON.parse(task?.auditTrail ?? "[]");
			const handoffEntry = audit.find((e: Record<string, unknown>) => e.type === "handoff");
			expect(handoffEntry).toBeDefined();
			expect(handoffEntry.fromAgent).toBe("agent-a");
			expect(handoffEntry.toAgent).toBe("agent-b");
			expect(handoffEntry.reason).toBe("H1 reason");
		});

		it("never writes the handoff entry into tasks.notes even when notes starts null", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			insertAgent(db, "agent-b", "builder", "t1");
			insertTask(db, "task-h1-null", "in_progress", "agent-a");
			insertSession(db, "session-h1-null", "task-h1-null", "agent-a");

			const ctx = makeSessionContext("session-h1-null", "agent-a", "task-h1-null");
			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata: makeMetadata(),
			});

			const task = db.select().from(tasks).where(eq(tasks.id, "task-h1-null")).get();
			// notes must not have been populated with a handoff JSON blob.
			if (task?.notes !== null && task?.notes !== undefined) {
				// If anything landed in notes, it must not parse as a JSON
				// array of audit entries — notes is the agent-prose lane.
				let parsed: unknown = null;
				try {
					parsed = JSON.parse(task.notes);
				} catch {
					// not JSON — fine, that's prose.
					parsed = null;
				}
				if (Array.isArray(parsed)) {
					const hasHandoff = parsed.some(
						(e) =>
							typeof e === "object" &&
							e !== null &&
							(e as Record<string, unknown>).type === "handoff",
					);
					expect(hasHandoff).toBe(false);
				}
			}
			// auditTrail is where the handoff entry must live.
			const audit = JSON.parse(task?.auditTrail ?? "[]");
			const hasHandoff = audit.some((e: Record<string, unknown>) => e.type === "handoff");
			expect(hasHandoff).toBe(true);
		});
	});

	describe("I1 H3: handoff does NOT zero users.costActual", () => {
		// @lore O2: sessions.cost stripped; cost tracking moved to agents.costActual.
		// The test now verifies that agents.costActual is preserved across a handoff.
		it("preserves the agent's accumulated costActual on handoff", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			insertAgent(db, "agent-b", "builder", "t1");
			insertTask(db, "task-h3", "in_progress", "agent-a");
			insertSession(db, "session-h3", "task-h3", "agent-a");

			// Pre-accumulate cost on the agent.
			db.update(users).set({ costActual: 150 }).where(eq(users.id, "agent-a")).run();

			const ctx = makeSessionContext("session-h3", "agent-a", "task-h3");
			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata: makeMetadata(),
			});

			const session = db.select().from(sessions).where(eq(sessions.id, "session-h3")).get();
			expect(session?.state).toBe("done");
			expect(session?.endedAt).toBeTruthy();
			// Key assertion: agents.costActual must survive the handoff unchanged.
			const agent = db.select().from(users).where(eq(users.id, "agent-a")).get();
			expect(agent?.costActual).toBe(150);
		});
	});

	// ---------------- I1 adversary-M2 / security-M3: handoff is atomic ----------------
	describe("I1 M2: handoff wraps all DB mutations in one transaction", () => {
		it("rolls back session, task, auditTrail when messages INSERT throws", async () => {
			insertAgent(db, "agent-a", "builder", "t1");
			insertAgent(db, "agent-b", "builder", "t1");
			insertTask(db, "task-atomic", "in_progress", "agent-a");
			insertSession(db, "session-atomic", "task-atomic", "agent-a");
			// Bump the agent costActual so we can prove it survives the rollback.
			// @lore O2: sessions.cost stripped; rollback proof via agents.costActual.
			db.update(users).set({ costActual: 250 }).where(eq(users.id, "agent-a")).run();

			// Force the `messages` INSERT inside the handoff transaction to
			// throw by dropping the referenced thread row. We temporarily
			// disable the foreign_keys pragma so we can delete the thread
			// while `tasks.threadId` still points at it (tasks.threadId is
			// FK-restricted). The pragma is re-enabled before calling
			// handoff so messages.threadId FK enforcement is live.
			db.run(sql`PRAGMA foreign_keys = OFF`);
			db.delete(threads).where(eq(threads.id, "thread-task-atomic")).run();
			db.run(sql`PRAGMA foreign_keys = ON`);

			// Capture any emitted events — none should fire because the
			// transaction rolls back and emission is post-commit.
			const emitted: Array<{ type: string }> = [];
			eventBus.on("*", (e) => emitted.push(e));

			const ctx = makeSessionContext("session-atomic", "agent-a", "task-atomic");
			let thrown: unknown = null;
			try {
				await handoff(db, eventBus, {
					sessionContext: ctx,
					toAgent: "agent-b",
					metadata: makeMetadata(),
				});
			} catch (err) {
				thrown = err;
			}

			expect(thrown).toBeInstanceOf(Error);
			expect((thrown as Error).message).toContain("FOREIGN KEY");

			// Session unchanged: still active, no endedAt.
			const session = db.select().from(sessions).where(eq(sessions.id, "session-atomic")).get();
			expect(session?.state).toBe("active");
			expect(session?.endedAt).toBeFalsy();
			// @lore O2: sessions.cost stripped; prove rollback via agents.costActual.
			const agentRow = db.select().from(users).where(eq(users.id, "agent-a")).get();
			expect(agentRow?.costActual).toBe(250);

			// Task unchanged: ownership still agent-a, auditTrail has no
			// handoff entry (the tx rolled back all of its writes).
			const task = db.select().from(tasks).where(eq(tasks.id, "task-atomic")).get();
			expect(task?.ownerAgentId).toBe("agent-a");
			const audit = JSON.parse(task?.auditTrail ?? "[]") as Array<Record<string, unknown>>;
			const handoffEntry = audit.find((e) => e.type === "handoff");
			expect(handoffEntry).toBeUndefined();

			// No events emitted (neither task_state_changed nor item_created).
			expect(emitted).toHaveLength(0);
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
