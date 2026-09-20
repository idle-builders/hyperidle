/**
 * AU21 §9 Increment 4 — disposal-safety guarantees for the relocated routine
 * scheduler (`startRoutineScheduler`, moved from
 * `layers/agent-orchestration/dispatch/src/service.ts`'s
 * `startRoutineTriggerInternal`).
 *
 * @lore BA1 D2: `registerEventTriggers` (one `eventBus.on` per ROUTINE, read
 * once at boot, `trigger_config` JSON-parsed at registration time) is
 * replaced by `registerRoutineEventMatcher` (one `eventBus.on` per member of
 * the compile-time `EVENT_TYPES` constant — 34 subscriptions, always,
 * regardless of what is in the `routines` table). That retires this file's
 * original "partial event-trigger registration unwinds earlier subscriptions"
 * test outright, per architecture.md §6's own failure-behaviour table: a
 * malformed `trigger_config` used to throw inside registration, unwinding
 * every subscription at boot; under D2 it is never parsed at registration
 * time at all — the event name is a real column, read only at MATCH time,
 * long after every subscription already exists. There is no longer a
 * registration-time failure mode a bad row can trigger, so the scenario that
 * test encoded cannot happen — it is replaced below by the positive
 * assertion (malformed data present, scheduler starts anyway) rather than
 * quietly deleted.
 *
 * NOT ported (flagged, not silently dropped):
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
import { EVENT_TYPES, EventBus } from "@hyperidle/event-bus";
import { getAgentIdentity } from "@hyperidle/knowledge";
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
 * Neither test fires a due generic (non-builtin, non-event) routine or a
 * builtin routine — only the event-matcher registration + tick-loop
 * scaffolding is exercised — so every port here is a throwing stub.
 */
function inertPorts(): RoutineSchedulerPorts {
	return {
		work: {
			// @lore BB1: getBetById deleted — bet is now a root task.
			getTaskById: unreachable("work.getTaskById"),
		},
		conversation: {
			findThreadById: unreachable("conversation.findThreadById"),
		},
		knowledge: {
			runAutoPromotionSweep: unreachable("knowledge.runAutoPromotionSweep"),
			runStaleSweep: unreachable("knowledge.runStaleSweep"),
			getItemById: unreachable("knowledge.getItemById"),
		},
		settings: { readServerConfig: unreachable("settings.readServerConfig") },
		workIntents: { enqueueWorkIntent: unreachable("workIntents.enqueueWorkIntent") },
		requireRunnableAgent: unreachable("requireRunnableAgent"),
		getAgentIdentity,
		getRoutinePrompt: unreachable("getRoutinePrompt"),
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
		teamId,
		createdAt: NOW,
	});
	await db.insert(routines).values({
		id,
		name: "Completeness event routine",
		state: "active",
		ownerAgentId,
		triggerType: "event",
		triggerConfig,
		active: true,
	});
}

describe("relocated routine scheduler — disposal safety", () => {
	// BA1 D2: replaces the retired "partial event-trigger registration
	// unwinds" test — the matcher subscribes to EVERY member of EVENT_TYPES
	// unconditionally, never reading `routines` (let alone parsing
	// `trigger_config`) at registration time, so a malformed row present in
	// the table cannot fail startup.
	test("starts successfully with a malformed trigger_config row already in the table", async ({
		db,
	}) => {
		await seedEventRoutine(db, "sched-malformed", "{");

		const eventBus = new EventBus();
		const scheduler = await startRoutineScheduler(db, eventBus, inertPorts(), {
			pollIntervalMs: 999_999,
		});
		try {
			expect(scheduler).toBeDefined();
		} finally {
			scheduler.stop();
		}
	});

	test("registers exactly one subscription per EVENT_TYPES member", async ({ db }) => {
		const eventBus = new EventBus();
		const subscriptions: Array<ReturnType<typeof vi.fn<() => void>>> = [];
		const originalOn = eventBus.on.bind(eventBus);
		vi.spyOn(eventBus, "on").mockImplementation(((type: string, handler: never) => {
			const unsubscribe = vi.fn(originalOn(type as never, handler));
			subscriptions.push(unsubscribe);
			return unsubscribe;
		}) as typeof eventBus.on);

		try {
			const scheduler = await startRoutineScheduler(db, eventBus, inertPorts(), {
				pollIntervalMs: 999_999,
			});
			try {
				expect(subscriptions.length).toBe(EVENT_TYPES.length);
			} finally {
				scheduler.stop();
			}
		} finally {
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

			expect(subscriptions.length).toBe(EVENT_TYPES.length);
			expect(subscriptions.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
			vi.restoreAllMocks();
		}
	});
});
