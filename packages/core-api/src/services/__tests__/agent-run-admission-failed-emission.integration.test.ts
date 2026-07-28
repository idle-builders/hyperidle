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
 * case — and that failOrRelease's own direct write is gone. All of this is
 * currently RED: `deps.eventBus` does not exist yet on `DurableAgentQueueDeps`,
 * so `failOrRelease` never emits anything, and it still performs the old
 * direct write for `routine_run`.
 *
 * @lore assertion note: `streamId`'s exact convention for a PRE-resolution
 * failure (the resolution itself is what's failing, so a fully-resolved
 * `task:<id>`/`routine:<id>`/`thread:<id>` stream may not be derivable from
 * the stored intent row alone) is not pinned down by architecture.md beyond
 * "same convention as AgentWorkIntentEvent" — this test asserts its presence
 * as a non-empty string, not an exact format, and leaves the precise
 * convention to the implementer.
 */

import { agentWorkIntents, type HyperIdleDb, threads, users } from "@hyperidle/db";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../../test-fixtures.js";
import { queueDeps } from "../durable-agent-queue.js";

async function seedAssistantAgent(db: HyperIdleDb, id: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: `${id}-human`,
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: `ast-${id}-human`,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(threads).values({
		id: `${id}-thread`,
		hostKind: "user",
		hostId: `${id}-human`,
		initiatorId: `${id}-human`,
		participants: JSON.stringify([`${id}-human`, `ast-${id}-human`]),
		lastActiveAt: now,
		createdAt: now,
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
	test("terminal INVALID_WORK_SOURCE failure emits the event with the correct shape", async ({
		db,
		eventBus,
	}) => {
		const deps = { ...queueDeps(db), eventBus };
		const { events } = captureAdmissionFailures(eventBus);

		const intent = await enqueueWorkIntent(db, {
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			sourceId: "wave0-nonexistent-attempt",
			idempotencyKey: "wave0-invalid-work-source",
		});

		await drainIntents(deps);

		expect(events).toHaveLength(1);
		const [event] = events;
		expect(event).toMatchObject({
			type: "agent_run_admission_failed",
			intentId: intent.id,
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			sourceId: "wave0-nonexistent-attempt",
			failureCode: "INVALID_WORK_SOURCE",
			terminal: true,
		});
		expect(typeof event?.streamId).toBe("string");
		expect(event?.streamId?.length).toBeGreaterThan(0);
		expect(typeof event?.timestamp).toBe("number");

		const [row] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, intent.id));
		expect(row?.status).toBe("failed");
		expect(row?.lastErrorCode).toBe("INVALID_WORK_SOURCE");
	});

	test("terminal MAX_ATTEMPTS_EXCEEDED failure (non-InvalidAgentWorkSourceError) emits the event", async ({
		db,
		eventBus,
	}) => {
		await seedAssistantAgent(db, "wave0-max-attempts");
		const deps = {
			...queueDeps(db),
			eventBus,
			conversation: {
				getMessageById: vi.fn(async () => {
					throw new Error("injected transient failure — not InvalidAgentWorkSourceError");
				}),
			},
		};
		const { events } = captureAdmissionFailures(eventBus);

		const intent = await enqueueWorkIntent(db, {
			kind: "assistant_turn",
			sourceKind: "thread_message",
			sourceId: "wave0-max-attempts-message",
			idempotencyKey: "wave0-max-attempts",
		});

		await drainIntents(deps, { maxAttempts: 1 });

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			intentId: intent.id,
			kind: "assistant_turn",
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
		await seedAssistantAgent(db, "wave0-non-terminal");
		const deps = {
			...queueDeps(db),
			eventBus,
			conversation: {
				getMessageById: vi.fn(async () => {
					throw new Error("injected transient failure");
				}),
			},
		};
		const { events } = captureAdmissionFailures(eventBus);

		const intent = await enqueueWorkIntent(db, {
			kind: "assistant_turn",
			sourceKind: "thread_message",
			sourceId: "wave0-non-terminal-message",
			idempotencyKey: "wave0-non-terminal",
		});

		await drainIntents(deps, { maxAttempts: 5 });

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ intentId: intent.id, terminal: false });
		const [row] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, intent.id));
		expect(row?.status).toBe("pending");
	});

	test("failOrRelease itself no longer performs the direct routineRuns write for a terminal routine_run failure", async ({
		db,
		eventBus,
	}) => {
		const updateRoutineRunIfRunningSpy = vi.fn();
		const deps = {
			...queueDeps(db),
			eventBus,
			routine: {
				...queueDeps(db).routine,
				updateRoutineRunIfRunning: updateRoutineRunIfRunningSpy,
			},
		};

		const intent = await enqueueWorkIntent(db, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: "wave0-nonexistent-routine-run",
			idempotencyKey: "wave0-routine-direct-write-removed",
		});

		await drainIntents(deps);

		const [row] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, intent.id));
		expect(row?.status).toBe("failed");
		// The old direct write is gone from failOrRelease — only a subscriber
		// reacting to the emitted event may perform this write now (tested
		// separately), never failOrRelease calling `deps.routine.*` inline.
		//
		// @lore asserting via `.mock.calls.length` (not `.toHaveBeenCalled()`):
		// the spy's first arg is the live `db` handle (PGlite/drizzle, a huge
		// circular object graph) — vitest's `toHaveBeenCalled()` failure-message
		// diff tries to pretty-print the call args and OOMs the worker. A plain
		// number comparison has no argument-serialization in its failure message.
		expect(updateRoutineRunIfRunningSpy.mock.calls.length).toBe(0);
	});
});
