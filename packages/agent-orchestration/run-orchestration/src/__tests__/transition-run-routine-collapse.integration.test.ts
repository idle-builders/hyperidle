/**
 * AU21 §9 Increment 4 — routine-runs-as-sessions collapse, Decision B″ item 3
 * (RED). `transitionRun`'s session disposition (`endSession`/`crashSession`,
 * `transition-run.ts`) today finalizes a routine session's `routineRuns` row
 * via a DIRECT write — `updateRoutineRunOnSessionEnd` calling
 * `ports.routine.findRunningRoutineRun`/`updateRoutineRunById`/
 * `updateRoutineById`/`incrementRoutineCost` (`transition-run.ts:174-199`).
 * Per architecture.md Decision B″ item 3 + §10: this direct write re-homes
 * onto the EXISTING `session_ended` event — `endSession`/`crashSession`
 * enrich the emit they already make with the routine finalize payload
 * (`routineRunOutcome` + `costInCents`), and a NEW core-api subscriber
 * (`routine-run-session-end-reactions.integration.test.ts`, this wave)
 * performs the actual `routineRuns` write from INSIDE core-api. Once this
 * lands, `TransitionPorts` (`transition-run.ts:15`) needs no `routine` key at
 * all — this file's `buildPortsWithoutRoutine()` proves that target shape by
 * construction (it never satisfies today's `TransitionPorts`, which still
 * requires `routine` — `npm run check` will flag the omission until the
 * production edit lands; that failure is the point of this RED phase).
 *
 * Today (RED): every test below calls `transitionRun` with NO `routine` port
 * at all. `endSession`/`crashSession` still reach for
 * `ports.routine.findRunningRoutineRun(...)` inside
 * `updateRoutineRunOnSessionEnd` whenever `context.routineId` is set — with no
 * `routine` port supplied, that throws (`Cannot read properties of undefined
 * (reading 'findRunningRoutineRun')`), so every test in this file currently
 * fails via that thrown error, never reaching the `session_ended` payload
 * assertions. That crash IS today's real dependency on the port this wave
 * deletes.
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
import { describe, expect, test, vi } from "@hyperidle/db/test-fixtures";
import { EventBus, type SessionEndedEvent } from "@hyperidle/shared";
import { transitionRun } from "../transition-run.js";

const NOW = new Date().toISOString();

/**
 * Deliberately OMITS `routine` — the target `TransitionPorts` shape once
 * Decision B″ item 3 lands. `sessionRequests` is a bag of `vi.fn()` stubs:
 * the "session" disposition path (`endSession`/`crashSession`) never touches
 * `ports.sessionRequests` at all (only the "request" disposition does), so
 * these stand in purely to satisfy today's still-wider port shape.
 */
function buildPortsWithoutRoutine() {
	return {
		sessionRequests: {
			findSessionRequest: vi.fn(),
			listSessionRequests: vi.fn(),
			transitionSessionRequest: vi.fn(),
			abortSessionRun: vi.fn(),
			registerSessionRun: vi.fn(),
			deregisterSessionRun: vi.fn(),
		},
	};
}

async function seedRoutineSession(
	db: HyperIdleDb,
	id: string,
): Promise<{
	readonly routineId: string;
	readonly runId: string;
	readonly agentId: string;
	readonly sessionId: string;
	readonly teamId: string;
}> {
	const teamId = `${id}-team`;
	const tmId = `${id}-tm`;
	const agentId = `${id}-agent`;
	const routineId = `${id}-routine`;
	const runId = `${id}-run`;
	const sessionId = `${id}-session`;

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
		id: routineId,
		name: "Routine",
		teamId,
		state: "active",
		ownerAgentId: agentId,
		triggerType: "manual",
		active: true,
	});
	await db.insert(routineRuns).values({ id: runId, routineId, startedAt: NOW, outcome: "running" });
	await db.insert(sessions).values({
		id: sessionId,
		agentId,
		modelTier: "fast",
		startedAt: NOW,
		state: "active",
		routineId,
		requestId: `${id}-request`,
		sourceKind: "routine",
		sourceId: runId,
	});

	return { routineId, runId, agentId, sessionId, teamId };
}

/** Widen to read the NOT-YET-EXISTING additive `SessionEndedEvent` fields this wave adds. */
function widen(
	event: SessionEndedEvent,
): SessionEndedEvent & { readonly routineRunOutcome?: string; readonly costInCents?: number } {
	return event as SessionEndedEvent & {
		readonly routineRunOutcome?: string;
		readonly costInCents?: number;
	};
}

describe("transitionRun session disposition — routineRuns collapse (Decision B″ item 3)", () => {
	test("endSession for a routine-sourced session emits session_ended carrying the routine finalize payload, with zero routine port dependency", async ({
		db,
	}) => {
		const { routineId, runId, agentId, sessionId, teamId } = await seedRoutineSession(
			db,
			"trc-end",
		);
		const eventBus = new EventBus();
		const captured: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => captured.push(event));

		await transitionRun(
			{ db, eventBus, ports: buildPortsWithoutRoutine() },
			{
				target: "session",
				context: {
					sessionId,
					agentId,
					taskId: null,
					sandboxPath: "/tmp/trc-end",
					ingestion: { dispose: () => {} },
					traceId: "trace-trc-end",
					routineId,
					requestContext: {
						requestId: "trc-end-request",
						sourceKind: "routine",
						sourceId: runId,
						sourceCorrelation: { routineId, routineRunId: runId, teamId },
					},
				},
				disposition: "end",
				costInCents: 500,
			},
		);

		expect(captured).toHaveLength(1);
		expect(captured[0]).toMatchObject({
			sourceKind: "routine",
			sourceId: runId,
			outcome: "completed",
		});
		const event = widen(captured[0] as SessionEndedEvent);
		expect(event.routineRunOutcome).toBe("success");
		expect(event.costInCents).toBe(500);
	});

	test("crashSession for a routine-sourced session emits session_ended with routineRunOutcome=error", async ({
		db,
	}) => {
		const { routineId, runId, agentId, sessionId, teamId } = await seedRoutineSession(
			db,
			"trc-crash",
		);
		const eventBus = new EventBus();
		const captured: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => captured.push(event));

		await transitionRun(
			{ db, eventBus, ports: buildPortsWithoutRoutine() },
			{
				target: "session",
				context: {
					sessionId,
					agentId,
					taskId: null,
					sandboxPath: "/tmp/trc-crash",
					ingestion: { dispose: () => {} },
					traceId: "trace-trc-crash",
					routineId,
					requestContext: {
						requestId: "trc-crash-request",
						sourceKind: "routine",
						sourceId: runId,
						sourceCorrelation: { routineId, routineRunId: runId, teamId },
					},
				},
				disposition: "crash",
				costInCents: 0,
			},
		);

		expect(captured).toHaveLength(1);
		expect(captured[0]).toMatchObject({
			sourceKind: "routine",
			sourceId: runId,
			outcome: "crashed",
		});
		expect(widen(captured[0] as SessionEndedEvent).routineRunOutcome).toBe("error");
	});

	test("budget-exhausted end overrides routineRunOutcome to budget_exhausted even though the session's own outcome stays completed", async ({
		db,
	}) => {
		const { routineId, runId, agentId, sessionId, teamId } = await seedRoutineSession(
			db,
			"trc-budget",
		);
		const eventBus = new EventBus();
		const captured: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => captured.push(event));

		await transitionRun(
			{ db, eventBus, ports: buildPortsWithoutRoutine() },
			{
				target: "session",
				context: {
					sessionId,
					agentId,
					taskId: null,
					sandboxPath: "/tmp/trc-budget",
					ingestion: { dispose: () => {} },
					traceId: "trace-trc-budget",
					routineId,
					requestContext: {
						requestId: "trc-budget-request",
						sourceKind: "routine",
						sourceId: runId,
						sourceCorrelation: { routineId, routineRunId: runId, teamId },
					},
				},
				disposition: "end",
				costInCents: 900,
				routineOutcome: "budget_exhausted",
			},
		);

		expect(captured).toHaveLength(1);
		// The session-level outcome stays "completed" (AL6 v2 terminalOutcome
		// default) — only the routine-specific finalize is overridden.
		expect(captured[0]).toMatchObject({ outcome: "completed" });
		expect(widen(captured[0] as SessionEndedEvent).routineRunOutcome).toBe("budget_exhausted");
	});

	test("a non-routine session's endSession never carries a routine finalize payload", async ({
		db,
	}) => {
		await db
			.insert(teams)
			.values({ id: "trc-nr-team", name: "Team", phase: "build", createdAt: NOW });
		await db.insert(teamMembers).values({
			id: "trc-nr-tm",
			teamId: "trc-nr-team",
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(users).values({
			id: "trc-nr-agent",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			teamId: "trc-nr-tm",
			createdAt: NOW,
		});
		await db.insert(sessions).values({
			id: "trc-nr-session",
			agentId: "trc-nr-agent",
			modelTier: "fast",
			startedAt: NOW,
			state: "active",
		});
		const eventBus = new EventBus();
		const captured: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => captured.push(event));

		await transitionRun(
			{ db, eventBus, ports: buildPortsWithoutRoutine() },
			{
				target: "session",
				context: {
					sessionId: "trc-nr-session",
					agentId: "trc-nr-agent",
					taskId: null,
					sandboxPath: "/tmp/trc-nr",
					ingestion: { dispose: () => {} },
					traceId: "trace-trc-nr",
				},
				disposition: "end",
				costInCents: 0,
			},
		);

		expect(captured).toHaveLength(1);
		expect(widen(captured[0] as SessionEndedEvent).routineRunOutcome).toBeUndefined();
	});
});
