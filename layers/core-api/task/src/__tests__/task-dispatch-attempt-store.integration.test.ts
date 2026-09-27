/**
 * `taskDispatchAttemptStore.insertAttempt` — the ordinal invariant, at the owner.
 *
 * The dispatch-attempt ordinal used to be computed by the CALLER: `policy`'s
 * handoff protocol read every existing attempt row for the task and inserted
 * with `ordinal: existing.length + 1`. That read is a foreign table access, so
 * it moves behind `work` — and the ordinal rule moves with it, because the read
 * exists for nothing else.
 *
 * Nothing in the repository asserted that rule before this file. `ordinal`
 * appears in five other test files and in every one it is a seeded fixture
 * value, never an assertion; no production code reads the column back; and the
 * `(task_id, ordinal)` unique index cannot catch an off-by-one on a task whose
 * first attempt this is. So a relocation that silently changed count-based to
 * max-based, or dropped the per-task predicate, would have shipped green.
 *
 * @lore The store computes the ordinal itself rather than accepting one. The caller may not supply it: the count and the insert have to observe the same snapshot, the caller's transaction. A caller that counted first and inserted later would race any concurrent dispatch for the same task straight into the unique index.
 *
 * @lore `task_dispatch_attempts` carries a SECOND unique index that `framework/db/src/schema.ts` does not declare, because Drizzle cannot express it: `("task_id","occasion",COALESCE("predecessor_session_id",''),"agent_id")`, created in `0047_AU9_durable_custody.sql`. It is a real idempotency guard — one dispatch per (task, occasion, predecessor, agent) — and it only exists in the migration, so reading the schema module will not warn you about it. Every fixture below therefore hands each successive attempt for one task a distinct predecessor session, which is what a real sequence of handoffs looks like.
 */

import {
	type HyperIdleDb,
	sessions,
	taskDispatchAttempts,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { asc, eq } from "drizzle-orm";
import { taskDispatchAttemptStore } from "../task-service.js";

const AGENT_ID = "agent-dispatch-ordinal";
const SESSION_IDS = ["session-ord-1", "session-ord-2", "session-ord-3", "session-ord-4"] as const;
const TEAM_ID = "team-dispatch-ordinal";
const ROOT_TASK_ID = "bet-dispatch-ordinal";

async function seedWorld(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: AGENT_ID,
		kind: "ai",
		name: "Dispatch agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(teams).values({ id: TEAM_ID, name: TEAM_ID, createdAt: now });
	// Every task has a real thread now (`tasks.thread_id` is NOT NULL).
	await db.insert(threads).values({
		id: `thr-${ROOT_TASK_ID}`,
		hostKind: "team",
		hostId: TEAM_ID,
		initiatorId: AGENT_ID,
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: ROOT_TASK_ID,
		parentTaskId: null,
		teamId: TEAM_ID,
		title: "Dispatch-attempt ordinal bet",
		description: "Dispatch-attempt ordinal bet",
		state: "in_progress",
		threadId: `thr-${ROOT_TASK_ID}`,
		createdAt: now,
		updatedAt: now,
	});
	for (const id of SESSION_IDS) {
		await db.insert(sessions).values({
			id,
			agentId: AGENT_ID,
			modelTier: "standard",
			startedAt: now,
			state: "active",
		});
	}
}

async function seedTask(db: HyperIdleDb, taskId: string): Promise<void> {
	const now = new Date().toISOString();
	// Every task has a real thread now (`tasks.thread_id` is NOT NULL).
	await db.insert(threads).values({
		id: `thr-${taskId}`,
		hostKind: "team",
		hostId: TEAM_ID,
		initiatorId: AGENT_ID,
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: taskId,
		parentTaskId: ROOT_TASK_ID,
		teamId: TEAM_ID,
		ownerAgentId: AGENT_ID,
		title: taskId,
		state: "accepted",
		threadId: `thr-${taskId}`,
		createdAt: now,
		updatedAt: now,
	});
}

function attemptInput(
	taskId: string,
	predecessorIndex = 0,
): {
	readonly taskId: string;
	readonly occasion: string;
	readonly agentId: string;
	readonly predecessorSessionId: string;
	readonly now: string;
} {
	return {
		taskId,
		occasion: "owner_handoff",
		agentId: AGENT_ID,
		predecessorSessionId: SESSION_IDS[predecessorIndex] ?? SESSION_IDS[0],
		now: new Date().toISOString(),
	};
}

/**
 * @lore Ordered by `ordinal`, never by `createdAt`. `createdAt` is an ISO string at millisecond resolution and these fixtures write several rows for one task inside the same millisecond, so `createdAt` is not a total order here — rows written moments apart routinely carry the identical stamp and the sort falls through to whatever tiebreak follows. An assertion that encoded *creation* order against this query was right roughly 7 runs in 10. `ordinal` is unique per task (the `(task_id, ordinal)` index), so ordering by it is total and deterministic — but it also means this helper cannot witness which row was written first. A case that needs that must address its rows by id (see `ordinalOf`), not by position.
 */
async function ordinalsFor(db: HyperIdleDb, taskId: string): Promise<number[]> {
	const rows = await db
		.select({ ordinal: taskDispatchAttempts.ordinal })
		.from(taskDispatchAttempts)
		.where(eq(taskDispatchAttempts.taskId, taskId))
		.orderBy(asc(taskDispatchAttempts.ordinal));
	return rows.map((row) => row.ordinal);
}

/**
 * B1 fix: `insertAttempt` returns `id: string | undefined` now — `undefined`
 * means the unique-index conflict swallowed the insert (architecture doc §5
 * step 4). None of these fixtures hit that conflict (each attempt gets its
 * own predecessor session), so a defined id is the invariant this helper
 * asserts before handing callers a plain `string`.
 */
function requireId(inserted: { readonly id: string | undefined }): string {
	if (!inserted.id)
		throw new Error("insertAttempt did not return an id — the insert was swallowed");
	return inserted.id;
}

/** The ordinal of one specific attempt row, addressed by identity. */
async function ordinalOf(db: HyperIdleDb, attemptId: string): Promise<number | undefined> {
	const [row] = await db
		.select({ ordinal: taskDispatchAttempts.ordinal })
		.from(taskDispatchAttempts)
		.where(eq(taskDispatchAttempts.id, attemptId));
	return row?.ordinal;
}

describe("taskDispatchAttemptStore.insertAttempt — the ordinal invariant lives at the owner", () => {
	test("three successive calls for one task produce ordinals 1, 2, 3", async ({ db }) => {
		await seedWorld(db);
		await seedTask(db, "task-a1");

		const first = requireId(
			await taskDispatchAttemptStore.insertAttempt(db, attemptInput("task-a1", 0)),
		);
		const second = requireId(
			await taskDispatchAttemptStore.insertAttempt(db, attemptInput("task-a1", 1)),
		);
		const third = requireId(
			await taskDispatchAttemptStore.insertAttempt(db, attemptInput("task-a1", 2)),
		);

		expect(await ordinalsFor(db, "task-a1")).toEqual([1, 2, 3]);
		expect(await ordinalOf(db, first)).toBe(1);
		expect(await ordinalOf(db, second)).toBe(2);
		expect(await ordinalOf(db, third)).toBe(3);
		expect(new Set([first, second, third]).size).toBe(3);

		const [row] = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.id, first));
		expect(row?.status).toBe("requested");
		expect(row?.occasion).toBe("owner_handoff");
		expect(row?.agentId).toBe(AGENT_ID);
		expect(row?.predecessorSessionId).toBe(SESSION_IDS[0]);
	});

	test("the count is scoped to one task — task B's first attempt is 1, not 4", async ({ db }) => {
		await seedWorld(db);
		await seedTask(db, "task-a2-a");
		await seedTask(db, "task-a2-b");

		await taskDispatchAttemptStore.insertAttempt(db, attemptInput("task-a2-a", 0));
		await taskDispatchAttemptStore.insertAttempt(db, attemptInput("task-a2-a", 1));
		await taskDispatchAttemptStore.insertAttempt(db, attemptInput("task-a2-a", 2));

		await taskDispatchAttemptStore.insertAttempt(db, attemptInput("task-a2-b", 0));

		expect(await ordinalsFor(db, "task-a2-a")).toEqual([1, 2, 3]);
		expect(await ordinalsFor(db, "task-a2-b")).toEqual([1]);
	});

	test("the rule is count-based, not max-based — one row at ordinal 9 yields 2", async ({ db }) => {
		await seedWorld(db);
		await seedTask(db, "task-a3");
		const now = new Date().toISOString();
		await db.insert(taskDispatchAttempts).values({
			id: "attempt-a3-seed",
			taskId: "task-a3",
			occasion: "accepted",
			agentId: AGENT_ID,
			ordinal: 9,
			status: "requested",
			createdAt: now,
			updatedAt: now,
		});

		const inserted = requireId(
			await taskDispatchAttemptStore.insertAttempt(db, attemptInput("task-a3")),
		);

		// Addressed by identity, not by position: one existing row means the count
		// rule yields 2 for the new row, where a max-based rule would yield 10. The
		// seeded 9 must survive untouched, and no third row may appear.
		expect(await ordinalOf(db, inserted)).toBe(2);
		expect(await ordinalOf(db, "attempt-a3-seed")).toBe(9);
		expect(await ordinalsFor(db, "task-a3")).toHaveLength(2);
	});

	test("two calls inside one transaction see each other — 1 then 2, readable through tx", async ({
		db,
	}) => {
		await seedWorld(db);
		await seedTask(db, "task-a4");

		const seen = await db.transaction(async (tx) => {
			const first = await taskDispatchAttemptStore.insertAttempt(tx, attemptInput("task-a4", 0));
			const second = await taskDispatchAttemptStore.insertAttempt(tx, attemptInput("task-a4", 1));
			const rows = await tx
				.select({ id: taskDispatchAttempts.id, ordinal: taskDispatchAttempts.ordinal })
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.taskId, "task-a4"))
				.orderBy(asc(taskDispatchAttempts.ordinal));
			return { first, second, rows };
		});

		expect(seen.rows.map((row) => row.ordinal)).toEqual([1, 2]);
		expect(seen.rows.map((row) => row.id)).toEqual([seen.first.id, seen.second.id]);
		expect(await ordinalsFor(db, "task-a4")).toEqual([1, 2]);
	});

	test("a throwing transaction leaves zero attempt rows", async ({ db }) => {
		await seedWorld(db);
		await seedTask(db, "task-a5");

		await expect(
			db.transaction(async (tx) => {
				await taskDispatchAttemptStore.insertAttempt(tx, attemptInput("task-a5"));
				throw new Error("handoff failed after the attempt row was written");
			}),
		).rejects.toThrow("handoff failed after the attempt row was written");

		expect(await ordinalsFor(db, "task-a5")).toEqual([]);
	});
});
