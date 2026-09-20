/**
 * AU26 H1 (§D-M.1) — RED. `endRunForHandoff` does not exist yet; the import
 * fails to resolve until the green phase.
 *
 * This is the run-end write `layers/core-api/policy/handoff-protocol.ts`
 * hand-copied one Layer up. It comes down here because it is
 * `run-orchestration`'s state transition, and the three properties below are
 * the whole reason it cannot be expressed as a call into `endSession`
 * (§D-M.1 trap (b) — `endSession` CASes on `state = "active"` and its caller
 * emits `session_ended`):
 *
 *  1. **Unconditional** — no CAS on `state = "active"`. A handoff on a run
 *     that is not `active` must still leave the row terminal.
 *  2. **Caller's transaction** — it takes a `WriteExecutor`, so the caller's
 *     `tx` handle drives it and the row is terminal at the caller's commit,
 *     never before and never after.
 *  3. **Emits nothing** — enforced by the type system, not by a test: the
 *     signature takes no `EventBus`, so it structurally cannot emit
 *     `session_ended` (which would create a spurious review item on every
 *     handoff via `review/session-review-creator.ts`).
 */

import { type HyperIdleDb, sessions, tasks, teams, threads, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { endRunForHandoff } from "../end-run-for-handoff.js";

const NOW = "2026-08-04T10:00:00.000Z";
const ENDED_AT = "2026-08-04T11:00:00.000Z";

async function seedRun(db: HyperIdleDb, state: string): Promise<void> {
	await db.insert(teams).values({ id: "team-1", name: "T", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: "agent-1",
		name: "A",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(threads).values({
		id: "thr-bet-1",
		hostKind: "team",
		hostId: "team-1",
		initiatorId: "agent-1",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "bet-1",
		threadId: "thr-bet-1",
		parentTaskId: null,
		teamId: "team-1",
		title: "d",
		description: "d",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: "thr-task-1",
		hostKind: "team",
		hostId: "team-1",
		initiatorId: "agent-1",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-1",
		threadId: "thr-task-1",
		parentTaskId: "bet-1",
		teamId: "team-1",
		title: "T1",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(sessions).values({
		id: "session-1",
		taskId: "task-1",
		agentId: "agent-1",
		modelTier: "workhorse",
		startedAt: NOW,
		state,
	});
}

describe("endRunForHandoff", () => {
	test("leaves the run terminal with the caller's endedAt and no outcome", async ({ db }) => {
		await seedRun(db, "active");

		await endRunForHandoff(db, "session-1", ENDED_AT);

		const [row] = await db.select().from(sessions).where(eq(sessions.id, "session-1"));
		expect(row?.state).toBe("done");
		expect(row?.endedAt).toBe(ENDED_AT);
		// A handoff records no session-end outcome — that is what keeps the
		// upward propagation engine (which only acts on `completed`) out of it.
		expect(row?.outcome).toBeNull();
	});

	test("is unconditional — a run that is not `active` is still ended", async ({ db }) => {
		await seedRun(db, "paused");

		await endRunForHandoff(db, "session-1", ENDED_AT);

		const [row] = await db.select().from(sessions).where(eq(sessions.id, "session-1"));
		expect(row?.state).toBe("done");
		expect(row?.endedAt).toBe(ENDED_AT);
	});

	test("writes inside the caller's transaction and rolls back with it", async ({ db }) => {
		await seedRun(db, "active");

		await expect(
			db.transaction(async (tx) => {
				await endRunForHandoff(tx, "session-1", ENDED_AT);
				throw new Error("caller aborted after the run-end write");
			}),
		).rejects.toThrow("caller aborted after the run-end write");

		const [row] = await db.select().from(sessions).where(eq(sessions.id, "session-1"));
		expect(row?.state).toBe("active");
		expect(row?.endedAt).toBeNull();
	});
});
