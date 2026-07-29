/**
 * AU21 §9 Increment 4 — routine-runs-as-sessions collapse, Decision B″ item 3
 * (RED). Per architecture.md §10: "EXISTING `SessionEndedEvent` /
 * `AgentRunLifecycleChangedEvent` — post-session; new core-api reaction ...
 * no shape change" for the TRIGGER events, but the reaction itself needs the
 * routine-run finalize payload (`outcome`, `sessionId`, `endedAt`,
 * `costMinor`/`Currency`, `summary`) that `updateRoutineRunOnSessionEnd`
 * (`run-orchestration/transition-run.ts`, deleted by this wave) used to write
 * directly. `costInCents` in particular is orchestration's OWN
 * live-computed value (`totalCostCents` in `provisioner.ts`) with no other
 * channel to reach core-api — `@lore O2` stripped cost columns from
 * `sessions` entirely, so core-api cannot recompute it from the DB. This
 * wave therefore grows `SessionEndedEvent` with two ADDITIVE optional fields
 * (`routineRunOutcome`, `costInCents`) — the same "payload growth, not a new
 * edge" pattern architecture.md Decision B already sanctions for
 * `AgentWorkIntentRecorder`. See this builder's final report for the
 * CONFUSION flag on this specific reading of "no shape change".
 *
 * `registerRoutineRunSessionEndReactions` (packages/core-api/src/services/
 * routine-run-session-end-reactions.ts) does NOT YET EXIST — every test in
 * this file is RED via module resolution failure until the GREEN phase
 * creates it. The target behavior it must implement:
 *
 *   - `session_ended` with `sourceKind:"routine"` and a defined
 *     `routineRunOutcome` finalizes `routineRuns` (by `sourceId` =
 *     `routineRunId`) to that outcome, `sessionId`, `endedAt` (from
 *     `event.timestamp`), and `costMinor`/`costCurrency` when
 *     `costInCents > 0` — mirroring `updateRoutineRunOnSessionEnd` exactly —
 *     ONLY if the run is still `outcome:"running"` (the same `onlyIfRunning`
 *     race-guard `routineService.updateRoutineRun` already exposes), then
 *     increments the owning routine's cost + `lastRunAt` — but ONLY when the
 *     finalize update actually took effect (idempotent against a duplicate
 *     event for an already-finalized run).
 *   - A `session_ended`/`agent_run_lifecycle_changed` for a non-`"routine"`
 *     `sourceKind`, or one with no `routineRunOutcome`, is a no-op.
 *   - `agent_run_lifecycle_changed` with `sourceKind:"routine"` and
 *     `state:"failed"`/`"cancelled"` also finalizes (to `"error"`) — the path
 *     for a routine session that never reached `session_ended` at all (a
 *     pre-session-launch provisioning failure).
 */
import {
	type HyperIdleDb,
	routineRuns,
	routines,
	sessions,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { AgentRunLifecycleChangedEvent, SessionEndedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../../test-fixtures.js";
// NOT YET CREATED — this import failing to resolve is this file's primary RED signal.
import { registerRoutineRunSessionEndReactions } from "../routine-run-session-end-reactions.js";

const NOW = new Date().toISOString();

async function seedRunningRoutine(
	db: HyperIdleDb,
	id: string,
): Promise<{ readonly routineId: string; readonly runId: string; readonly agentId: string }> {
	const teamId = `${id}-team`;
	const tmId = `${id}-tm`;
	const agentId = `${id}-agent`;
	await db.insert(teams).values({ id: teamId, name: "Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: tmId, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		teamId: tmId,
		createdAt: NOW,
	});
	await db.insert(routines).values({
		id,
		name: "Routine",
		teamId,
		state: "active",
		ownerAgentId: agentId,
		triggerType: "manual",
		active: true,
	});
	const runId = `${id}-run`;
	await db
		.insert(routineRuns)
		.values({ id: runId, routineId: id, startedAt: NOW, outcome: "running" });
	return { routineId: id, runId, agentId };
}

/**
 * `routineRuns.sessionId` is a real FK into `sessions` (`onDelete: "set
 * null"`) — the production `endSession`/`crashSession` callers that emit the
 * finalize payload always own a real session row (it's the row being
 * finalized). Seed one here so `finalizeRoutineRun`'s `sessionId` write is
 * against a row that actually exists, matching that real invariant.
 */
async function seedSession(db: HyperIdleDb, id: string, agentId: string): Promise<void> {
	await db.insert(sessions).values({
		id,
		agentId,
		modelTier: "fast",
		startedAt: NOW,
		state: "done",
	});
}

/** Build a `session_ended` event with the additive routine-finalize fields this wave adds. */
function sessionEnded(input: {
	readonly sessionId: string;
	readonly sourceKind: SessionEndedEvent["sourceKind"];
	readonly sourceId: string;
	readonly outcome: SessionEndedEvent["outcome"];
	readonly routineRunOutcome?: string;
	readonly costInCents?: number;
}): SessionEndedEvent {
	return {
		type: "session_ended",
		streamId: input.sessionId,
		sessionId: input.sessionId,
		agentId: "agent-x",
		taskId: null,
		sourceKind: input.sourceKind,
		sourceId: input.sourceId,
		timestamp: Date.now(),
		outcome: input.outcome,
		...(input.routineRunOutcome !== undefined
			? { routineRunOutcome: input.routineRunOutcome }
			: {}),
		...(input.costInCents !== undefined ? { costInCents: input.costInCents } : {}),
	} as SessionEndedEvent;
}

describe("registerRoutineRunSessionEndReactions", () => {
	test("session_ended success finalizes the run, records cost, and updates the routine's lastRunAt", async ({
		db,
		eventBus,
	}) => {
		const { routineId, runId, agentId } = await seedRunningRoutine(db, "rrser-success");
		await seedSession(db, "rrser-success-session", agentId);
		registerRoutineRunSessionEndReactions(db, eventBus);

		eventBus.emit(
			sessionEnded({
				sessionId: "rrser-success-session",
				sourceKind: "routine",
				sourceId: runId,
				outcome: "completed",
				routineRunOutcome: "success",
				costInCents: 750,
			}),
		);

		await vi.waitFor(async () => {
			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.id, runId));
			expect(run?.outcome).toBe("success");
			expect(run?.sessionId).toBe("rrser-success-session");
			expect(run?.endedAt).toBeTruthy();
			expect(run?.costMinor).toBe(750);
		});
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));
		expect(routine?.costActualMinor).toBe(750);
		expect(routine?.lastRunAt).toBeTruthy();
	});

	test("session_ended crashed finalizes the run to error with no cost recorded", async ({
		db,
		eventBus,
	}) => {
		const { runId, agentId } = await seedRunningRoutine(db, "rrser-error");
		await seedSession(db, "rrser-error-session", agentId);
		registerRoutineRunSessionEndReactions(db, eventBus);

		eventBus.emit(
			sessionEnded({
				sessionId: "rrser-error-session",
				sourceKind: "routine",
				sourceId: runId,
				outcome: "crashed",
				routineRunOutcome: "error",
				costInCents: 0,
			}),
		);

		await vi.waitFor(async () => {
			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.id, runId));
			expect(run?.outcome).toBe("error");
			expect(run?.costMinor).toBeNull();
		});
	});

	test("session_ended with routineRunOutcome=budget_exhausted finalizes the run to budget_exhausted", async ({
		db,
		eventBus,
	}) => {
		const { runId, agentId } = await seedRunningRoutine(db, "rrser-budget");
		await seedSession(db, "rrser-budget-session", agentId);
		registerRoutineRunSessionEndReactions(db, eventBus);

		eventBus.emit(
			sessionEnded({
				sessionId: "rrser-budget-session",
				sourceKind: "routine",
				sourceId: runId,
				outcome: "completed",
				routineRunOutcome: "budget_exhausted",
				costInCents: 1200,
			}),
		);

		await vi.waitFor(async () => {
			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.id, runId));
			expect(run?.outcome).toBe("budget_exhausted");
			expect(run?.costMinor).toBe(1200);
		});
	});

	test("ignores a session_ended for a non-routine source", async ({ db, eventBus }) => {
		const { runId } = await seedRunningRoutine(db, "rrser-ignore");
		registerRoutineRunSessionEndReactions(db, eventBus);

		eventBus.emit(
			sessionEnded({
				sessionId: "rrser-ignore-session",
				sourceKind: "assistant",
				sourceId: "thread-x",
				outcome: "completed",
			}),
		);

		// No routineRunOutcome, unrelated sourceKind — give the async reaction a
		// beat, then assert the run is untouched.
		await new Promise((resolve) => setTimeout(resolve, 30));
		const [run] = await db.select().from(routineRuns).where(eq(routineRuns.id, runId));
		expect(run?.outcome).toBe("running");
	});

	test("a duplicate session_ended for an already-finalized run does not double the routine cost", async ({
		db,
		eventBus,
	}) => {
		const { routineId, runId, agentId } = await seedRunningRoutine(db, "rrser-idempotent");
		await seedSession(db, "rrser-idempotent-session", agentId);
		registerRoutineRunSessionEndReactions(db, eventBus);

		const event = sessionEnded({
			sessionId: "rrser-idempotent-session",
			sourceKind: "routine",
			sourceId: runId,
			outcome: "completed",
			routineRunOutcome: "success",
			costInCents: 100,
		});
		eventBus.emit(event);
		await vi.waitFor(async () => {
			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.id, runId));
			expect(run?.outcome).toBe("success");
		});
		// Second, duplicate delivery of the SAME terminal event — the run is no
		// longer "running", so this must be a safe no-op, not a second cost add.
		eventBus.emit(event);
		await new Promise((resolve) => setTimeout(resolve, 30));

		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));
		expect(routine?.costActualMinor).toBe(100);
	});

	test("agent_run_lifecycle_changed failure finalizes a routine run that never reached session_ended (pre-session-launch failure)", async ({
		db,
		eventBus,
	}) => {
		const { runId } = await seedRunningRoutine(db, "rrser-lifecycle");
		registerRoutineRunSessionEndReactions(db, eventBus);

		const event: AgentRunLifecycleChangedEvent = {
			type: "agent_run_lifecycle_changed",
			streamId: `routine:${runId}`,
			requestId: "rrser-lifecycle-request",
			sourceKind: "routine",
			sourceId: runId,
			state: "failed",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await vi.waitFor(async () => {
			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.id, runId));
			expect(run?.outcome).toBe("error");
		});
	});
});
