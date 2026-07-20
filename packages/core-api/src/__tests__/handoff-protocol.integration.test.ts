import {
	agentSessionRequests,
	bets,
	type HyperIdleDb,
	items,
	messages,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { HandoffMetadata } from "@hyperidle/policy";
import type { SessionContext } from "@hyperidle/run-orchestration";
// @lore O2: sessions.cost stripped; cost tracking moved to agents.costActual.
import { eq } from "drizzle-orm";
import { handoff } from "../services/policy-bindings.js";
import { registerHandoffTerminationRequester } from "../services/session-lifecycle-bindings.js";
import { describe, expect, test, vi } from "../test-fixtures.js";

// --- Test helpers ---

async function seedPrerequisites(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "Test Product", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "Test bet",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
}

async function insertAgent(
	db: HyperIdleDb,
	id: string,
	role: string,
	teamId: string,
	status = "active",
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id,
		name: `Agent ${id}`,
		role,
		teamId,
		status,
		maxConcurrentSessions: 2,
		createdAt: now,
	});
}

async function insertTask(
	db: HyperIdleDb,
	id: string,
	state: string,
	ownerAgentId?: string,
): Promise<void> {
	const now = new Date().toISOString();
	const threadId = `thread-${id}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-1",
		participants: JSON.stringify(["agent-1"]),
		lastActiveAt: now,
		createdAt: now,
	});

	await db.insert(tasks).values({
		id,
		betId: "b1",
		teamId: "p1",
		ownerAgentId: ownerAgentId ?? null,
		title: `Task ${id}`,
		state,
		threadId,
		createdAt: now,
		updatedAt: now,
	});
}

async function insertSession(
	db: HyperIdleDb,
	id: string,
	taskId: string,
	agentId: string,
	state = "active",
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(sessions).values({
		id,
		taskId,
		agentId,
		modelTier: "workhorse",
		startedAt: now,
		state,
	});
}

/** @lore AU19 Increment 3i fix round: a running request correlated to a session, for `registerHandoffTerminationRequester` coverage. */
async function insertRunningAgentSessionRequest(
	db: HyperIdleDb,
	id: string,
	sessionId: string,
	agentId: string,
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(agentSessionRequests).values({
		id,
		sourceKind: "task_run",
		sourceId: `source-${id}`,
		streamId: sessionId,
		agentId,
		promptMode: "task",
		sourceCorrelationJson: JSON.stringify({ kind: "task_run", sourceId: `source-${id}` }),
		idempotencyKey: `idem-${id}`,
		status: "running",
		sessionId,
		createdAt: now,
		updatedAt: now,
	});
}

function makeSessionContext(sessionId: string, agentId: string, taskId: string): SessionContext {
	return {
		sessionId,
		agentId,
		taskId,
		sandboxPath: "/tmp/test-workspace",
		ingestion: { dispose: () => {} } as SessionContext["ingestion"],
		traceId: "trace-test",
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
	describe("AC1: Agent A hands off to agent B", () => {
		test("ends A's session, sets B as owner, creates thread message with metadata", async ({
			db,
			eventBus,
		}) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");
			await insertTask(db, "task-1", "in_progress", "agent-a");
			await insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata();

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata,
			});

			expect(result.status).toBe("success");

			// A's session should be ended
			const [session] = await db.select().from(sessions).where(eq(sessions.id, "session-a"));
			expect(session?.state).toBe("done");

			// B should be the owner
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.ownerAgentId).toBe("agent-b");

			// Thread message should exist with handoff metadata
			const threadMsgs = await db
				.select()
				.from(messages)
				.where(eq(messages.threadId, "thread-task-1"));
			expect(threadMsgs).toHaveLength(1);
			// L1a: handoff message body lives in the JSON `payload` column
			// (subject/body dropped — see plan §5.3).
			const body = JSON.parse(threadMsgs[0]!.payload);
			expect(body.type).toBe("handoff");
			expect(body.context_id).toBe("ctx-1");
			expect(body.reason).toBe("Need a builder to continue");
			expect(body.artifacts).toEqual(["file1.ts", "file2.ts"]);
			expect(body.remaining_work).toEqual(["implement feature X", "write tests"]);
		});
	});

	describe("AC2: Handoff by role", () => {
		test("resolves toRole to available agent on same team", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "product_manager", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");
			await insertTask(db, "task-1", "in_progress", "agent-a");
			await insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata();

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toRole: "builder",
				metadata,
			});

			expect(result.status).toBe("success");
			expect(result.targetAgentId).toBe("agent-b");

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.ownerAgentId).toBe("agent-b");
		});

		test("creates escalation item when no agent with role available", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "product_manager", "t1");
			// No builder agents exist
			await insertTask(db, "task-1", "in_progress", "agent-a");
			await insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata();

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toRole: "builder",
				metadata,
			});

			expect(result.status).toBe("escalated");

			// Escalation item should be created
			const escalationItems = await db.select().from(items);
			expect(escalationItems).toHaveLength(1);
			expect(escalationItems[0]!.kind).toBe("escalation");
			expect(escalationItems[0]!.title).toContain("builder");
		});

		test("excludes the handing-off agent from role resolution", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			// Agent A is also a builder -- should not hand off to itself
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertTask(db, "task-1", "in_progress", "agent-a");
			await insertSession(db, "session-a", "task-1", "agent-a");

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
		test("transitions task to blocked and creates review item", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertTask(db, "task-1", "in_progress", "agent-a");
			await insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata({ status: "blocked", reason: "Need human review" });

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toHuman: true,
				metadata,
			});

			expect(result.status).toBe("success");

			// Task should be blocked
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("blocked");

			// Review item should be created
			const reviewItems = await db.select().from(items);
			expect(reviewItems).toHaveLength(1);
			expect(reviewItems[0]!.kind).toBe("review");
			expect(reviewItems[0]!.title).toContain("task-1");
		});
	});

	describe("AC4: Thread message contains structured handoff metadata JSON", () => {
		test("includes all required fields in the thread message body", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");
			await insertTask(db, "task-1", "in_progress", "agent-a");
			await insertSession(db, "session-a", "task-1", "agent-a");

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

			const threadMsgs = await db
				.select()
				.from(messages)
				.where(eq(messages.threadId, "thread-task-1"));
			expect(threadMsgs).toHaveLength(1);
			// L1a: handoff message body lives in the JSON `payload` column
			// (subject/body dropped — see plan §5.3).
			const body = JSON.parse(threadMsgs[0]!.payload);
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
		test("includes error field in thread message when status is failed", async ({
			db,
			eventBus,
		}) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");
			await insertTask(db, "task-1", "in_progress", "agent-a");
			await insertSession(db, "session-a", "task-1", "agent-a");

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

			const threadMsgs = await db
				.select()
				.from(messages)
				.where(eq(messages.threadId, "thread-task-1"));
			// L1a: handoff message body lives in the JSON `payload` column
			// (subject/body dropped — see plan §5.3).
			const body = JSON.parse(threadMsgs[0]!.payload);
			expect(body.status).toBe("failed");
			expect(body.error).toBe("TypeError: Cannot read properties of undefined");
		});
	});

	describe("AC6: Task audit trail shows full handoff history", () => {
		test("logs handoff in task audit trail", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");
			await insertTask(db, "task-1", "in_progress", "agent-a");
			await insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata();

			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata,
			});

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			const audit = JSON.parse(task?.auditTrail ?? "[]");
			const handoffEntry = audit.find((e: Record<string, unknown>) => e.type === "handoff");
			expect(handoffEntry).toBeDefined();
			expect(handoffEntry.fromAgent).toBe("agent-a");
			expect(handoffEntry.toAgent).toBe("agent-b");
			expect(handoffEntry.reason).toBe("Need a builder to continue");
			expect(handoffEntry.timestamp).toBeDefined();
		});

		test("preserves existing audit entries when adding handoff", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");

			// Insert task with existing audit trail (in the auditTrail column,
			// per the schema contract) AND agent prose in `notes` — handoff
			// must append to auditTrail and leave notes untouched.
			const now = new Date().toISOString();
			const existingAudit = [{ from: "proposed", to: "accepted", timestamp: now }];
			const agentProse = "Pre-handoff agent note prose.";
			const threadId = "thread-task-2";
			await db.insert(threads).values({
				id: threadId,
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: now,
				createdAt: now,
			});

			await db.insert(tasks).values({
				id: "task-2",
				betId: "b1",
				teamId: "p1",
				ownerAgentId: "agent-a",
				title: "Task 2",
				state: "in_progress",
				threadId,
				notes: agentProse,
				auditTrail: JSON.stringify(existingAudit),
				createdAt: now,
				updatedAt: now,
			});

			insertSession(db, "session-a2", "task-2", "agent-a");

			const ctx = makeSessionContext("session-a2", "agent-a", "task-2");
			const metadata = makeMetadata();

			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata,
			});

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-2"));
			const audit = JSON.parse(task?.auditTrail ?? "[]");
			expect(audit).toHaveLength(2);
			expect(audit[0].from).toBe("proposed");
			expect(audit[1].type).toBe("handoff");
			// Agent prose in `notes` must survive the handoff unchanged —
			// handoff writes to auditTrail, not notes.
			expect(task?.notes).toBe(agentProse);
		});

		test("tracks multiple handoffs in sequence", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");
			await insertAgent(db, "agent-c", "builder", "t1");
			await insertTask(db, "task-1", "in_progress", "agent-a");
			await insertSession(db, "session-a", "task-1", "agent-a");

			// First handoff: A -> B
			const ctxA = makeSessionContext("session-a", "agent-a", "task-1");
			await handoff(db, eventBus, {
				sessionContext: ctxA,
				toAgent: "agent-b",
				metadata: makeMetadata({ reason: "First handoff" }),
			});

			// Second handoff: B -> C
			await insertSession(db, "session-b", "task-1", "agent-b");
			const ctxB = makeSessionContext("session-b", "agent-b", "task-1");
			await handoff(db, eventBus, {
				sessionContext: ctxB,
				toAgent: "agent-c",
				metadata: makeMetadata({ reason: "Second handoff" }),
			});

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
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
		test("leaves tasks.notes prose untouched and appends handoff entry to tasks.auditTrail", async ({
			db,
			eventBus,
		}) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");

			// Seed task with agent-authored prose in `notes`. Handoff must
			// not touch this column.
			const now = new Date().toISOString();
			const agentProse = "Scribbled thought: feature is almost done.";
			const threadId = "thread-h1";
			await db.insert(threads).values({
				id: threadId,
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: now,
				createdAt: now,
			});

			await db.insert(tasks).values({
				id: "task-h1",
				betId: "b1",
				teamId: "p1",
				ownerAgentId: "agent-a",
				title: "H1 task",
				state: "in_progress",
				threadId,
				notes: agentProse,
				createdAt: now,
				updatedAt: now,
			});

			insertSession(db, "session-h1", "task-h1", "agent-a");

			const ctx = makeSessionContext("session-h1", "agent-a", "task-h1");
			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata: makeMetadata({ reason: "H1 reason" }),
			});

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-h1"));
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

		test("never writes the handoff entry into tasks.notes even when notes starts null", async ({
			db,
			eventBus,
		}) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");
			await insertTask(db, "task-h1-null", "in_progress", "agent-a");
			await insertSession(db, "session-h1-null", "task-h1-null", "agent-a");

			const ctx = makeSessionContext("session-h1-null", "agent-a", "task-h1-null");
			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata: makeMetadata(),
			});

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-h1-null"));
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
		test("preserves the agent's accumulated costActual on handoff", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");
			await insertTask(db, "task-h3", "in_progress", "agent-a");
			await insertSession(db, "session-h3", "task-h3", "agent-a");

			// Pre-accumulate cost on the agent.
			await db.update(users).set({ costActual: 150 }).where(eq(users.id, "agent-a"));

			const ctx = makeSessionContext("session-h3", "agent-a", "task-h3");
			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: "agent-b",
				metadata: makeMetadata(),
			});

			const [session] = await db.select().from(sessions).where(eq(sessions.id, "session-h3"));
			expect(session?.state).toBe("done");
			expect(session?.endedAt).toBeTruthy();
			// Key assertion: agents.costActual must survive the handoff unchanged.
			const [agent] = await db.select().from(users).where(eq(users.id, "agent-a"));
			expect(agent?.costActual).toBe(150);
		});
	});

	// ---------------- I1 adversary-M2 / security-M3: handoff is atomic ----------------
	describe("I1 M2: handoff wraps all DB mutations in one transaction", () => {
		test("rolls back session, task, auditTrail when messages INSERT throws", async ({
			db,
			eventBus,
		}) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");
			await insertTask(db, "task-atomic", "in_progress", "agent-a");
			await insertSession(db, "session-atomic", "task-atomic", "agent-a");
			// Bump the agent costActual so we can prove it survives the rollback.
			// @lore O2: sessions.cost stripped; rollback proof via agents.costActual.
			await db.update(users).set({ costActual: 250 }).where(eq(users.id, "agent-a"));

			// Force the `messages` INSERT inside the handoff transaction to throw.
			// @lore PGlite: In SQLite FK enforcement was typically off, so we
			// could corrupt tasks.threadId to a phantom id and let the messages
			// INSERT fail. In Postgres, FK constraints fire immediately, so the
			// UPDATE itself would fail before reaching the handoff call. Instead
			// we spy on `db.transaction`, intercept the `tx` object, and make
			// `tx.insert(messages, ...)` throw — producing the same rollback
			// semantics without needing to violate a constraint pre-handoff.
			const originalTransaction = db.transaction.bind(db);
			const txSpy = vi
				.spyOn(db, "transaction")
				// biome-ignore lint/suspicious/noExplicitAny: spy wrapping requires any for the callback type
				.mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
					// biome-ignore lint/suspicious/noExplicitAny: tx is the Drizzle transaction type
					return originalTransaction(async (tx: any) => {
						const originalTxInsert = tx.insert.bind(tx);
						vi.spyOn(tx, "insert").mockImplementation(
							// biome-ignore lint/suspicious/noExplicitAny: table parameter is any table reference
							(table: any) => {
								if (table === messages) {
									throw new Error("simulated messages INSERT failure (foreign key violation)");
								}
								return originalTxInsert(table);
							},
						);
						return callback(tx);
					});
				});

			// Capture any emitted events — none should fire because the
			// transaction rolls back and emission is post-commit.
			const emitted: Array<{ type: string }> = [];
			eventBus.on("*", (e: unknown) => emitted.push(e as { type: string }));

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

			txSpy.mockRestore();

			expect(thrown).toBeInstanceOf(Error);
			// The simulated error message (contains "foreign key" per the
			// comment above, matching the original FK violation intent).
			expect((thrown as Error).message.toLowerCase()).toContain("foreign key");

			// Session unchanged: still active, no endedAt.
			const [session] = await db.select().from(sessions).where(eq(sessions.id, "session-atomic"));
			expect(session?.state).toBe("active");
			expect(session?.endedAt).toBeFalsy();
			// @lore O2: sessions.cost stripped; prove rollback via agents.costActual.
			const [agentRow] = await db.select().from(users).where(eq(users.id, "agent-a"));
			expect(agentRow?.costActual).toBe(250);

			// Task: ownerAgentId still agent-a (ownership update rolled back),
			// auditTrail has no handoff entry (the tx rolled back all of its writes).
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-atomic"));
			expect(task?.ownerAgentId).toBe("agent-a");
			const audit = JSON.parse(task?.auditTrail ?? "[]") as Array<Record<string, unknown>>;
			const handoffEntry = audit.find((e) => e.type === "handoff");
			expect(handoffEntry).toBeUndefined();

			// No events emitted (neither task_state_changed nor item_created).
			expect(emitted).toHaveLength(0);
		});
	});

	describe("edge cases", () => {
		test("throws when task not found", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			const ctx = makeSessionContext("session-a", "agent-a", "nonexistent-task");
			const metadata = makeMetadata();

			await expect(
				handoff(db, eventBus, { sessionContext: ctx, toAgent: "agent-a", metadata }),
			).rejects.toThrow("Task not found");
		});

		test("throws when target agent not found", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertTask(db, "task-1", "in_progress", "agent-a");
			await insertSession(db, "session-a", "task-1", "agent-a");

			const ctx = makeSessionContext("session-a", "agent-a", "task-1");
			const metadata = makeMetadata();

			await expect(
				handoff(db, eventBus, { sessionContext: ctx, toAgent: "nonexistent", metadata }),
			).rejects.toThrow("Agent not found");
		});
	});

	// @lore AU19 Increment 3i fix round: `session_handoff_completed`'s `requestedBy`
	// field (added this fix round — see `SessionHandoffCompletedEvent`'s top `@lore`)
	// and `registerHandoffTerminationRequester`'s attribution threading.
	describe("§10.3 policy ⚠ session-lifecycle inversion: termination attribution", () => {
		test("emits session_handoff_completed carrying requestedBy = the outgoing agent", async ({
			db,
			eventBus,
		}) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");
			await insertTask(db, "task-1", "in_progress", "agent-a");
			await insertSession(db, "session-a", "task-1", "agent-a");

			const emitted: Array<{ type: string; requestedBy?: string }> = [];
			eventBus.on("session_handoff_completed", (e) => emitted.push(e));

			await handoff(db, eventBus, {
				sessionContext: makeSessionContext("session-a", "agent-a", "task-1"),
				toAgent: "agent-b",
				metadata: makeMetadata(),
			});

			expect(emitted).toHaveLength(1);
			expect(emitted[0]?.requestedBy).toBe("agent-a");
		});

		test("registerHandoffTerminationRequester writes terminationRequestedBy on the correlated request", async ({
			db,
			eventBus,
		}) => {
			await seedPrerequisites(db);
			await insertAgent(db, "agent-a", "builder", "t1");
			await insertAgent(db, "agent-b", "builder", "t1");
			await insertTask(db, "task-1", "in_progress", "agent-a");
			await insertSession(db, "session-a", "task-1", "agent-a");
			await insertRunningAgentSessionRequest(db, "req-1", "session-a", "agent-a");

			registerHandoffTerminationRequester(db, eventBus);

			await handoff(db, eventBus, {
				sessionContext: makeSessionContext("session-a", "agent-a", "task-1"),
				toAgent: "agent-b",
				metadata: makeMetadata(),
			});

			// The subscriber's own DB work is fire-and-forget (§10.3-sanctioned) —
			// wait a tick for it to settle, same idiom writeback-subscriber.test.ts uses.
			await new Promise((resolve) => setTimeout(resolve, 20));

			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, "req-1"));
			expect(request?.terminationReason).toBe("handoff");
			expect(request?.terminationRequestedBy).toBe("agent-a");
		});
	});
});
