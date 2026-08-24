/**
 * AU21 §9 Increment 4 — routine-runs-as-sessions collapse, Decision B″ item 3
 * (RED). `runtime-reapers.ts`'s `reapStaleRoutineSessions` is the SECOND
 * orchestration-side direct write into `routineRuns` this wave eliminates
 * (`architecture.md` Decision B″ item 3 / §14): it directly calls
 * `ports.routine.findRunningRoutineRun`/`updateRoutineRunById`
 * (`runtime-reapers.ts:181-188`) to finalize a stale (process-restart-orphaned)
 * routine session's run to `outcome:"timeout"`.
 *
 * Per §10 ("re-homed onto the existing `session_ended`/
 * `agent_run_lifecycle_changed` post-session reaction"), the target shape is:
 * the reaper still owns the `sessions` row transition (`state:"crashed"` —
 * `sessions` is an `UNOWNED_SHARED_TABLES` exemption, unaffected by this
 * migration), but instead of writing `routineRuns` directly it EMITS
 * `session_ended` (`sourceKind:"routine"`, `sourceId` = the stale session's
 * OWN `sourceId` column — already `routineRunId`, no extra routine lookup
 * needed) with `routineRunOutcome:"timeout"`; the new core-api subscriber
 * (`routine-run-session-end-reactions.integration.test.ts`, this wave)
 * performs the actual finalize.
 *
 * Today (RED): `reapStaleRoutineSessions` still calls
 * `ports.routine.findRunningRoutineRun(...)` — with a `routine` port that
 * only implements `getRoutineById` (this file's target shape), that call
 * throws (`ports.routine.findRunningRoutineRun is not a function`), so this
 * test fails before ever observing a `session_ended` emission or a
 * `routineRuns` finalize.
 */
import { type HyperIdleDb, routineRuns, routines, sessions, teams, users } from "@hyperidle/db";
import { describe, expect, test, vi } from "@hyperidle/db/test-fixtures";
import type { SessionEndedEvent } from "@hyperidle/event-bus";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { createRuntimeReapers } from "../runtime-reapers.js";

const NOW_MS = Date.parse("2026-07-29T00:00:00.000Z");
const STALE_STARTED_AT = new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString(); // 2h ago

/**
 * The target `SessionLifecyclePorts["routine"]` shape once this wave lands:
 * ONLY `getRoutineById` survives (used elsewhere, e.g. context assembly) —
 * `findRunningRoutineRun`/`updateRoutineRunById`/`updateRoutineById`/
 * `incrementRoutineCost` are gone. Passed `as unknown as` the current
 * (still-wider) port type so this test exercises the TARGET shape by
 * construction rather than today's.
 */
function buildPortsGetOnly() {
	return {
		routine: { getRoutineById: vi.fn() },
	} as unknown as Parameters<typeof createRuntimeReapers>[2];
}

async function seedStaleRoutineSession(
	db: HyperIdleDb,
	id: string,
): Promise<{ readonly routineId: string; readonly runId: string; readonly sessionId: string }> {
	const teamId = `${id}-team`;
	const agentId = `${id}-agent`;
	const routineId = `${id}-routine`;
	const runId = `${id}-run`;
	const sessionId = `${id}-session`;
	const nowIso = new Date(NOW_MS).toISOString();

	await db.insert(teams).values({ id: teamId, name: "Team", phase: "build", createdAt: nowIso });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		teamId: teamId,
		createdAt: nowIso,
	});
	await db.insert(routines).values({
		id: routineId,
		name: "Routine",
		teamId,
		state: "active",
		ownerAgentId: agentId,
		triggerType: "manual",
		active: true,
	});
	await db
		.insert(routineRuns)
		.values({ id: runId, routineId, startedAt: nowIso, outcome: "running" });
	await db.insert(sessions).values({
		id: sessionId,
		agentId,
		modelTier: "fast",
		startedAt: STALE_STARTED_AT,
		state: "active",
		routineId,
		requestId: `${id}-request`,
		sourceKind: "routine",
		sourceId: runId,
	});

	return { routineId, runId, sessionId };
}

/** Widen to read the NOT-YET-EXISTING additive `SessionEndedEvent` field this wave adds. */
function widen(
	event: SessionEndedEvent,
): SessionEndedEvent & { readonly routineRunOutcome?: string } {
	return event as SessionEndedEvent & { readonly routineRunOutcome?: string };
}

describe("reapStaleRoutineSessions — routineRuns collapse (Decision B″ item 3)", () => {
	test("finalizes a stale routine session by emitting session_ended (routineRunOutcome=timeout), not a direct routine port write", async ({
		db,
	}) => {
		const { runId, sessionId } = await seedStaleRoutineSession(db, "rrc-stale");
		const eventBus = new EventBus();
		const captured: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => captured.push(event));

		const reapers = createRuntimeReapers(db, eventBus, buildPortsGetOnly());
		const reaped = await reapers.reapRoutineSessions({ staleAfterMs: 60 * 60 * 1000, now: NOW_MS });

		expect(reaped).toBe(1);
		expect(captured).toHaveLength(1);
		expect(captured[0]).toMatchObject({ sourceKind: "routine", sourceId: runId, sessionId });
		expect(widen(captured[0] as SessionEndedEvent).routineRunOutcome).toBe("timeout");

		const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
		expect(session?.state).toBe("crashed");
	});

	test("a session younger than the TTL is left untouched and emits nothing", async ({ db }) => {
		const { sessionId } = await seedStaleRoutineSession(db, "rrc-fresh");
		await db
			.update(sessions)
			.set({ startedAt: new Date(NOW_MS - 5 * 60 * 1000).toISOString() }) // 5m ago
			.where(eq(sessions.id, sessionId));
		const eventBus = new EventBus();
		const captured: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => captured.push(event));

		const reapers = createRuntimeReapers(db, eventBus, buildPortsGetOnly());
		const reaped = await reapers.reapRoutineSessions({ staleAfterMs: 60 * 60 * 1000, now: NOW_MS });

		expect(reaped).toBe(0);
		expect(captured).toHaveLength(0);
	});
});
