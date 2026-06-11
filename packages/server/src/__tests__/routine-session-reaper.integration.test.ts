/**
 * AF6 AC3 — manual trigger never bricks future runs.
 *
 * A `running` routine_run + `active` routine session that never reaches
 * endSession/crashSession (process restart, adapter hang) leaves shouldCoalesce
 * true forever — the routine bricks itself. `reapStaleRoutineSessions` finalizes
 * stale `active` routine sessions to `crashed` and their `running` run to
 * `timeout`, self-healing coalescing.
 *
 * Two triggers covered:
 *  (a) direct reaper call (boot one-shot) → reaps, then a fresh trigger is eligible.
 *  (b) in-process periodic sweep (booted scheduler, no restart) → reaps a session
 *      that hangs DURING the current process.
 */

import {
	bets,
	type HyperIdleDb,
	routineRuns,
	routines,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { bootstrapFabric, shouldCoalesce } from "@hyperidle/fabric";
import { and, eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { reapStaleRoutineSessions } from "../services/routine-session-reaper.js";
import { test } from "../test-fixtures.js";

const POLL_INTERVAL_MS = 50;

async function seedRoutineWithStaleSession(
	db: HyperIdleDb,
	opts: { routineId: string; sessionAgeMs: number },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({
		id: "team-reaper",
		name: "Reaper Team",
		phase: "build",
		createdAt: now,
	});
	await db.insert(teamMembers).values({
		id: "tm-reaper",
		teamId: "team-reaper",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values({
		id: "agent-reaper",
		kind: "ai",
		name: "Reaper Agent",
		role: "builder",
		status: "active",
		teamId: "tm-reaper",
		maxConcurrentSessions: 10,
		createdAt: now,
	});
	await db.insert(bets).values({
		id: "bet-reaper",
		teamId: "team-reaper",
		description: "Reaper bet",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-reaper",
		betId: "bet-reaper",
		teamId: "team-reaper",
		title: "Reaper task",
		state: "accepted",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(routines).values({
		id: opts.routineId,
		name: "Reaper routine",
		teamId: "team-reaper",
		state: "active",
		ownerAgentId: "agent-reaper",
		triggerType: "calendar",
		triggerConfig: JSON.stringify({ cron: "* * * * *", taskId: "task-reaper" }),
		active: true,
		nextRunAt: new Date(Date.now() + 3_600_000).toISOString(),
	});

	const staleStart = new Date(Date.now() - opts.sessionAgeMs).toISOString();
	await db.insert(sessions).values({
		id: `session-${opts.routineId}`,
		taskId: "task-reaper",
		agentId: "agent-reaper",
		modelTier: "workhorse",
		startedAt: staleStart,
		state: "active",
		routineId: opts.routineId,
	});
	await db.insert(routineRuns).values({
		id: `run-${opts.routineId}`,
		routineId: opts.routineId,
		startedAt: staleStart,
		outcome: "running",
		sessionId: `session-${opts.routineId}`,
	});
}

describe("AF6 AC3 — reaper finalizes stale routine sessions", () => {
	test("direct reaper call: stale active session → crashed, running run → timeout, coalescing self-heals", async ({
		db,
		eventBus,
	}) => {
		await seedRoutineWithStaleSession(db, {
			routineId: "routine-reaper-a",
			sessionAgeMs: 60 * 60 * 1000, // 1h old
		});

		// Before reaping: coalescing blocks future runs (brick).
		expect(await shouldCoalesce(db, "routine-reaper-a")).toBe(true);

		const reaped = await reapStaleRoutineSessions(db, eventBus, {
			staleAfterMs: 10 * 60 * 1000, // 10 min
		});
		expect(reaped).toBeGreaterThanOrEqual(1);

		const [session] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, "session-routine-reaper-a"));
		expect(session?.state).toBe("crashed");
		expect(session?.endedAt).toBeTruthy();

		const [run] = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.id, "run-routine-reaper-a"));
		expect(run?.outcome).toBe("timeout");

		// Coalescing self-healed — the routine is eligible for its next run.
		expect(await shouldCoalesce(db, "routine-reaper-a")).toBe(false);
	});

	test("does NOT reap a fresh active session (within staleAfterMs)", async ({ db, eventBus }) => {
		await seedRoutineWithStaleSession(db, {
			routineId: "routine-reaper-fresh",
			sessionAgeMs: 1_000, // 1s old
		});

		const reaped = await reapStaleRoutineSessions(db, eventBus, {
			staleAfterMs: 10 * 60 * 1000,
		});
		expect(reaped).toBe(0);

		const [session] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, "session-routine-reaper-fresh"));
		expect(session?.state).toBe("active");
	});

	// WARNING 2 — in-process periodic sweep. A session that hangs DURING the
	// current long-lived process (no restart) must be reaped by the scheduler's
	// periodic sweep, not only by the boot one-shot.
	test("booted scheduler periodic sweep reaps an in-process stale session", async ({
		db,
		eventBus,
	}) => {
		await seedRoutineWithStaleSession(db, {
			routineId: "routine-reaper-periodic",
			sessionAgeMs: 60 * 60 * 1000,
		});

		// Boot with a tiny staleAfter + reaper cadence so the periodic sweep runs
		// within the test window without a restart.
		const disposers = bootstrapFabric({
			db,
			eventBus,
			routinePollIntervalMs: POLL_INTERVAL_MS,
			reaperStaleAfterMs: 100,
			reaperCadenceMs: 0,
		});

		await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS * 6));
		for (const dispose of disposers) dispose();

		const [session] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, "session-routine-reaper-periodic"));
		expect(session?.state).toBe("crashed");

		const [run] = await db
			.select()
			.from(routineRuns)
			.where(
				and(
					eq(routineRuns.routineId, "routine-reaper-periodic"),
					eq(routineRuns.outcome, "timeout"),
				),
			);
		expect(run).toBeTruthy();
	});
});
