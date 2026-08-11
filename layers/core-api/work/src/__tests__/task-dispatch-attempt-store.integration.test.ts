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
 * @lore The store computes the ordinal itself rather than accepting one. The
 * caller may not supply it: the count and the insert have to observe the same
 * snapshot, and the snapshot is the caller's transaction (A4/A5). A caller that
 * counted first and inserted later would race any concurrent dispatch for the
 * same task straight into the unique index.
 *
 * @lore `task_dispatch_attempts` carries a SECOND unique index that
 * `framework/db/src/schema.ts` does not declare, because Drizzle cannot express
 * it: `("task_id","occasion",COALESCE("predecessor_session_id",''),"agent_id")`,
 * created in `0047_AU9_durable_custody.sql`. It is a real idempotency guard —
 * one dispatch per (task, occasion, predecessor, agent) — and it only exists in
 * the migration, so reading the schema module will not warn you about it. Every
 * fixture below therefore hands each successive attempt for one task a distinct
 * predecessor session, which is what a real sequence of handoffs looks like.
 */

import {
	bets,
	type HyperIdleDb,
	sessions,
	taskDispatchAttempts,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { describe, expect, type ScopedIds, test } from "@hyperidle/db/test-fixtures";
import { asc, eq } from "drizzle-orm";
import { taskDispatchAttemptStore } from "../work-service.js";

/**
 * @lore AU38: the shared world ids (agent/team/bet/sessions) derive from the
 * per-test `ids` fixture — every test seeds its own copy of this world, so the
 * names stay readable while the rows stay per-test.
 */
function worldIds(ids: ScopedIds) {
	return {
		AGENT_ID: ids("agent-dispatch-ordinal"),
		SESSION_IDS: [
			ids("session-ord-1"),
			ids("session-ord-2"),
			ids("session-ord-3"),
			ids("session-ord-4"),
		],
		TEAM_ID: ids("team-dispatch-ordinal"),
		BET_ID: ids("bet-dispatch-ordinal"),
	} as const;
}

async function seedWorld(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const { AGENT_ID, SESSION_IDS, TEAM_ID, BET_ID } = worldIds(ids);
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: AGENT_ID,
		kind: "ai",
		name: "Dispatch agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(teams).values({ id: TEAM_ID, name: TEAM_ID, phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: `${TEAM_ID}-members`,
		teamId: TEAM_ID,
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(bets).values({
		id: BET_ID,
		teamId: TEAM_ID,
		description: "Dispatch-attempt ordinal bet",
		status: "active",
		createdAt: now,
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

async function seedTask(db: HyperIdleDb, ids: ScopedIds, taskId: string): Promise<void> {
	const { AGENT_ID, TEAM_ID, BET_ID } = worldIds(ids);
	const now = new Date().toISOString();
	await db.insert(tasks).values({
		id: taskId,
		betId: BET_ID,
		teamId: TEAM_ID,
		ownerAgentId: AGENT_ID,
		title: taskId,
		state: "accepted",
		createdAt: now,
		updatedAt: now,
	});
}

function attemptInput(
	ids: ScopedIds,
	taskId: string,
	predecessorIndex = 0,
): {
	readonly taskId: string;
	readonly occasion: string;
	readonly agentId: string;
	readonly predecessorSessionId: string;
	readonly now: string;
} {
	const { AGENT_ID, SESSION_IDS } = worldIds(ids);
	return {
		taskId,
		occasion: "owner_handoff",
		agentId: AGENT_ID,
		predecessorSessionId: SESSION_IDS[predecessorIndex] ?? SESSION_IDS[0],
		now: new Date().toISOString(),
	};
}

/**
 * @lore Ordered by `ordinal`, never by `createdAt`. `createdAt` is an ISO string
 * at millisecond resolution and these fixtures write several rows for one task
 * inside the same millisecond, so `createdAt` is not a total order here — rows
 * written moments apart routinely carry the identical stamp and the sort falls
 * through to whatever tiebreak follows. An assertion that encoded *creation*
 * order against this query was right roughly 7 runs in 10. `ordinal` is unique
 * per task (the `(task_id, ordinal)` index), so ordering by it is total and
 * deterministic — but it also means this helper cannot witness which row was
 * written first. A case that needs that must address its rows by id (see
 * `ordinalOf`), not by position.
 */
async function ordinalsFor(db: HyperIdleDb, taskId: string): Promise<number[]> {
	const rows = await db
		.select({ ordinal: taskDispatchAttempts.ordinal })
		.from(taskDispatchAttempts)
		.where(eq(taskDispatchAttempts.taskId, taskId))
		.orderBy(asc(taskDispatchAttempts.ordinal));
	return rows.map((row) => row.ordinal);
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
	test("A1: three successive calls for one task produce ordinals 1, 2, 3", async ({ db, ids }) => {
		await seedWorld(db, ids);
		await seedTask(db, ids, ids("task-a1"));

		const first = await taskDispatchAttemptStore.insertAttempt(
			db,
			attemptInput(ids, ids("task-a1"), 0),
		);
		const second = await taskDispatchAttemptStore.insertAttempt(
			db,
			attemptInput(ids, ids("task-a1"), 1),
		);
		const third = await taskDispatchAttemptStore.insertAttempt(
			db,
			attemptInput(ids, ids("task-a1"), 2),
		);

		expect(await ordinalsFor(db, ids("task-a1"))).toEqual([1, 2, 3]);
		expect(await ordinalOf(db, first.id)).toBe(1);
		expect(await ordinalOf(db, second.id)).toBe(2);
		expect(await ordinalOf(db, third.id)).toBe(3);
		expect(new Set([first.id, second.id, third.id]).size).toBe(3);

		const [row] = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.id, first.id));
		expect(row?.status).toBe("requested");
		expect(row?.occasion).toBe("owner_handoff");
		expect(row?.agentId).toBe(worldIds(ids).AGENT_ID);
		expect(row?.predecessorSessionId).toBe(worldIds(ids).SESSION_IDS[0]);
	});

	test("A2: the count is scoped to one task — task B's first attempt is 1, not 4", async ({
		db,
		ids,
	}) => {
		await seedWorld(db, ids);
		await seedTask(db, ids, ids("task-a2-a"));
		await seedTask(db, ids, ids("task-a2-b"));

		await taskDispatchAttemptStore.insertAttempt(db, attemptInput(ids, ids("task-a2-a"), 0));
		await taskDispatchAttemptStore.insertAttempt(db, attemptInput(ids, ids("task-a2-a"), 1));
		await taskDispatchAttemptStore.insertAttempt(db, attemptInput(ids, ids("task-a2-a"), 2));

		await taskDispatchAttemptStore.insertAttempt(db, attemptInput(ids, ids("task-a2-b"), 0));

		expect(await ordinalsFor(db, ids("task-a2-a"))).toEqual([1, 2, 3]);
		expect(await ordinalsFor(db, ids("task-a2-b"))).toEqual([1]);
	});

	test("A3: the rule is count-based, not max-based — one row at ordinal 9 yields 2", async ({
		db,
		ids,
	}) => {
		await seedWorld(db, ids);
		await seedTask(db, ids, ids("task-a3"));
		const now = new Date().toISOString();
		await db.insert(taskDispatchAttempts).values({
			id: ids("attempt-a3-seed"),
			taskId: ids("task-a3"),
			occasion: "accepted",
			agentId: worldIds(ids).AGENT_ID,
			ordinal: 9,
			status: "requested",
			createdAt: now,
			updatedAt: now,
		});

		const inserted = await taskDispatchAttemptStore.insertAttempt(
			db,
			attemptInput(ids, ids("task-a3")),
		);

		// Addressed by identity, not by position: one existing row means the count
		// rule yields 2 for the new row, where a max-based rule would yield 10. The
		// seeded 9 must survive untouched, and no third row may appear.
		expect(await ordinalOf(db, inserted.id)).toBe(2);
		expect(await ordinalOf(db, ids("attempt-a3-seed"))).toBe(9);
		expect(await ordinalsFor(db, ids("task-a3"))).toHaveLength(2);
	});

	test("A4: two calls inside one transaction see each other — 1 then 2, readable through tx", async ({
		db,
		ids,
	}) => {
		await seedWorld(db, ids);
		await seedTask(db, ids, ids("task-a4"));

		const seen = await db.transaction(async (tx) => {
			const first = await taskDispatchAttemptStore.insertAttempt(
				tx,
				attemptInput(ids, ids("task-a4"), 0),
			);
			const second = await taskDispatchAttemptStore.insertAttempt(
				tx,
				attemptInput(ids, ids("task-a4"), 1),
			);
			const rows = await tx
				.select({ id: taskDispatchAttempts.id, ordinal: taskDispatchAttempts.ordinal })
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.taskId, ids("task-a4")))
				.orderBy(asc(taskDispatchAttempts.ordinal));
			return { first, second, rows };
		});

		expect(seen.rows.map((row) => row.ordinal)).toEqual([1, 2]);
		expect(seen.rows.map((row) => row.id)).toEqual([seen.first.id, seen.second.id]);
		expect(await ordinalsFor(db, ids("task-a4"))).toEqual([1, 2]);
	});

	test("A5: a throwing transaction leaves zero attempt rows", async ({ db, ids }) => {
		await seedWorld(db, ids);
		await seedTask(db, ids, ids("task-a5"));

		await expect(
			db.transaction(async (tx) => {
				await taskDispatchAttemptStore.insertAttempt(tx, attemptInput(ids, ids("task-a5")));
				throw new Error("handoff failed after the attempt row was written");
			}),
		).rejects.toThrow("handoff failed after the attempt row was written");

		expect(await ordinalsFor(db, ids("task-a5"))).toEqual([]);
	});
});
