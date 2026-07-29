/**
 * AU21 §9 Increment 6 (Decision D) — per-session cost, RED phase.
 *
 * Per architecture.md §6 Decision D: "the real gap — per-session cost ...
 * Nothing records or serves per-session cost. IF the product wants
 * per-session cost display, that is a new capability: `agent-orchestration`
 * records per-session cost in its own state (it already computes
 * `totalCostCents` at session end) and serves it via `AgentOrchestrationPort`."
 * §10's contracts section: "No new SQL tables assumed; any persisted field
 * is an additive column on an orchestration-owned table." `agentSessionRequests`
 * (this Service's own table, `TABLE_OWNER` in `scripts/table-ownership-guard.ts`)
 * already represents one request-to-session lifecycle record (`sessionId`,
 * `taskId`, `teamId`, `agentId`) — the natural home for the additive
 * `costCents` column this wave adds, rather than inventing a new table.
 *
 * CONFUSION (flagged for reviewer sign-off, not silently assumed): two design
 * calls this wave makes that architecture.md does not pin down verbatim:
 *   1. `costCents` lands on `agentSessionRequests` (matched by `sessionId`),
 *      not a new table — directly licensed by §10's "additive column on an
 *      orchestration-owned table" sentence.
 *   2. `session_ended`'s `costInCents` field, wired at Increment 4 Wave C,
 *      is TODAY only emitted when `context.routineId` is set
 *      (`transition-run.ts`'s `...(context.routineId ? {routineRunOutcome,
 *      costInCents} : {})`) — i.e. only for routine-sourced sessions. Decision
 *      D's per-session-cost gap is NOT routine-specific (`tasks.ts`'s
 *      `cost: null` serves ANY task session). This wave therefore widens the
 *      emit so `costInCents` is ALWAYS present on `session_ended`, independent
 *      of `routineRunOutcome`/`context.routineId` — see the companion RED file
 *      `run-orchestration/src/__tests__/transition-run-session-cost.integration.test.ts`.
 *
 * `session-cost-recorder.ts` (this wave's new module, orchestration-owned,
 * NOT core-api) does NOT YET EXIST — every test below is RED via module
 * resolution failure until the GREEN phase creates it. Target behavior:
 *
 *   - `registerSessionCostRecorder(db, eventBus)` subscribes to `session_ended`
 *     and, when the event carries a defined `costInCents` AND a `sessionId`
 *     matching an `agentSessionRequests` row (via the `session_id` column,
 *     the same match `findRequestSessionInternal` already uses), writes
 *     `costCents` onto that row — ONLY if the row's `costCents` is not
 *     already set (idempotent against a duplicate delivery, same "onlyIf-not-
 *     yet-finalized" shape as `routine-run-session-end-reactions.ts`'s
 *     `finalizeRoutineRun`).
 *   - No matching `agentSessionRequests` row (unknown `sessionId`) → safe no-op.
 *   - `costInCents` undefined/absent on the event → safe no-op.
 *   - Once recorded, a second `session_ended` for the same session with a
 *     DIFFERENT `costInCents` does NOT overwrite the first recorded value
 *     (write-once semantics — a session ends exactly once per the AF7 CAS
 *     invariant, but the reaction is defensive against redelivery).
 *
 * This is orchestration's OWN state write — `session-requests` already owns
 * `agentSessionRequests` (Table ACL); no cross-layer edge, no core-api
 * involvement, per this wave's scope.
 */
import { agentSessionRequests, type HyperIdleDb, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus, type SessionEndedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
// NOT YET CREATED — this import failing to resolve is this file's primary RED signal.
import { registerSessionCostRecorder } from "../session-cost-recorder.js";

const NOW = new Date().toISOString();

async function seedRunningRequest(db: HyperIdleDb, id: string, sessionId: string): Promise<void> {
	const agentId = `${id}-agent`;
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(agentSessionRequests).values({
		id,
		sourceKind: "task",
		sourceId: `${id}-task`,
		streamId: `task:${id}`,
		agentId,
		promptMode: "task",
		sourceCorrelationJson: JSON.stringify({}),
		idempotencyKey: `${id}-key`,
		status: "running",
		sessionId,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function sessionEnded(overrides: Partial<SessionEndedEvent>): SessionEndedEvent {
	return {
		type: "session_ended",
		streamId: overrides.sessionId ?? "session-x",
		sessionId: overrides.sessionId ?? "session-x",
		agentId: "agent-x",
		taskId: null,
		timestamp: Date.now(),
		outcome: "completed",
		...overrides,
	};
}

async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 30));
}

describe("session-cost-recorder — per-session cost write path (Decision D, Increment 6)", () => {
	test("records costInCents from session_ended onto the matching agentSessionRequests row", async ({
		db,
	}) => {
		await seedRunningRequest(db, "scr-happy", "scr-happy-session");
		const eventBus = new EventBus();
		registerSessionCostRecorder(db, eventBus);

		eventBus.emit(
			sessionEnded({
				sessionId: "scr-happy-session",
				agentId: "scr-happy-agent",
				costInCents: 1234,
			}),
		);
		await settle();

		const [row] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "scr-happy"));
		expect((row as unknown as { costCents: number | null } | undefined)?.costCents).toBe(1234);
	});

	test("an event for an unknown sessionId is a safe no-op", async ({ db }) => {
		await seedRunningRequest(db, "scr-unknown", "scr-unknown-session");
		const eventBus = new EventBus();
		registerSessionCostRecorder(db, eventBus);

		eventBus.emit(
			sessionEnded({ sessionId: "does-not-exist", agentId: "scr-unknown-agent", costInCents: 999 }),
		);
		await settle();

		const [row] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "scr-unknown"));
		expect((row as unknown as { costCents: number | null } | undefined)?.costCents).toBeNull();
	});

	test("an event with costInCents undefined is a safe no-op", async ({ db }) => {
		await seedRunningRequest(db, "scr-nocost", "scr-nocost-session");
		const eventBus = new EventBus();
		registerSessionCostRecorder(db, eventBus);

		eventBus.emit(sessionEnded({ sessionId: "scr-nocost-session", agentId: "scr-nocost-agent" }));
		await settle();

		const [row] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "scr-nocost"));
		expect((row as unknown as { costCents: number | null } | undefined)?.costCents).toBeNull();
	});

	test("a second session_ended for the same session does not overwrite the recorded cost", async ({
		db,
	}) => {
		await seedRunningRequest(db, "scr-dup", "scr-dup-session");
		const eventBus = new EventBus();
		registerSessionCostRecorder(db, eventBus);

		eventBus.emit(
			sessionEnded({ sessionId: "scr-dup-session", agentId: "scr-dup-agent", costInCents: 500 }),
		);
		await settle();
		eventBus.emit(
			sessionEnded({ sessionId: "scr-dup-session", agentId: "scr-dup-agent", costInCents: 999 }),
		);
		await settle();

		const [row] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "scr-dup"));
		expect((row as unknown as { costCents: number | null } | undefined)?.costCents).toBe(500);
	});
});
