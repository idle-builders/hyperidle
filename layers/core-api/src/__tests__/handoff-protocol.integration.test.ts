import { buildRunOrchestrationComposition } from "@hyperidle/agent-orchestration";
import {
	agentSessionRequests,
	agentWorkIntents,
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
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { AdapterPool, createHarnessAdapter } from "@hyperidle/harness-registry";
import type { HandoffMetadata } from "@hyperidle/policy";
import type { RunTransitionSpec } from "@hyperidle/run-orchestration";
import { eq, inArray, sql } from "drizzle-orm";
import { buildProductionHandoff } from "../services/policy-bindings.js";

type SessionContext = Extract<RunTransitionSpec, { target: "session" }>["context"];

/**
 * @lore AU31 §2.1(b)/§5: `runtimeDeps`/`startRuntime` are no longer module-
 * level exports — this test overrides `composition.provisioner` with a fake
 * (`{} as never`, below) anyway, so the real `harnessRuntime`/
 * `returnStatusTool` this composition wants never actually run; both are
 * throwaway placeholders (never called — the override replaces them before
 * `startRuntime` reaches them).
 */
const { runtimeDeps, startRuntime } = buildRunOrchestrationComposition({
	harnessRuntime: {} as never,
	returnStatusTool: {} as never,
});

import { describe, expect, test, vi } from "../__testing__/test-fixtures.js";

// --- Test helpers ---

async function seedPrerequisites(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: ids("p1"), name: "Test Product", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: ids("t1"), teamId: ids("p1"), capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(bets).values({
		id: ids("b1"),
		teamId: ids("p1"),
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
		createdAt: now,
	});
}

async function insertTask(
	db: HyperIdleDb,
	ids: ScopedIds,
	id: string,
	state: string,
	ownerAgentId?: string,
): Promise<void> {
	const now = new Date().toISOString();
	const threadId = `thread-${id}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: ids("task-1"),
		initiatorId: ids("agent-1"),
		participants: JSON.stringify([ids("agent-1")]),
		lastActiveAt: now,
		createdAt: now,
	});

	await db.insert(tasks).values({
		id,
		betId: ids("b1"),
		teamId: ids("p1"),
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
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-1"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-a"), ids("task-1"), ids("agent-a"));

			const ctx = makeSessionContext(ids("session-a"), ids("agent-a"), ids("task-1"));
			const metadata = makeMetadata();

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: ids("agent-b"),
				metadata,
			});

			expect(result.status).toBe("success");

			// A's session should be ended
			const [session] = await db
				.select()
				.from(sessions)
				.where(eq(sessions.id, ids("session-a")));
			expect(session?.state).toBe("done");

			// B should be the owner
			const [task] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-1")));
			expect(task?.ownerAgentId).toBe(ids("agent-b"));

			// Thread message should exist with handoff metadata
			const threadMsgs = await db
				.select()
				.from(messages)
				.where(eq(messages.threadId, `thread-${ids("task-1")}`));
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
		test("resolves toRole to available agent on same team", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "product_manager", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-1"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-a"), ids("task-1"), ids("agent-a"));

			const ctx = makeSessionContext(ids("session-a"), ids("agent-a"), ids("task-1"));
			const metadata = makeMetadata();

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toRole: "builder",
				metadata,
			});

			expect(result.status).toBe("success");
			expect(result.targetAgentId).toBe(ids("agent-b"));

			const [task] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-1")));
			expect(task?.ownerAgentId).toBe(ids("agent-b"));
		});

		test("creates escalation item when no agent with role available", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "product_manager", ids("t1"));
			// No builder agents exist
			await insertTask(db, ids, ids("task-1"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-a"), ids("task-1"), ids("agent-a"));

			const ctx = makeSessionContext(ids("session-a"), ids("agent-a"), ids("task-1"));
			const metadata = makeMetadata();

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toRole: "builder",
				metadata,
			});

			expect(result.status).toBe("escalated");

			// P1: scope — escalation items from this test
			const allItems = await db.select().from(items).where(sql`1=1`);
			const escalationItems = allItems.filter(
				(i) => i.kind === "escalation" && (i.title ?? "").includes("builder"),
			);
			expect(escalationItems).toHaveLength(1);
			expect(escalationItems[0]!.kind).toBe("escalation");
			expect(escalationItems[0]!.title).toContain("builder");
		});

		test("excludes the handing-off agent from role resolution", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			// Agent A is also a builder -- should not hand off to itself
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-1"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-a"), ids("task-1"), ids("agent-a"));

			const ctx = makeSessionContext(ids("session-a"), ids("agent-a"), ids("task-1"));
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
		test("transitions task to blocked and creates review item", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-1"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-a"), ids("task-1"), ids("agent-a"));

			const ctx = makeSessionContext(ids("session-a"), ids("agent-a"), ids("task-1"));
			const metadata = makeMetadata({ status: "blocked", reason: "Need human review" });

			const result = await handoff(db, eventBus, {
				sessionContext: ctx,
				toHuman: true,
				metadata,
			});

			expect(result.status).toBe("success");

			// Task should be blocked
			const [task] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-1")));
			expect(task?.state).toBe("blocked");

			// P1: scope — review items from this test
			const allItems = await db.select().from(items).where(sql`1=1`);
			const reviewItems = allItems.filter(
				(i) => i.kind === "review" && (i.title ?? "").includes(ids("task-1")),
			);
			expect(reviewItems).toHaveLength(1);
			expect(reviewItems[0]!.kind).toBe("review");
			expect(reviewItems[0]!.title).toContain(ids("task-1"));
		});
	});

	describe("AC4: Thread message contains structured handoff metadata JSON", () => {
		test("includes all required fields in the thread message body", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-1"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-a"), ids("task-1"), ids("agent-a"));

			const ctx = makeSessionContext(ids("session-a"), ids("agent-a"), ids("task-1"));
			const metadata = makeMetadata({
				context_id: "ctx-42",
				status: "in_progress",
				reason: "Handing off for code review",
				artifacts: ["src/main.ts"],
				remaining_work: ["review PR #5"],
			});

			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: ids("agent-b"),
				metadata,
			});

			const threadMsgs = await db
				.select()
				.from(messages)
				.where(eq(messages.threadId, `thread-${ids("task-1")}`));
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
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-1"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-a"), ids("task-1"), ids("agent-a"));

			const ctx = makeSessionContext(ids("session-a"), ids("agent-a"), ids("task-1"));
			const metadata = makeMetadata({
				status: "failed",
				reason: "Build failed",
				error: "TypeError: Cannot read properties of undefined",
			});

			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: ids("agent-b"),
				metadata,
			});

			const threadMsgs = await db
				.select()
				.from(messages)
				.where(eq(messages.threadId, `thread-${ids("task-1")}`));
			// L1a: handoff message body lives in the JSON `payload` column
			// (subject/body dropped — see plan §5.3).
			const body = JSON.parse(threadMsgs[0]!.payload);
			expect(body.status).toBe("failed");
			expect(body.error).toBe("TypeError: Cannot read properties of undefined");
		});
	});

	describe("AC6: Task audit trail shows full handoff history", () => {
		test("logs handoff in task audit trail", async ({ db, eventBus, agentOrchestration, ids }) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-1"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-a"), ids("task-1"), ids("agent-a"));

			const ctx = makeSessionContext(ids("session-a"), ids("agent-a"), ids("task-1"));
			const metadata = makeMetadata();

			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: ids("agent-b"),
				metadata,
			});

			const [task] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-1")));
			const audit = JSON.parse(task?.auditTrail ?? "[]");
			const handoffEntry = audit.find((e: Record<string, unknown>) => e.type === "handoff");
			expect(handoffEntry).toBeDefined();
			expect(handoffEntry.fromAgent).toBe(ids("agent-a"));
			expect(handoffEntry.toAgent).toBe(ids("agent-b"));
			expect(handoffEntry.reason).toBe("Need a builder to continue");
			expect(handoffEntry.timestamp).toBeDefined();
		});

		test("preserves existing audit entries when adding handoff", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));

			// Insert task with existing audit trail (in the auditTrail column,
			// per the schema contract) AND agent prose in `notes` — handoff
			// must append to auditTrail and leave notes untouched.
			const now = new Date().toISOString();
			const existingAudit = [{ from: "proposed", to: "accepted", timestamp: now }];
			const agentProse = "Pre-handoff agent note prose.";
			const threadId = ids("thread-task-2");
			await db.insert(threads).values({
				id: threadId,
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: now,
				createdAt: now,
			});

			await db.insert(tasks).values({
				id: ids("task-2"),
				betId: ids("b1"),
				teamId: ids("p1"),
				ownerAgentId: ids("agent-a"),
				title: "Task 2",
				state: "in_progress",
				threadId,
				notes: agentProse,
				auditTrail: JSON.stringify(existingAudit),
				createdAt: now,
				updatedAt: now,
			});

			insertSession(db, ids("session-a2"), ids("task-2"), ids("agent-a"));

			const ctx = makeSessionContext(ids("session-a2"), ids("agent-a"), ids("task-2"));
			const metadata = makeMetadata();

			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: ids("agent-b"),
				metadata,
			});

			const [task] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-2")));
			const audit = JSON.parse(task?.auditTrail ?? "[]");
			expect(audit).toHaveLength(2);
			expect(audit[0].from).toBe("proposed");
			expect(audit[1].type).toBe("handoff");
			// Agent prose in `notes` must survive the handoff unchanged —
			// handoff writes to auditTrail, not notes.
			expect(task?.notes).toBe(agentProse);
		});

		test("tracks multiple handoffs in sequence", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-c"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-1"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-a"), ids("task-1"), ids("agent-a"));

			// First handoff: A -> B
			const ctxA = makeSessionContext(ids("session-a"), ids("agent-a"), ids("task-1"));
			await handoff(db, eventBus, {
				sessionContext: ctxA,
				toAgent: ids("agent-b"),
				metadata: makeMetadata({ reason: "First handoff" }),
			});

			// Second handoff: B -> C
			await insertSession(db, ids("session-b"), ids("task-1"), ids("agent-b"));
			const ctxB = makeSessionContext(ids("session-b"), ids("agent-b"), ids("task-1"));
			await handoff(db, eventBus, {
				sessionContext: ctxB,
				toAgent: ids("agent-c"),
				metadata: makeMetadata({ reason: "Second handoff" }),
			});

			const [task] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-1")));
			const audit = JSON.parse(task?.auditTrail ?? "[]");
			const handoffEntries = audit.filter((e: Record<string, unknown>) => e.type === "handoff");
			expect(handoffEntries).toHaveLength(2);
			expect(handoffEntries[0].fromAgent).toBe(ids("agent-a"));
			expect(handoffEntries[0].toAgent).toBe(ids("agent-b"));
			expect(handoffEntries[1].fromAgent).toBe(ids("agent-b"));
			expect(handoffEntries[1].toAgent).toBe(ids("agent-c"));
		});
	});

	// ---------------- I1 / Handoff data integrity (H1, H3) ----------------
	describe("I1 H1: handoff writes to auditTrail, not notes", () => {
		test("leaves tasks.notes prose untouched and appends handoff entry to tasks.auditTrail", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));

			// Seed task with agent-authored prose in `notes`. Handoff must
			// not touch this column.
			const now = new Date().toISOString();
			const agentProse = "Scribbled thought: feature is almost done.";
			const threadId = ids("thread-h1");
			await db.insert(threads).values({
				id: threadId,
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: now,
				createdAt: now,
			});

			await db.insert(tasks).values({
				id: ids("task-h1"),
				betId: ids("b1"),
				teamId: ids("p1"),
				ownerAgentId: ids("agent-a"),
				title: "H1 task",
				state: "in_progress",
				threadId,
				notes: agentProse,
				createdAt: now,
				updatedAt: now,
			});

			insertSession(db, ids("session-h1"), ids("task-h1"), ids("agent-a"));

			const ctx = makeSessionContext(ids("session-h1"), ids("agent-a"), ids("task-h1"));
			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: ids("agent-b"),
				metadata: makeMetadata({ reason: "H1 reason" }),
			});

			const [task] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-h1")));
			// notes prose preserved verbatim.
			expect(task?.notes).toBe(agentProse);
			// auditTrail contains the handoff entry (and only JSON, no prose).
			expect(task?.auditTrail).toBeTruthy();
			const audit = JSON.parse(task?.auditTrail ?? "[]");
			const handoffEntry = audit.find((e: Record<string, unknown>) => e.type === "handoff");
			expect(handoffEntry).toBeDefined();
			expect(handoffEntry.fromAgent).toBe(ids("agent-a"));
			expect(handoffEntry.toAgent).toBe(ids("agent-b"));
			expect(handoffEntry.reason).toBe("H1 reason");
		});

		test("never writes the handoff entry into tasks.notes even when notes starts null", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-h1-null"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-h1-null"), ids("task-h1-null"), ids("agent-a"));

			const ctx = makeSessionContext(ids("session-h1-null"), ids("agent-a"), ids("task-h1-null"));
			await handoff(db, eventBus, {
				sessionContext: ctx,
				toAgent: ids("agent-b"),
				metadata: makeMetadata(),
			});

			const [task] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-h1-null")));
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

	// @lore AU21 Increment 14a: "I1 H3: handoff does NOT zero users.costActual"
	// is deleted along with the rest of the cost feature — the column is
	// dropped, no replacement.

	// ---------------- I1 adversary-M2 / security-M3: handoff is atomic ----------------
	describe("I1 M2: handoff wraps all DB mutations in one transaction", () => {
		test("concurrent handoffs claim task once without duplicate intent or audit", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-c"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-concurrent"), "in_progress", ids("agent-a"));
			const expectedVersion = "2099-01-01T00:00:00.000Z";
			await db
				.update(tasks)
				.set({ updatedAt: expectedVersion })
				.where(eq(tasks.id, ids("task-concurrent")));
			await insertSession(db, ids("session-concurrent-1"), ids("task-concurrent"), ids("agent-a"));
			await insertSession(db, ids("session-concurrent-2"), ids("task-concurrent"), ids("agent-a"));
			const emitted: Array<{ type: string }> = [];
			eventBus.on("*", (event: unknown) => emitted.push(event as { type: string }));

			const outcomes = await Promise.allSettled([
				handoff(db, eventBus, {
					sessionContext: makeSessionContext(
						ids("session-concurrent-1"),
						ids("agent-a"),
						ids("task-concurrent"),
					),
					toAgent: ids("agent-b"),
					metadata: makeMetadata(),
				}),
				handoff(db, eventBus, {
					sessionContext: makeSessionContext(
						ids("session-concurrent-2"),
						ids("agent-a"),
						ids("task-concurrent"),
					),
					toAgent: ids("agent-c"),
					metadata: makeMetadata(),
				}),
			]);

			expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
			expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
			const [task] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-concurrent")));
			expect(task?.updatedAt).toBe("2099-01-01T00:00:00.001Z");
			const audit = JSON.parse(task?.auditTrail ?? "[]") as Array<{ type?: string }>;
			expect(audit.filter((entry) => entry.type === "handoff")).toHaveLength(1);
			// P1: scope — intents created by this test's handoff
			// (kind=task_run, sourceKind=task_dispatch_attempt — the handoff's
			// intent shape; scoped ids prevent cross-test collision)
			const allIntents = await db.select().from(agentWorkIntents).where(sql`1=1`);
			const myIntents = allIntents.filter(
				(i) => i.kind === "task_run" && i.sourceKind === "task_dispatch_attempt",
			);
			expect(myIntents).toHaveLength(1);
			// AU31 §3.1 site 7 — INVERTED.
			const competingSessions = await db
				.select()
				.from(sessions)
				.where(inArray(sessions.id, [ids("session-concurrent-1"), ids("session-concurrent-2")]));
			expect(competingSessions.filter((session) => session.state === "done")).toHaveLength(2);
			expect(competingSessions.filter((session) => session.state === "active")).toHaveLength(0);
			expect(emitted.filter((event) => event.type === "session_handoff_completed")).toHaveLength(1);
		});

		test("rolls back session, task, auditTrail when messages INSERT throws", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-atomic"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-atomic"), ids("task-atomic"), ids("agent-a"));

			// Force the `messages` INSERT inside the handoff transaction to throw.
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

			const ctx = makeSessionContext(ids("session-atomic"), ids("agent-a"), ids("task-atomic"));
			let thrown: unknown = null;
			try {
				await handoff(db, eventBus, {
					sessionContext: ctx,
					toAgent: ids("agent-b"),
					metadata: makeMetadata(),
				});
			} catch (err) {
				thrown = err;
			}

			txSpy.mockRestore();

			expect(thrown).toBeInstanceOf(Error);
			expect((thrown as Error).message.toLowerCase()).toContain("foreign key");

			const [session] = await db
				.select()
				.from(sessions)
				.where(eq(sessions.id, ids("session-atomic")));
			expect(session?.state).toBe("done");
			expect(session?.endedAt).toBeTruthy();

			const [task] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-atomic")));
			expect(task?.ownerAgentId).toBe(ids("agent-a"));
			const audit = JSON.parse(task?.auditTrail ?? "[]") as Array<Record<string, unknown>>;
			const handoffEntry = audit.find((e) => e.type === "handoff");
			expect(handoffEntry).toBeUndefined();

			// No events emitted (neither task_state_changed nor item_created).
			expect(emitted).toHaveLength(0);
		});
	});

	describe("edge cases", () => {
		test("throws when task not found", async ({ db, eventBus, agentOrchestration, ids }) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			const ctx = makeSessionContext(ids("session-a"), ids("agent-a"), ids("nonexistent-task"));
			const metadata = makeMetadata();

			await expect(
				handoff(db, eventBus, {
					sessionContext: ctx,
					toAgent: ids("agent-a"),
					metadata,
				}),
			).rejects.toThrow("Task not found");
		});

		test("throws when target agent not found", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-1"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-a"), ids("task-1"), ids("agent-a"));

			const ctx = makeSessionContext(ids("session-a"), ids("agent-a"), ids("task-1"));
			const metadata = makeMetadata();

			await expect(
				handoff(db, eventBus, {
					sessionContext: ctx,
					toAgent: ids("nonexistent"),
					metadata,
				}),
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
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-1"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-a"), ids("task-1"), ids("agent-a"));

			const emitted: Array<{ type: string; requestedBy?: string }> = [];
			eventBus.on("session_handoff_completed", (e) => emitted.push(e));

			await handoff(db, eventBus, {
				sessionContext: makeSessionContext(ids("session-a"), ids("agent-a"), ids("task-1")),
				toAgent: ids("agent-b"),
				metadata: makeMetadata(),
			});

			expect(emitted).toHaveLength(1);
			expect(emitted[0]?.requestedBy).toBe(ids("agent-a"));
		});

		test("registerHandoffTerminationRequester writes terminationRequestedBy on the correlated request", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const handoff = buildProductionHandoff(agentOrchestration);
			await seedPrerequisites(db, ids);
			await insertAgent(db, ids("agent-a"), "builder", ids("t1"));
			await insertAgent(db, ids("agent-b"), "builder", ids("t1"));
			await insertTask(db, ids, ids("task-1"), "in_progress", ids("agent-a"));
			await insertSession(db, ids("session-a"), ids("task-1"), ids("agent-a"));
			const runtime = await startRuntime(
				runtimeDeps(db, eventBus, {
					composition: {
						context: {} as never,
						provisioner: {} as never,
						writeback: { db, knowledge: {} as never },
						worker: {
							pool: new AdapterPool(),
							adapterFactory: {
								create: (ws, registration) =>
									createHarnessAdapter({
										kind: "remote",
										ws,
										registration: {
											type: "register",
											id: registration.id,
											name: String(registration.name),
											modelProviders: Array.isArray(registration.modelProviders)
												? registration.modelProviders.map(String)
												: [],
											maxConcurrent: Number(registration.maxConcurrent),
										},
									}),
							},
						},
					},
				}),
			);
			await insertRunningAgentSessionRequest(db, ids("req-1"), ids("session-a"), ids("agent-a"));

			await handoff(db, eventBus, {
				sessionContext: makeSessionContext(ids("session-a"), ids("agent-a"), ids("task-1")),
				toAgent: ids("agent-b"),
				metadata: makeMetadata(),
			});

			// The subscriber's own DB work is fire-and-forget (§10.3-sanctioned) —
			// wait a tick for it to settle, same idiom writeback-subscriber.test.ts uses.
			await new Promise((resolve) => setTimeout(resolve, 20));

			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, ids("req-1")));
			expect(request?.terminationReason).toBe("handoff");
			expect(request?.terminationRequestedBy).toBe(ids("agent-a"));
			await runtime.dispose();
		});
	});
});
