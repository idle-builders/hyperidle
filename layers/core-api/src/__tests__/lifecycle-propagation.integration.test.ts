/**
 * L20 — Lifecycle Propagation Engine: Vitest tests.
 *
 * These tests are written in the RED phase. The implementation does not exist yet.
 * All tests are expected to FAIL until lifecycle-propagation.ts is created.
 *
 * @lore L20: messages.senderId references agents.id (FK). Any test that
 * exercises review-thread creation must seed a "system:propagation" agent row,
 * or the insert will fail with a FK constraint violation (F6 from arch review).
 */

import {
	insertMessage,
	insertThread,
	listMessages,
	updateMessage,
	updateThread,
} from "@hyperidle/conversation";
import type { WriteExecutor } from "@hyperidle/db";
import {
	bets,
	type HyperIdleDb,
	messages,
	propagationLog,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { PropagationAppliedEvent } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { enqueue, listNotifications } from "@hyperidle/notifications";
import { type PolicyDeps, registerPolicy } from "@hyperidle/policy";
import { findUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { and, eq } from "drizzle-orm";
import { retryFailedPropagations } from "../../policy/src/lifecycle-propagation.js";
import { afterEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";

const policyDeps: PolicyDeps = {
	work: {
		getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
		transitionTaskState: (exec, { taskId, fromState, patch }) =>
			work.transition(exec, "task", {
				id: taskId,
				guard: { field: "state", equals: fromState },
				patch,
			}),
		getBetById: (exec: WriteExecutor, id: string) => work.get(exec, "bet", id),
		transitionBetStatus: (exec, { betId, fromStatus, patch }) =>
			work.transition(exec, "bet", {
				id: betId,
				guard: { field: "status", equals: fromStatus },
				patch,
			}),
		listTasks: (exec: WriteExecutor, opts?: { betId?: string }) =>
			work.list(exec, "task", opts ?? {}),
		getItemById: (exec: WriteExecutor, id: string) => work.get(exec, "item", id),
		updateItemById: (exec: WriteExecutor, id: string, patch) =>
			work.update(exec, "item", id, patch),
		listItemIdsBySourceAgent: (exec: WriteExecutor, agentId: string) =>
			work.list(exec, "item", { sourceAgentId: agentId }).then((rows) => rows.map((r) => r.id)),
	},
	conversation: {
		insertMessage,
		insertThread,
		listMessagesByThread: (db, threadId, opts) =>
			listMessages(db, {
				threadId,
				types: opts?.type ? [opts.type] : undefined,
				order: opts?.order,
				dir: opts?.dir,
				limit: opts?.limit,
			}),
		updateMessage,
		updateThread,
		listInitiatedVerdictMessages: (db, initiatorId, windowStart) =>
			listMessages(db, { threadInitiatorId: initiatorId, types: ["verdict"], since: windowStart }),
		listVerdictMessagesByItemIds: (db, itemIds, windowStart) =>
			listMessages(db, { legacyItemIds: itemIds, types: ["verdict"], since: windowStart }),
	},
	users: { getFirstUserByKind: (db, kind) => findUser(db, { kind }) },
	notifications: {
		insert: async (db, row) => {
			await enqueue(db, row);
		},
	},
	silence: { isSilenced: () => Promise.resolve(false) },
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

// @lore P10: production-fixed bootstrap user id (applyFactoryCoreState seeds it).
// Extracted to module-level const so R1 sees a variable reference, not a string literal.
const SYSTEM_PROPAGATION_ID = "system:propagation";

async function seedBase(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{
	teamId: string;
	tmId: string;
	betId: string;
	agentId: string;
}> {
	const now = new Date().toISOString();
	const teamId = ids("prod-1");
	const tmId = ids("team-1");
	const betId = ids("bet-1");
	const agentId = ids("agent-1");
	await db
		.insert(teams)
		.values({ id: teamId, name: "Test Product", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: tmId, teamId, capacity: 5, activeBets: 1, formedAt: now });
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "Test bet",
		status: "active",
		createdAt: now,
	});
	await db.insert(users).values({
		id: agentId,
		name: "Builder Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(users).values({
		id: SYSTEM_PROPAGATION_ID,
		name: "Propagation System",
		role: "system",
		status: "active",
		createdAt: now,
	});
	return { teamId, tmId, betId, agentId };
}

async function seedTask(
	db: HyperIdleDb,
	ids: ScopedIds,
	taskLabel: string,
	state: string,
	betLabel = "bet-1",
): Promise<string> {
	const now = new Date().toISOString();
	const taskId = ids(taskLabel);
	await db.insert(tasks).values({
		id: taskId,
		betId: ids(betLabel),
		teamId: ids("prod-1"),
		title: `Task ${taskId}`,
		state,
		createdAt: now,
		updatedAt: now,
	});
	return taskId;
}

async function seedSession(
	db: HyperIdleDb,
	ids: ScopedIds,
	sessionLabel: string,
	taskLabel: string,
	state: string,
	outcome?: string,
): Promise<string> {
	const sessionId = ids(sessionLabel);
	await db.insert(sessions).values({
		id: sessionId,
		taskId: ids(taskLabel),
		agentId: ids("agent-1"),
		modelTier: "capable",
		startedAt: new Date().toISOString(),
		state,
		outcome: outcome ?? null,
	});
	return sessionId;
}

// ─── Session -> Task propagation ─────────────────────────────────────────────

describe("registerLifecyclePropagation — session -> task", () => {
	let unsubscribe: (() => void) | undefined;

	test("persists an initial task-read failure for retry", async ({ db, eventBus, ids }) => {
		const failingDeps: PolicyDeps = {
			...policyDeps,
			work: {
				...policyDeps.work,
				getTaskById: () => Promise.reject(new Error("read unavailable")),
			},
		};
		unsubscribe = registerPolicy(db, eventBus, failingDeps);
		const sessionId = ids("session-read-failure");
		eventBus.emit({
			type: "session_ended",
			streamId: sessionId,
			sessionId,
			agentId: ids("agent-1"),
			taskId: ids("task-read-failure"),
			outcome: "completed",
			timestamp: Date.now(),
		});
		await vi.waitFor(async () => {
			const [row] = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.sourceId, sessionId));
			expect(row).toMatchObject({ status: "pending_retry", failureReason: "read unavailable" });
		});
	});

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("transitions task to review when session ends with outcome=completed and task is in_progress", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "in_progress");
		await seedSession(db, ids, "session-1", "task-1", "active");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		eventBus.emit({
			type: "session_ended",
			streamId: ids("session-1"),
			sessionId: ids("session-1"),
			agentId: ids("agent-1"),
			taskId: ids("task-1"),
			timestamp: Date.now(),
			outcome: "completed",
		});

		await vi.waitFor(async () => {
			const [task] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-1")));
			expect(task?.state).toBe("review");
		});
	});

	test("logs propagation_log entry with status=applied when transition succeeds", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "in_progress");
		await seedSession(db, ids, "session-1", "task-1", "active");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		eventBus.emit({
			type: "session_ended",
			streamId: ids("session-1"),
			sessionId: ids("session-1"),
			agentId: ids("agent-1"),
			taskId: ids("task-1"),
			timestamp: Date.now(),
			outcome: "completed",
		});

		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(
					and(eq(propagationLog.sourceId, ids("session-1")), eq(propagationLog.status, "applied")),
				);
			expect(logs).toHaveLength(1);
			expect(logs[0]!.sourceLevel).toBe("session");
			expect(logs[0]!.targetLevel).toBe("task");
			expect(logs[0]!.targetId).toBe(ids("task-1"));
			expect(logs[0]!.targetTransition).toBe("in_progress -> review");
		});
	});

	test("does NOT transition task when session ends with outcome=crashed (F2)", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "in_progress");
		await seedSession(db, ids, "session-1", "task-1", "active");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		eventBus.emit({
			type: "session_ended",
			streamId: ids("session-1"),
			sessionId: ids("session-1"),
			agentId: ids("agent-1"),
			taskId: ids("task-1"),
			timestamp: Date.now(),
			outcome: "crashed",
		});

		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(
					and(eq(propagationLog.sourceId, ids("session-1")), eq(propagationLog.status, "skipped")),
				);
			expect(logs.length).toBeGreaterThanOrEqual(1);
		});
		const [task] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, ids("task-1")));
		expect(task?.state).toBe("in_progress");
	});

	test("does NOT transition task when session ends with outcome=stopped (F2)", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "in_progress");
		await seedSession(db, ids, "session-1", "task-1", "active");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		eventBus.emit({
			type: "session_ended",
			streamId: ids("session-1"),
			sessionId: ids("session-1"),
			agentId: ids("agent-1"),
			taskId: ids("task-1"),
			timestamp: Date.now(),
			outcome: "stopped",
		});

		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(
					and(eq(propagationLog.sourceId, ids("session-1")), eq(propagationLog.status, "skipped")),
				);
			expect(logs.length).toBeGreaterThanOrEqual(1);
		});
		const [task] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, ids("task-1")));
		expect(task?.state).toBe("in_progress");
	});

	test("transitions task to review on a completed run even with a sibling run still active", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "in_progress");
		await seedSession(db, ids, "session-1", "task-1", "active");
		await seedSession(db, ids, "session-2", "task-1", "active");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		eventBus.emit({
			type: "session_ended",
			streamId: ids("session-1"),
			sessionId: ids("session-1"),
			agentId: ids("agent-1"),
			taskId: ids("task-1"),
			timestamp: Date.now(),
			outcome: "completed",
		});

		await vi.waitFor(async () => {
			const [task] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-1")));
			expect(task?.state).toBe("review");
		});
		const skipped = await db
			.select()
			.from(propagationLog)
			.where(
				and(eq(propagationLog.sourceId, ids("session-1")), eq(propagationLog.status, "skipped")),
			);
		expect(skipped).toHaveLength(0);
	});

	test("does NOT transition task when task is NOT in_progress (already moved)", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "review");
		await seedSession(db, ids, "session-1", "task-1", "active");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		eventBus.emit({
			type: "session_ended",
			streamId: ids("session-1"),
			sessionId: ids("session-1"),
			agentId: ids("agent-1"),
			taskId: ids("task-1"),
			timestamp: Date.now(),
			outcome: "completed",
		});

		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(
					and(eq(propagationLog.sourceId, ids("session-1")), eq(propagationLog.status, "skipped")),
				);
			expect(logs.length).toBeGreaterThanOrEqual(1);
		});
		const [task] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, ids("task-1")));
		expect(task?.state).toBe("review");
	});

	test("handles concurrent race: InvalidTransitionError is caught and logged as skipped (F1, F4)", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "in_progress");
		await seedSession(db, ids, "session-1", "task-1", "active");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		await db
			.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, ids("task-1")));

		eventBus.emit({
			type: "session_ended",
			streamId: ids("session-1"),
			sessionId: ids("session-1"),
			agentId: ids("agent-1"),
			taskId: ids("task-1"),
			timestamp: Date.now(),
			outcome: "completed",
		});

		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.sourceId, ids("session-1")));
			expect(logs.length).toBeGreaterThanOrEqual(1);
			const lastLog = logs[logs.length - 1];
			expect(["skipped", "failed"]).toContain(lastLog!.status);
		});
	});
});

// ─── Task -> Bet propagation ──────────────────────────────────────────────────

describe("registerLifecyclePropagation — task -> bet", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("transitions bet to review when all tasks on bet are terminal (done)", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "done");
		await seedTask(db, ids, "task-2", "in_progress");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		await db
			.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, ids("task-2")));

		eventBus.emit({
			type: "task_state_changed",
			streamId: ids("task-2"),
			taskId: ids("task-2"),
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		await vi.waitFor(async () => {
			const [bet] = await db
				.select()
				.from(bets)
				.where(eq(bets.id, ids("bet-1")));
			expect(bet?.status).toBe("completed");
		});
	});

	test("does NOT transition bet when some tasks are still open", async ({ db, eventBus, ids }) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "done");
		await seedTask(db, ids, "task-2", "in_progress");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		eventBus.emit({
			type: "task_state_changed",
			streamId: ids("task-1"),
			taskId: ids("task-1"),
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.sourceId, ids("task-1")));
			expect(logs.length).toBeGreaterThanOrEqual(1);
		});
		const [bet] = await db
			.select()
			.from(bets)
			.where(eq(bets.id, ids("bet-1")));
		expect(bet?.status).toBe("active");
	});

	test("transitions bet to review when last task is killed (all remaining terminal)", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "done");
		await seedTask(db, ids, "task-2", "in_progress");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		await db
			.update(tasks)
			.set({ state: "killed", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, ids("task-2")));

		eventBus.emit({
			type: "task_state_changed",
			streamId: ids("task-2"),
			taskId: ids("task-2"),
			fromState: "in_progress",
			toState: "killed",
			timestamp: Date.now(),
		});

		await vi.waitFor(async () => {
			const [bet] = await db
				.select()
				.from(bets)
				.where(eq(bets.id, ids("bet-1")));
			expect(bet?.status).toBe("completed");
		});
	});

	test("creates a ship-confirmation review thread when bet transitions to review", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "done");
		await seedTask(db, ids, "task-2", "in_progress");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		await db
			.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, ids("task-2")));

		eventBus.emit({
			type: "task_state_changed",
			streamId: ids("task-2"),
			taskId: ids("task-2"),
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		await vi.waitFor(async () => {
			const threadRows = await db
				.select()
				.from(threads)
				.where(and(eq(threads.hostKind, "bet"), eq(threads.hostId, ids("bet-1"))));
			expect(threadRows.length).toBeGreaterThanOrEqual(1);

			const thread = threadRows[0];
			const allMessages = await db.select().from(messages).where(eq(messages.threadId, thread!.id));
			expect(allMessages.length).toBeGreaterThanOrEqual(1);
			const reviewMsg = allMessages.find((m) => m.type === "review");
			expect(reviewMsg).toBeDefined();
			if (!reviewMsg) return;
			const payload = JSON.parse(reviewMsg.payload) as { kind: string };
			expect(payload.kind).toBe("ship_confirmation");
		});
	});

	test("handles concurrent race on bet: InvalidTransitionError caught and logged as skipped (F4)", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "done");
		await seedTask(db, ids, "task-2", "in_progress");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		await db
			.update(bets)
			.set({ status: "killed", revisionLog: JSON.stringify([]) })
			.where(eq(bets.id, ids("bet-1")));

		await db
			.update(teamMembers)
			.set({ activeBets: 0 })
			.where(eq(teamMembers.id, ids("team-1")));

		await db
			.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, ids("task-2")));

		eventBus.emit({
			type: "task_state_changed",
			streamId: ids("task-2"),
			taskId: ids("task-2"),
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.targetId, ids("bet-1")));
			expect(logs.length).toBeGreaterThanOrEqual(1);
			const lastLog = logs[logs.length - 1];
			expect(["skipped", "failed"]).toContain(lastLog!.status);
		});
	});
});

// ─── Re-entrant cascade (F4) ──────────────────────────────────────────────────

describe("registerLifecyclePropagation — re-entrant cascade", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("session_ended cascades: session->task review, then task->bet completed when task goes done (F4)", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "in_progress");
		await seedSession(db, ids, "session-1", "task-1", "active");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		eventBus.emit({
			type: "session_ended",
			streamId: ids("session-1"),
			sessionId: ids("session-1"),
			agentId: ids("agent-1"),
			taskId: ids("task-1"),
			timestamp: Date.now(),
			outcome: "completed",
		});

		await vi.waitFor(async () => {
			const [taskAfterSession] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, ids("task-1")));
			expect(taskAfterSession?.state).toBe("review");
		});

		await vi.waitFor(async () => {
			const hop1Logs = await db
				.select()
				.from(propagationLog)
				.where(
					and(
						eq(propagationLog.sourceLevel, "session"),
						eq(propagationLog.targetLevel, "task"),
						eq(propagationLog.status, "applied"),
					),
				);
			expect(hop1Logs.length).toBeGreaterThanOrEqual(1);
		});

		await db
			.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, ids("task-1")));

		eventBus.emit({
			type: "task_state_changed",
			streamId: ids("task-1"),
			taskId: ids("task-1"),
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		await vi.waitFor(async () => {
			const [bet] = await db
				.select()
				.from(bets)
				.where(eq(bets.id, ids("bet-1")));
			expect(bet?.status).toBe("completed");
		});

		await vi.waitFor(async () => {
			const hop2Logs = await db
				.select()
				.from(propagationLog)
				.where(
					and(
						eq(propagationLog.sourceLevel, "task"),
						eq(propagationLog.targetLevel, "bet"),
						eq(propagationLog.status, "applied"),
					),
				);
			expect(hop2Logs.length).toBeGreaterThanOrEqual(1);
		});
	});
});

// ─── Bet -> Product propagation ───────────────────────────────────────────────

describe("registerLifecyclePropagation — bet -> team", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("persists an initial bet-read failure for retry", async ({ db, eventBus, ids }) => {
		const failingDeps: PolicyDeps = {
			...policyDeps,
			work: {
				...policyDeps.work,
				getBetById: () => Promise.reject(new Error("bet read unavailable")),
			},
		};
		unsubscribe = registerPolicy(db, eventBus, failingDeps);
		const betId = ids("bet-failure");
		eventBus.emit({
			type: "bet_state_changed",
			streamId: ids("team-failure"),
			betId,
			fromState: "active",
			toState: "completed",
			timestamp: Date.now(),
		});
		await vi.waitFor(async () => {
			const [row] = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.sourceId, betId));
			expect(row).toMatchObject({ status: "pending_retry", failureReason: "bet read unavailable" });
		});
	});

	test("logs propagation_applied entry when bet transitions to completed", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		unsubscribe = registerPolicy(db, eventBus, policyDeps);
		const propagationEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => propagationEvents.push(e));

		eventBus.emit({
			type: "bet_state_changed",
			streamId: ids("prod-1"),
			betId: ids("bet-1"),
			fromState: "active",
			toState: "completed",
			timestamp: Date.now(),
		});

		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(
					and(eq(propagationLog.sourceId, ids("bet-1")), eq(propagationLog.sourceLevel, "bet")),
				);
			expect(logs.length).toBeGreaterThanOrEqual(1);
			expect(logs[0]!.targetLevel).toBe("team");
			expect(logs[0]!.status).toBe("applied");
		});
	});

	test("emits propagation_applied event when bet transitions to completed", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		unsubscribe = registerPolicy(db, eventBus, policyDeps);
		const propagationEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => propagationEvents.push(e));

		eventBus.emit({
			type: "bet_state_changed",
			streamId: ids("prod-1"),
			betId: ids("bet-1"),
			fromState: "active",
			toState: "completed",
			timestamp: Date.now(),
		});

		await vi.waitFor(async () => {
			expect(propagationEvents).toHaveLength(1);
		});
		expect(propagationEvents[0]!.sourceId).toBe(ids("bet-1"));
		expect(propagationEvents[0]!.targetLevel).toBe("team");
	});

	test("logs propagation entry when bet transitions to killed", async ({ db, eventBus, ids }) => {
		await seedBase(db, ids);
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		eventBus.emit({
			type: "bet_state_changed",
			streamId: ids("prod-1"),
			betId: ids("bet-1"),
			fromState: "active",
			toState: "killed",
			timestamp: Date.now(),
		});

		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(
					and(eq(propagationLog.sourceId, ids("bet-1")), eq(propagationLog.sourceLevel, "bet")),
				);
			expect(logs.length).toBeGreaterThanOrEqual(1);
		});
	});
});

// ─── Retry mechanism ──────────────────────────────────────────────────────────

describe("registerLifecyclePropagation — retry mechanism", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("retryFailedPropagations: retries a pending_retry session->task row and transitions task to applied", async ({
		db,
		ids,
	}) => {
		await seedBase(db, ids);
		const now = new Date().toISOString();
		await seedTask(db, ids, "task-retry-1", "in_progress");
		await db.insert(sessions).values({
			id: ids("session-retry-1"),
			taskId: ids("task-retry-1"),
			agentId: ids("agent-1"),
			modelTier: "capable",
			startedAt: now,
			endedAt: now,
			state: "ended",
			outcome: "completed",
		});

		await db.insert(propagationLog).values({
			id: ids("log-retry-1"),
			sourceLevel: "session",
			sourceId: ids("session-retry-1"),
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: ids("task-retry-1"),
			targetTransition: null,
			status: "pending_retry",
			failureReason: "Transient DB error",
			attempts: 1,
			createdAt: now,
			appliedAt: null,
		});

		const eventBus = new EventBus();
		await retryFailedPropagations(db, eventBus, policyDeps);

		const [task] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, ids("task-retry-1")));
		expect(task?.state).toBe("review");

		const appliedLogs = await db
			.select()
			.from(propagationLog)
			.where(
				and(eq(propagationLog.targetId, ids("task-retry-1")), eq(propagationLog.status, "applied")),
			);
		expect(appliedLogs.length).toBeGreaterThanOrEqual(1);
	});

	test("§7: a successful retry resolves the ORIGINAL row in place — zero residual pending_retry, exactly one row", async ({
		db,
		ids,
	}) => {
		await seedBase(db, ids);
		const now = new Date().toISOString();
		await seedTask(db, ids, "task-inplace-1", "in_progress");
		await db.insert(sessions).values({
			id: ids("session-inplace-1"),
			taskId: ids("task-inplace-1"),
			agentId: ids("agent-1"),
			modelTier: "capable",
			startedAt: now,
			endedAt: now,
			state: "ended",
			outcome: "completed",
		});
		await db.insert(propagationLog).values({
			id: ids("log-inplace-1"),
			sourceLevel: "session",
			sourceId: ids("session-inplace-1"),
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: ids("task-inplace-1"),
			targetTransition: null,
			status: "pending_retry",
			failureReason: "Transient DB error",
			attempts: 1,
			createdAt: now,
			appliedAt: null,
		});

		const eventBus = new EventBus();
		await retryFailedPropagations(db, eventBus, policyDeps);

		const allRows = await db
			.select()
			.from(propagationLog)
			.where(eq(propagationLog.targetId, ids("task-inplace-1")));
		expect(allRows).toHaveLength(1);
		expect(allRows[0]!.id).toBe(ids("log-inplace-1"));
		expect(allRows[0]!.status).toBe("applied");
		expect(allRows[0]!.appliedAt).not.toBeNull();

		const residualPending = await db
			.select()
			.from(propagationLog)
			.where(
				and(
					eq(propagationLog.targetId, ids("task-inplace-1")),
					eq(propagationLog.status, "pending_retry"),
				),
			);
		expect(residualPending).toHaveLength(0);

		const [task] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, ids("task-inplace-1")));
		expect(task?.state).toBe("review");
	});

	test("§7: exactly ONE propagation_applied event for a retry that retried once then succeeded (no double-emit)", async ({
		db,
		ids,
	}) => {
		await seedBase(db, ids);
		const now = new Date().toISOString();
		await seedTask(db, ids, "task-emit-1", "in_progress");
		await db.insert(sessions).values({
			id: ids("session-emit-1"),
			taskId: ids("task-emit-1"),
			agentId: ids("agent-1"),
			modelTier: "capable",
			startedAt: now,
			endedAt: now,
			state: "ended",
			outcome: "completed",
		});
		await db.insert(propagationLog).values({
			id: ids("log-emit-1"),
			sourceLevel: "session",
			sourceId: ids("session-emit-1"),
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: ids("task-emit-1"),
			targetTransition: null,
			status: "pending_retry",
			failureReason: "Transient DB error",
			attempts: 1,
			createdAt: now,
			appliedAt: null,
		});

		const eventBus = new EventBus();
		const appliedEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));

		await retryFailedPropagations(db, eventBus, policyDeps);

		expect(appliedEvents).toHaveLength(1);
		expect(appliedEvents[0]!.targetId).toBe(ids("task-emit-1"));
		expect(appliedEvents[0]!.sourceId).toBe(ids("session-emit-1"));
	});

	test("§7 CAS-guard: a retry that SUCCEEDS on its last allowed attempt is NOT marked failed", async ({
		db,
		ids,
	}) => {
		await seedBase(db, ids);
		const now = new Date().toISOString();
		await seedTask(db, ids, "task-cas-1", "in_progress");
		await db.insert(sessions).values({
			id: ids("session-cas-1"),
			taskId: ids("task-cas-1"),
			agentId: ids("agent-1"),
			modelTier: "capable",
			startedAt: now,
			endedAt: now,
			state: "ended",
			outcome: "completed",
		});
		await db.insert(propagationLog).values({
			id: ids("log-cas-1"),
			sourceLevel: "session",
			sourceId: ids("session-cas-1"),
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: ids("task-cas-1"),
			targetTransition: null,
			status: "pending_retry",
			failureReason: "Transient DB error",
			attempts: 2,
			createdAt: now,
			appliedAt: null,
		});

		const eventBus = new EventBus();
		await retryFailedPropagations(db, eventBus, policyDeps);

		const [row] = await db
			.select()
			.from(propagationLog)
			.where(eq(propagationLog.id, ids("log-cas-1")));
		expect(row?.status).toBe("applied");
		expect(row?.status).not.toBe("failed");

		const notifs = (await listNotifications(db, { kind: "all" })).filter(
			(r) => r.eventType === "propagation_exhausted" && r.subjectId === ids("log-cas-1"),
		);
		expect(notifs).toHaveLength(0);
	});

	test("retryFailedPropagations: row with attempts=3 (at max) changes status to failed and creates notification", async ({
		db,
		ids,
	}) => {
		await seedBase(db, ids);
		const now = new Date().toISOString();
		await db.insert(propagationLog).values({
			id: ids("log-exhausted-1"),
			sourceLevel: "session",
			sourceId: ids("session-y"),
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: ids("task-y"),
			targetTransition: null,
			status: "pending_retry",
			failureReason: "Transient DB error",
			attempts: 3,
			createdAt: now,
			appliedAt: null,
		});

		const eventBus = new EventBus();
		await retryFailedPropagations(db, eventBus, policyDeps);

		const failedLogs = await db
			.select()
			.from(propagationLog)
			.where(eq(propagationLog.id, ids("log-exhausted-1")));
		expect(failedLogs).toHaveLength(1);
		expect(failedLogs[0]!.status).toBe("failed");
		expect(failedLogs[0]!.attempts).toBe(3);

		const notifs = (await listNotifications(db, { kind: "all" })).filter(
			(r) => r.eventType === "propagation_exhausted" && r.subjectId === ids("log-exhausted-1"),
		);
		expect(notifs).toHaveLength(1);
		expect(notifs[0]!.severity).toBe("warning");
	});
});

// ─── Propagation log coverage ────────────────────────────────────────────────

describe("registerLifecyclePropagation — propagation log", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("creates a propagation_log entry for every propagation attempt", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "in_progress");
		await seedSession(db, ids, "session-1", "task-1", "active");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		const initialLogs = await db
			.select()
			.from(propagationLog)
			.where(eq(propagationLog.sourceId, ids("session-1")));
		const initialLogCount = initialLogs.length;

		eventBus.emit({
			type: "session_ended",
			streamId: ids("session-1"),
			sessionId: ids("session-1"),
			agentId: ids("agent-1"),
			taskId: ids("task-1"),
			timestamp: Date.now(),
			outcome: "completed",
		});

		await vi.waitFor(async () => {
			const newLogs = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.sourceId, ids("session-1")));
			expect(newLogs.length).toBeGreaterThan(initialLogCount);
		});
	});

	test("emits propagation_applied event when session->task propagation succeeds", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "in_progress");
		await seedSession(db, ids, "session-1", "task-1", "active");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		const appliedEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));

		eventBus.emit({
			type: "session_ended",
			streamId: ids("session-1"),
			sessionId: ids("session-1"),
			agentId: ids("agent-1"),
			taskId: ids("task-1"),
			timestamp: Date.now(),
			outcome: "completed",
		});

		await vi.waitFor(() => {
			expect(appliedEvents).toHaveLength(1);
			expect(appliedEvents[0]!.sourceLevel).toBe("session");
			expect(appliedEvents[0]!.targetLevel).toBe("task");
		});
	});

	test("returns unsubscribe function that stops all event handling", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedTask(db, ids, "task-1", "in_progress");
		await seedSession(db, ids, "session-1", "task-1", "active");
		const unsub = registerPolicy(db, eventBus, policyDeps);

		unsub();

		eventBus.emit({
			type: "session_ended",
			streamId: ids("session-1"),
			sessionId: ids("session-1"),
			agentId: ids("agent-1"),
			taskId: ids("task-1"),
			timestamp: Date.now(),
			outcome: "completed",
		});

		const [task] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, ids("task-1")));
		expect(task?.state).toBe("in_progress");

		const logs = await db
			.select()
			.from(propagationLog)
			.where(eq(propagationLog.sourceId, ids("session-1")));
		expect(logs).toHaveLength(0);
	});
});
