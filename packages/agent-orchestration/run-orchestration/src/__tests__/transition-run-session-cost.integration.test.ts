/**
 * AU21 §9 Increment 6 (Decision D) — per-session cost, RED phase.
 *
 * `transition-run.ts`'s `endSession`/`crashSession` already receive a
 * `costInCents` value (`totalCostCents`, live-computed in `provisioner.ts`)
 * and already emit it on `session_ended` — but TODAY only when
 * `context.routineId` is set:
 *
 *   ...(context.routineId
 *     ? { routineRunOutcome: routineRunOutcome ?? "success", costInCents }
 *     : {}),
 *
 * i.e. `costInCents` is bundled with the routine-only finalize payload. Per
 * architecture.md §6 Decision D, the per-session-cost gap is NOT
 * routine-specific — `tasks.ts`'s `cost: null` (the literal gap this
 * increment closes) serves the `/tasks/:id/sessions` list for ANY
 * task-backed session, routine or not. `AgentOrchestrationPort`'s
 * per-session-cost read (a later wave) needs `costInCents` on `session_ended`
 * for EVERY session, not only routine-sourced ones.
 *
 * CONFUSION (flagged for reviewer sign-off): this wave widens the emit so
 * `costInCents` is hoisted OUT of the `context.routineId` conditional and
 * always included (independent of `routineRunOutcome`, which stays
 * routine-only). This is a deliberate, minimal widening of an event shape
 * Increment 4 Wave C already introduced — not a new event, not a new field,
 * just removing an unnecessary gate on an existing optional field. The
 * existing protected test
 * (`transition-run-routine-collapse.integration.test.ts`'s "a non-routine
 * session's endSession never carries a routine finalize payload") only
 * asserts `routineRunOutcome` is undefined for a non-routine session — it
 * does not assert anything about `costInCents` — so this widening does not
 * regress that protected guarantee.
 *
 * RED today: every test below asserts `costInCents` is present on
 * `session_ended` for a NON-routine session (no `context.routineId`). The
 * current production code omits it in that case (gated behind
 * `context.routineId`), so these assertions fail for the right reason.
 */
import { type HyperIdleDb, sessions, teamMembers, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus, type SessionEndedEvent } from "@hyperidle/shared";
import { transitionRun } from "../transition-run.js";

const NOW = new Date().toISOString();

function buildPorts() {
	return {
		sessionRequests: {
			findSessionRequest: async () => undefined,
			listSessionRequests: async () => [],
			transitionSessionRequest: async () => null,
			abortSessionRun: async () => false,
			registerSessionRun: () => undefined,
			deregisterSessionRun: () => undefined,
		},
	};
}

async function seedNonRoutineSession(db: HyperIdleDb, id: string): Promise<{ agentId: string }> {
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
	await db.insert(sessions).values({
		id: `${id}-session`,
		agentId,
		modelTier: "fast",
		startedAt: NOW,
		state: "active",
	});
	return { agentId };
}

describe("transitionRun session disposition — per-session cost always carried (Decision D, Increment 6)", () => {
	test("endSession for a NON-routine session still carries costInCents on session_ended", async ({
		db,
	}) => {
		const { agentId } = await seedNonRoutineSession(db, "tsc-end");
		const eventBus = new EventBus();
		const captured: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => captured.push(event));

		await transitionRun(
			{ db, eventBus, ports: buildPorts() },
			{
				target: "session",
				context: {
					sessionId: "tsc-end-session",
					agentId,
					taskId: null,
					sandboxPath: "/tmp/tsc-end",
					ingestion: { dispose: () => {} },
					traceId: "trace-tsc-end",
				},
				disposition: "end",
				costInCents: 750,
			},
		);

		expect(captured).toHaveLength(1);
		expect(captured[0]?.costInCents).toBe(750);
	});

	test("crashSession for a NON-routine session still carries costInCents on session_ended", async ({
		db,
	}) => {
		const { agentId } = await seedNonRoutineSession(db, "tsc-crash");
		const eventBus = new EventBus();
		const captured: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => captured.push(event));

		await transitionRun(
			{ db, eventBus, ports: buildPorts() },
			{
				target: "session",
				context: {
					sessionId: "tsc-crash-session",
					agentId,
					taskId: null,
					sandboxPath: "/tmp/tsc-crash",
					ingestion: { dispose: () => {} },
					traceId: "trace-tsc-crash",
				},
				disposition: "crash",
				costInCents: 250,
			},
		);

		expect(captured).toHaveLength(1);
		expect(captured[0]?.costInCents).toBe(250);
	});

	test("a zero-cost non-routine session still carries costInCents:0 (present, not omitted)", async ({
		db,
	}) => {
		const { agentId } = await seedNonRoutineSession(db, "tsc-zero");
		const eventBus = new EventBus();
		const captured: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => captured.push(event));

		await transitionRun(
			{ db, eventBus, ports: buildPorts() },
			{
				target: "session",
				context: {
					sessionId: "tsc-zero-session",
					agentId,
					taskId: null,
					sandboxPath: "/tmp/tsc-zero",
					ingestion: { dispose: () => {} },
					traceId: "trace-tsc-zero",
				},
				disposition: "end",
				costInCents: 0,
			},
		);

		expect(captured).toHaveLength(1);
		expect(captured[0]?.costInCents).toBe(0);
	});
});
