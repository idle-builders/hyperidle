/**
 * AU21 §9 Increment 4 — disposal-safety guarantees for the relocated routine
 * scheduler (`startRoutineScheduler`, moved from
 * `packages/agent-orchestration/dispatch/src/service.ts`'s
 * `startRoutineTriggerInternal`). Ports two of the four scheduler-mechanics
 * tests that used to live in
 * `packages/agent-orchestration/dispatch/src/__tests__/dispatch-completeness-contract.test.ts`
 * against the relocated code, using REAL seeded routines — `registerEventTriggers`/
 * `backfillMissingNextRunAt`/the tick loop's `listRoutines` read are now
 * ordinary intra-package DB calls (`routine-service.ts`), not mockable
 * `DispatchPorts` methods, so this file is `*.integration.test.ts` (real
 * `{ db }` fixture) rather than a mocked unit test.
 *
 * NOT ported (flagged, not silently dropped):
 *   - "scheduler startup failure removes prior subscriptions" (the OLD test
 *     forced the routine READ ITSELF to throw via a mocked port) — with a
 *     real DB there is no honest, non-invasive way to make ONE specific
 *     `listRoutines` call fail without mocking the DB driver. The malformed-
 *     JSON test below exercises the same unwind code path via a real
 *     mid-loop failure instead.
 *   - "scheduler does not overlap asynchronous ticks" — the original forced
 *     `listActiveRoutines` itself to return a slow-resolving promise; every
 *     other async step inside a tick body is fire-and-forget
 *     (`fireGenericRoutine(...).catch()`, `config.reap().catch()`), so the
 *     `tickRunning` guard can only be observed by controlling the timing of
 *     the routine list read itself — not honestly reproducible against a
 *     real DB without an invasive test-only seam. The `tickRunning` guard's
 *     CODE is unchanged (relocated verbatim, same shape) — flagged as a
 *     residual coverage gap, not a behavior change.
 */
import { type HyperIdleDb, routines, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/shared";
import { describe, vi } from "vitest";
import type { RoutineSchedulerPorts } from "../ports.js";
import { startRoutineScheduler } from "../routine-scheduler.js";

const NOW = "2026-07-28T00:00:00.000Z";

/** Always throws — a `RoutineSchedulerPorts` capability neither test below reaches. */
function unreachable(label: string): () => never {
	return () => {
		throw new Error(`unreachable in this disposal-safety test: ${label}`);
	};
}

/**
 * Neither test seeds a due generic (non-builtin, non-event) routine or fires
 * a builtin routine — only the event-trigger registration + tick-loop
 * scaffolding is exercised — so every port here is a throwing stub.
 */
function inertPorts(): RoutineSchedulerPorts {
	return {
		work: {
			getBetById: unreachable("work.getBetById"),
			createItem: unreachable("work.createItem"),
			findRetroItemByThreadIds: unreachable("work.findRetroItemByThreadIds"),
		},
		conversation: {
			getThreadIdsByHost: unreachable("conversation.getThreadIdsByHost"),
			insertThread: unreachable("conversation.insertThread"),
		},
		knowledge: {
			runAutoPromotionSweep: unreachable("knowledge.runAutoPromotionSweep"),
			runStaleSweep: unreachable("knowledge.runStaleSweep"),
			listRecentByLayers: unreachable("knowledge.listRecentByLayers"),
			recomputeAttentionForCandidates: unreachable("knowledge.recomputeAttentionForCandidates"),
		},
		settings: { readServerConfig: unreachable("settings.readServerConfig") },
		workIntents: { enqueueWorkIntent: unreachable("workIntents.enqueueWorkIntent") },
		agentSelection: {
			isAtCapacity: unreachable("agentSelection.isAtCapacity"),
			selectAgent: unreachable("agentSelection.selectAgent"),
		},
		requireRunnableAgent: unreachable("requireRunnableAgent"),
	};
}

async function seedEventRoutine(db: HyperIdleDb, id: string, triggerConfig: string): Promise<void> {
	const teamId = `${id}-team`;
	const ownerAgentId = `${id}-owner`;
	await db
		.insert(teams)
		.values({ id: teamId, name: "Completeness team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: ownerAgentId,
		kind: "ai",
		name: "Owner",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: NOW,
	});
	await db.insert(routines).values({
		id,
		name: "Completeness event routine",
		teamId,
		state: "active",
		ownerAgentId,
		triggerType: "event",
		triggerConfig,
		active: true,
	});
}

describe("relocated routine scheduler — disposal safety", () => {
	test("partial event-trigger registration unwinds earlier subscriptions and creates no interval", async ({
		db,
	}) => {
		vi.useFakeTimers();
		try {
			const eventBus = new EventBus();
			const subscriptions: Array<ReturnType<typeof vi.fn<() => void>>> = [];
			const originalOn = eventBus.on.bind(eventBus);
			vi.spyOn(eventBus, "on").mockImplementation(((type: string, handler: never) => {
				const unsubscribe = vi.fn(originalOn(type as never, handler));
				subscriptions.push(unsubscribe);
				return unsubscribe;
			}) as typeof eventBus.on);

			// `listRoutines` orders by `id` ASC (`routine-service.ts`) — the ids
			// below are deliberately chosen so the valid routine sorts BEFORE the
			// malformed one, guaranteeing its subscription succeeds before the
			// mid-loop `JSON.parse` failure below.
			await seedEventRoutine(db, "sched-partial-1-ok", '{"eventType":"task_state_changed"}');
			// Malformed JSON — `JSON.parse` throws mid-loop, after the first
			// routine's subscription already succeeded.
			await seedEventRoutine(db, "sched-partial-2-bad", "{");

			await expect(
				startRoutineScheduler(db, eventBus, inertPorts(), { pollIntervalMs: 999_999 }),
			).rejects.toThrow();

			expect(subscriptions.length).toBeGreaterThanOrEqual(1);
			expect(subscriptions.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
			vi.restoreAllMocks();
		}
	});

	test("interval construction failure unwinds scheduler event subscriptions", async ({ db }) => {
		vi.useFakeTimers();
		try {
			const eventBus = new EventBus();
			const subscriptions: Array<ReturnType<typeof vi.fn<() => void>>> = [];
			const originalOn = eventBus.on.bind(eventBus);
			vi.spyOn(eventBus, "on").mockImplementation(((type: string, handler: never) => {
				const unsubscribe = vi.fn(originalOn(type as never, handler));
				subscriptions.push(unsubscribe);
				return unsubscribe;
			}) as typeof eventBus.on);

			await seedEventRoutine(db, "sched-interval-fail", '{"eventType":"task_state_changed"}');

			vi.spyOn(globalThis, "setInterval").mockImplementationOnce(() => {
				throw new Error("timer unavailable");
			});

			await expect(
				startRoutineScheduler(db, eventBus, inertPorts(), { pollIntervalMs: 10 }),
			).rejects.toThrow("timer unavailable");

			expect(subscriptions.length).toBeGreaterThanOrEqual(1);
			expect(subscriptions.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
			vi.restoreAllMocks();
		}
	});
});
