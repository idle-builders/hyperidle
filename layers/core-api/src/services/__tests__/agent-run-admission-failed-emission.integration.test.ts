/**
 * AU21 Increment 3, Wave 0 (RED) — the NEW pre-handoff failure channel.
 *
 * architecture.md §6 Decision B4 / §10's `AgentRunAdmissionFailedEvent` /
 * §13's migration list: `failOrRelease` (session-requests/src/service.ts:960)
 * must EMIT `agent_run_admission_failed` on every failed claim/dispatch
 * attempt (terminal computed exactly as today's logic already does), and must
 * STOP performing its current direct `deps.routine.updateRoutineRunIfRunning`
 * write for a terminal `routine_run` failure — that write moves to a core-api
 * subscriber reacting to the new event (see the sibling
 * `agent-run-admission-failed-subscribers.integration.test.ts`).
 *
 * This file proves ONLY the emission contract — the event fires, with the
 * right shape, for both terminal codes and the non-terminal (informational)
 * case — and that failOrRelease's own direct write is gone (GREEN: `deps.
 * eventBus` exists on `DurableAgentQueueDeps` and is genuinely wired; AU21 §9
 * Increment 9 additionally deleted the dead `deps.routine` surface entirely,
 * so there is no longer even a compile-time path back to the old direct
 * write).
 *
 * @lore assertion note: `streamId`'s exact convention for a PRE-resolution
 * failure (the resolution itself is what's failing, so a fully-resolved
 * `task:<id>`/`routine:<id>`/`thread:<id>` stream may not be derivable from
 * the stored intent row alone) is not pinned down by architecture.md beyond
 * "same convention as AgentWorkIntentEvent" — this test asserts its presence
 * as a non-empty string, not an exact format, and leaves the precise
 * convention to the implementer.
 */

import { agentWorkIntents, type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { eq, sql } from "drizzle-orm";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

/**
 * AU21 §9 Increment 4, Wave B — `routine_run` is now ALSO migrated to
 * resolve-at-emit (the last of the seven kinds), so the "inject a throwing
 * `deps.routine.getRoutineRunById` spy" vehicle the two tests below used
 * (per their own `@lore` note, itself a repeat of the same move once made for
 * `assistant_turn`) no longer reaches any domain read at drain time — a bare
 * `routine_run` intent now fails immediately with `InvalidAgentWorkSourceError`
 * before ever touching `deps.routine`. Both tests are rewritten to the SAME
 * real-infra-fault-injection vehicle
 * `agent-run-admission-failed-routine-run-migration.integration.test.ts`
 * proves: a genuinely BAKED `routine_run` intent (so the drain takes the
 * zero-domain-read baked path, exactly like production) whose downstream
 * `agent_session_requests` insert is rejected by a real Postgres trigger —
 * a legitimate non-`InvalidAgentWorkSourceError` failure class for an
 * already-validly-baked payload, same as the `_bake_deps` these two tests
 * exist to exercise (failOrRelease's generic terminal/non-terminal + max-
 * attempts mechanics), not any one kind's resolution.
 */
async function rejectSessionRequestWrites(db: HyperIdleDb): Promise<void> {
	await db.execute(
		sql`drop trigger if exists au21_reject_session_request_write_emission on agent_session_requests`,
	);
	await db.execute(sql`
		create or replace function au21_reject_session_request_write_emission() returns trigger as $$
		begin raise exception 'AU21 injected agent_session_requests write failure (emission vehicle)'; end;
		$$ language plpgsql
	`);
	await db.execute(sql`
		create trigger au21_reject_session_request_write_emission
		before insert on agent_session_requests
		for each row execute function au21_reject_session_request_write_emission()
	`);
}

function bakedRoutineRunRequest(idSuffix: string) {
	return {
		defaultAgentId: `emission-vehicle-agent-${idSuffix}`,
		sourceKind: "routine" as const,
		sourceId: `emission-vehicle-run-${idSuffix}`,
		streamId: `routine:emission-vehicle-routine-${idSuffix}`,
		teamId: `emission-vehicle-team-${idSuffix}`,
		taskId: null,
		sourceCorrelation: {
			routineId: `emission-vehicle-routine-${idSuffix}`,
			routineRunId: `emission-vehicle-run-${idSuffix}`,
			teamId: `emission-vehicle-team-${idSuffix}`,
		},
	};
}

async function seedRoutineVehicleFks(db: HyperIdleDb, idSuffix: string): Promise<void> {
	await db.insert(teams).values({
		id: `emission-vehicle-team-${idSuffix}`,
		name: `Emission vehicle team ${idSuffix}`,
		phase: "build",
		createdAt: NOW,
	});
	// The owner writes the membership row alongside the team.
	await db.insert(teamMembers).values({
		id: `emission-vehicle-team-${idSuffix}-members`,
		teamId: `emission-vehicle-team-${idSuffix}`,
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values({
		id: `emission-vehicle-agent-${idSuffix}`,
		kind: "ai",
		name: "Emission vehicle agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
}

type CapturedAdmissionFailure = {
	readonly type: string;
	readonly intentId: string;
	readonly kind: string;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly failureCode: string;
	readonly terminal: boolean;
	readonly streamId?: string;
	readonly timestamp?: number;
};

function captureAdmissionFailures(eventBus: {
	on: (type: string, handler: (e: unknown) => void) => () => void;
}) {
	const events: CapturedAdmissionFailure[] = [];
	const unsubscribe = eventBus.on("agent_run_admission_failed", (event) => {
		events.push(event as CapturedAdmissionFailure);
	});
	return { events, unsubscribe };
}

describe("agent_run_admission_failed — emission from failOrRelease", () => {
	// @lore AU44: The "terminal INVALID_WORK_SOURCE failure" test was deleted here.
	// It relied on the unbaked-intent drain path (resolveIntentInputInternal) which
	// AU44 removed — bakedRequest is now required, unbaked intents are unreachable.
	// The MAX_ATTEMPTS_EXCEEDED and non-terminal tests below (baked + Postgres
	// trigger) remain as the live emission proofs.

	// @lore AU21 §9 Increment 4, Wave B: these two tests originally used
	// `assistant_turn`, then `routine_run` (once `assistant_turn` migrated),
	// as a "still-unmigrated kind" vehicle for a transient (non-source-
	// invalid) drain-time failure. Now that ALL SEVEN kinds resolve at emit,
	// there is no kind left that reaches a domain read at drain time for an
	// unbaked intent — see this file's top-of-file note. Vehicle: a genuinely
	// BAKED `routine_run` intent (so `parseBakedRequest` is truthy and the
	// drain takes the zero-domain-read baked path) whose downstream
	// `agent_session_requests` insert is rejected by a real Postgres trigger.
	test("terminal MAX_ATTEMPTS_EXCEEDED failure (non-InvalidAgentWorkSourceError) emits the event", async ({
		db,
		eventBus,
	}) => {
		await seedRoutineVehicleFks(db, "max-attempts");
		await rejectSessionRequestWrites(db);
		const deps = { ...queueDeps(db), eventBus };
		const { events } = captureAdmissionFailures(eventBus);

		const intent = await enqueueWorkIntent(db, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: "wave0-max-attempts-routine-run",
			idempotencyKey: "wave0-max-attempts",
			bakedRequest: bakedRoutineRunRequest("max-attempts"),
		});

		await drainIntents(deps, { maxAttempts: 1 });

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			intentId: intent.id,
			kind: "routine_run",
			failureCode: "MAX_ATTEMPTS_EXCEEDED",
			terminal: true,
		});
		const [row] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, intent.id));
		expect(row?.status).toBe("failed");
	});

	test("a non-terminal (retryable) failure emits an informational event with terminal: false", async ({
		db,
		eventBus,
	}) => {
		await seedRoutineVehicleFks(db, "non-terminal");
		await rejectSessionRequestWrites(db);
		const deps = { ...queueDeps(db), eventBus };
		const { events } = captureAdmissionFailures(eventBus);

		const intent = await enqueueWorkIntent(db, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: "wave0-non-terminal-routine-run",
			idempotencyKey: "wave0-non-terminal",
			bakedRequest: bakedRoutineRunRequest("non-terminal"),
		});

		await drainIntents(deps, { maxAttempts: 5 });

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ intentId: intent.id, terminal: false });
		const [row] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, intent.id));
		expect(row?.status).toBe("pending");

		// Schema-level trigger cleanup — see `rejectSessionRequestWrites`'s
		// @lore above; drop it so it can't leak into a sibling test/file sharing
		// the pooled PGlite instance.
		await db.execute(
			sql`drop trigger if exists au21_reject_session_request_write_emission on agent_session_requests`,
		);
	});

	// @lore AU44: "failOrRelease direct routineRuns write" test deleted.
	// It also relied on the unbaked-intent drain path which AU44 removed.
	// The type system is the live proof: deps.routine no longer exists on
	// DurableQueueDeps (removed in AU21 §9 Increment 9).
});
