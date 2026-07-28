/**
 * AF12 — AC3 + AC6: Killing a bet cascades to tasks and sessions, with honest
 * propagation_log labels.
 *
 * AC3 (cascade, state-truth):
 *   - non-terminal tasks on the bet → killed
 *   - active sessions on those tasks → state terminal + outcome 'stopped'
 *   - already-`done` tasks are left `done` (artifacts preserved)
 *
 * AC6 (label honesty):
 *   - cascade rows carry sourceEvent:'bet_killed', status:'applied'
 *   - task hop labelled '<from> -> killed'; session hop labelled 'active -> stopped'
 *
 * @lore AF12 RED: `cascadeBetKill` does not exist yet — the import will fail to
 * resolve until the green phase. That is the correct red signal for AC3/AC6.
 *
 * @lore AF12 AC6 determinism: cascade rows are written SYNCHRONOUSLY; the upward
 * `propagateTaskToBet` skip row is deferred to the microtask queue. We assert
 * ONLY on the synchronous `sourceEvent:'bet_killed'` rows (query-by-sourceEvent)
 * so the test never races the async handler.
 */

import {
	insertMessage,
	insertThread,
	listMessages,
	updateMessage,
	updateThread,
} from "@hyperidle/conversation";
import {
	bets,
	type HyperIdleDb,
	propagationLog,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { enqueue } from "@hyperidle/notifications";
import { getTeamMembers, updateTeam } from "@hyperidle/org";
import { type PolicyDeps, registerPolicy } from "@hyperidle/policy";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { findUser, requireRunnableAgent } from "@hyperidle/users";
import type { TaskStateMachineDeps, WorkDeps } from "@hyperidle/work";
import * as work from "@hyperidle/work";
import { cascadeBetKill, transitionBet } from "@hyperidle/work";
import { and, eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

/**
 * @lore AU19 Increment 2a: `registerLifecyclePropagation` now takes
 * injected `work`/`conversation`/`users`/`notifications` ports (Mechanism C
 * — `policy` never imports another Service). This test builds the exact
 * same production wiring `server-factory.ts` uses — no behavior change.
 *
 * @lore AU20 Am1: migrated to `PolicyDeps`; engine/handoff stubs are never
 * called in these lifecycle tests.
 */
const lifecyclePropagationDeps: PolicyDeps = {
	work: {
		getTaskById: (exec, id) => work.get(exec, "task", id),
		transitionTaskState: (exec, { taskId, fromState, patch }) =>
			work.transition(exec, "task", {
				id: taskId,
				guard: { field: "state", equals: fromState },
				patch,
			}),
		getBetById: (exec, id) => work.get(exec, "bet", id),
		transitionBetStatus: (exec, { betId, fromStatus, patch }) =>
			work.transition(exec, "bet", {
				id: betId,
				guard: { field: "status", equals: fromStatus },
				patch,
			}),
		listTasks: (exec, opts) => work.list(exec, "task", opts ?? {}),
		getItemById: (exec, id) => work.get(exec, "item", id),
		updateItemById: (exec, id, patch) => work.update(exec, "item", id, patch),
		listItemIdsBySourceAgent: async (exec, agentId) => {
			const rows = await work.list(exec, "item", { sourceAgentId: agentId });
			return rows.map((r) => r.id);
		},
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

/** AU19 Increment 1b: `cascadeBetKill` forwards this to `transitionTask`. */
const testDeps: TaskStateMachineDeps = {
	workIntents: { record: enqueueWorkIntent },
	taskRunResolver: { requireRunnableAgent },
};
// AU19 Increment 1c: `work`'s `TeamCapacityReader` port (Mechanism C), wired
// to the real migrated `org` Service.
const teamCapacity: WorkDeps["teamCapacity"] = {
	getByTeamId: (db, teamId) => getTeamMembers(db, { teamId }),
	setActiveBets: (db, teamId, activeBets) => updateTeam(db, teamId, { activeBets }),
};

async function seed(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "prod-1", name: "Test", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "team-1", teamId: "prod-1", capacity: 3, activeBets: 1, formedAt: now });
	await db.insert(users).values({
		id: "agent-1",
		name: "Builder Bot",
		role: "builder",
		status: "idle",
		teamId: "team-1",
		createdAt: now,
	});
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "prod-1",
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	// In-progress task with an active session — should be cascaded.
	await db.insert(tasks).values({
		id: "task-live",
		betId: "bet-1",
		teamId: "prod-1",
		title: "Live Task",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(sessions).values({
		id: "sess-active",
		taskId: "task-live",
		agentId: "agent-1",
		modelTier: "workhorse",
		startedAt: now,
		state: "active",
	});
	// Done task — must be left untouched (artifacts preserved).
	await db.insert(tasks).values({
		id: "task-done",
		betId: "bet-1",
		teamId: "prod-1",
		title: "Done Task",
		state: "done",
		createdAt: now,
		updatedAt: now,
	});
}

describe("AF12 AC3 — bet kill cascade (state truth)", () => {
	test("non-terminal task on the bet is killed", async ({ db, eventBus }) => {
		await seed(db);
		await transitionBet(db, eventBus, teamCapacity, "bet-1", "killed", { reason: "Not viable" });

		await cascadeBetKill(db, eventBus, "bet-1", testDeps);

		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-live")).limit(1);
		expect(task?.state).toBe("killed");
	});

	test("active session on a cascaded task is stopped (state terminal, outcome 'stopped')", async ({
		db,
		eventBus,
	}) => {
		await seed(db);
		await transitionBet(db, eventBus, teamCapacity, "bet-1", "killed", { reason: "Not viable" });

		await cascadeBetKill(db, eventBus, "bet-1", testDeps);

		const [sess] = await db.select().from(sessions).where(eq(sessions.id, "sess-active")).limit(1);
		expect(sess?.state).not.toBe("active");
		expect(sess?.outcome).toBe("stopped");
		expect(sess?.endedAt).toBeTruthy();
	});

	test("already-done task is left done (artifacts preserved, not re-killed)", async ({
		db,
		eventBus,
	}) => {
		await seed(db);
		await transitionBet(db, eventBus, teamCapacity, "bet-1", "killed", { reason: "Not viable" });

		await cascadeBetKill(db, eventBus, "bet-1", testDeps);

		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-done")).limit(1);
		expect(task?.state).toBe("done");
	});

	test("returns the ids of cascaded tasks and sessions", async ({ db, eventBus }) => {
		await seed(db);
		await transitionBet(db, eventBus, teamCapacity, "bet-1", "killed", { reason: "Not viable" });

		const result = await cascadeBetKill(db, eventBus, "bet-1", testDeps);

		expect(result.tasksKilled).toContain("task-live");
		expect(result.tasksKilled).not.toContain("task-done");
		expect(result.sessionsStopped).toContain("sess-active");
	});
});

describe("AF12 AC6 — cascade propagation_log labels", () => {
	test("task hop: sourceEvent 'bet_killed', status 'applied', labelled '<from> -> killed'", async ({
		db,
		eventBus,
	}) => {
		await seed(db);
		await transitionBet(db, eventBus, teamCapacity, "bet-1", "killed", { reason: "Not viable" });
		await cascadeBetKill(db, eventBus, "bet-1", testDeps);

		const rows = await db
			.select()
			.from(propagationLog)
			.where(
				and(eq(propagationLog.sourceEvent, "bet_killed"), eq(propagationLog.targetLevel, "task")),
			);

		const taskRow = rows.find((r) => r.targetId === "task-live");
		expect(taskRow).toBeDefined();
		expect(taskRow?.status).toBe("applied");
		expect(taskRow?.targetTransition).toBe("in_progress -> killed");
	});

	test("session hop: sourceEvent 'bet_killed', status 'applied', labelled 'active -> stopped'", async ({
		db,
		eventBus,
	}) => {
		await seed(db);
		await transitionBet(db, eventBus, teamCapacity, "bet-1", "killed", { reason: "Not viable" });
		await cascadeBetKill(db, eventBus, "bet-1", testDeps);

		const rows = await db
			.select()
			.from(propagationLog)
			.where(
				and(
					eq(propagationLog.sourceEvent, "bet_killed"),
					eq(propagationLog.targetLevel, "session"),
				),
			);

		const sessRow = rows.find((r) => r.targetId === "sess-active");
		expect(sessRow).toBeDefined();
		expect(sessRow?.status).toBe("applied");
		expect(sessRow?.targetTransition).toBe("active -> stopped");
	});

	test("re-killing / re-cascading is idempotent — no duplicate applied rows, no phantom row for an already-stopped session", async ({
		db,
		eventBus,
	}) => {
		await seed(db);
		await transitionBet(db, eventBus, teamCapacity, "bet-1", "killed", { reason: "Not viable" });

		await cascadeBetKill(db, eventBus, "bet-1", testDeps);
		// Second cascade: the bet/tasks/sessions are all terminal — must be a clean no-op.
		await cascadeBetKill(db, eventBus, "bet-1", testDeps);

		// Build-time watch (reviewer): a 0-row CAS-stop on an already-stopped session
		// must NOT emit a phantom 'applied' propagation_log row.
		const sessRows = await db
			.select()
			.from(propagationLog)
			.where(
				and(
					eq(propagationLog.sourceEvent, "bet_killed"),
					eq(propagationLog.targetLevel, "session"),
					eq(propagationLog.targetId, "sess-active"),
				),
			);
		expect(sessRows).toHaveLength(1);

		const taskRows = await db
			.select()
			.from(propagationLog)
			.where(
				and(
					eq(propagationLog.sourceEvent, "bet_killed"),
					eq(propagationLog.targetLevel, "task"),
					eq(propagationLog.targetId, "task-live"),
				),
			);
		expect(taskRows).toHaveLength(1);
	});
});

describe("AF12 AC6 — task->bet propagation label honesty (fix '-> review' bug)", () => {
	test("task->bet applied row is labelled '<from> -> completed' (not '-> review')", async ({
		db,
		eventBus,
	}) => {
		// Seed a bet with a single in_progress task; moving it to done triggers the
		// upward propagation that actually moves the bet to `completed`. The log row
		// must label the real target — `completed` — not the dead `review` state.
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "prod-1", name: "Test", phase: "build", createdAt: now });
		await db
			.insert(teamMembers)
			.values({ id: "team-1", teamId: "prod-1", capacity: 3, activeBets: 1, formedAt: now });
		await db.insert(users).values({
			id: "agent-1",
			name: "Builder Bot",
			role: "builder",
			status: "idle",
			teamId: "team-1",
			createdAt: now,
		});
		// Seed the system propagation agent so the ship-confirmation thread can insert.
		await db.insert(users).values({
			id: "system:propagation",
			name: "Propagation System",
			role: "system",
			status: "active",
			createdAt: now,
		});
		await db.insert(bets).values({
			id: "bet-1",
			teamId: "prod-1",
			description: "Test",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "task-1",
			betId: "bet-1",
			teamId: "prod-1",
			title: "Only Task",
			state: "done",
			createdAt: now,
			updatedAt: now,
		});

		const unsub = registerPolicy(db, eventBus, lifecyclePropagationDeps);
		try {
			eventBus.emit({
				type: "task_state_changed",
				streamId: "task-1",
				taskId: "task-1",
				fromState: "review",
				toState: "done",
				timestamp: Date.now(),
			});

			await vi.waitFor(async () => {
				const rows = await db
					.select()
					.from(propagationLog)
					.where(
						and(
							eq(propagationLog.sourceLevel, "task"),
							eq(propagationLog.targetLevel, "bet"),
							eq(propagationLog.status, "applied"),
						),
					);
				expect(rows.length).toBeGreaterThanOrEqual(1);
				expect(rows[0]?.targetTransition).toBe("active -> completed");
				expect(rows[0]?.targetTransition).not.toContain("review");
			});
		} finally {
			unsub();
		}
	});
});
