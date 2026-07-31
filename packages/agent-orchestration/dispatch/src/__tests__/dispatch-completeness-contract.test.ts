import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus, nextCronMatch, parseCron } from "@hyperidle/shared";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createDispatchOps } from "../index.js";
import type { DispatchPorts } from "../ports.js";

function inertPorts(): DispatchPorts {
	const operation = vi.fn(async () => []);
	const accessor = new Proxy(
		{},
		{
			get: (target, property) =>
				Reflect.has(target, property) ? Reflect.get(target, property) : operation,
		},
	);
	return new Proxy(
		{},
		{
			get: () => accessor,
		},
	) as DispatchPorts;
}

function inertDb(): HyperIdleDb {
	const query = {
		from: () => query,
		where: async () => [],
	};
	return { select: () => query } as unknown as HyperIdleDb;
}

describe("dispatch public capability contract", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	/**
	 * @lore AU21 §9 Increment 4: the four scheduler-mechanics tests that used to
	 * live here (`scheduler startup failure...`, `partial event-trigger
	 * registration...`, `interval construction failure...`, `scheduler does not
	 * overlap...`) tested the routine cron/due-eval scheduler, which relocated
	 * to `@hyperidle/routine`'s `startRoutineScheduler` (architecture.md §6
	 * Decision B′/B″ ruling #4) — `dispatchOps.start` no longer has a
	 * `scheduler` config branch at all. Their equivalent guarantees (event-
	 * trigger partial-registration unwind, interval-construction-failure
	 * unwind, tick non-overlap) are ported to
	 * `packages/core-api/routine/src/__tests__/routine-scheduler.completeness.integration.test.ts`
	 * against the relocated code, using real seeded routines (that package's
	 * DB reads are ordinary intra-package calls now, not mockable
	 * `DispatchPorts` methods).
	 *
	 * @lore AU21 §9 Increment 11 (Decision H2, Wave B) — RED phase: the
	 * assistant-thread pin trigger (`registerAssistantTriggerInternal`,
	 * `dispatch`'s last remaining `eventBus.on` registration, subscribing
	 * `thread_message_appended` to read `ports.conversation.getThreadById` +
	 * `ports.users.getUserById` — an `agent-orchestration -> core-api` READ) is
	 * DELETED entirely, not migrated. The pin decision moves ENTIRELY into a
	 * core-api `thread_message_appended` subscriber (see
	 * `assistant-thread-pin-coreapi-subscriber.integration.test.ts`) —
	 * `dispatch`'s own `start()` no longer needs to observe this event at all.
	 * After this wave `dispatchOps.start` wires ZERO event subscriptions —
	 * `dispatch/src/service.ts` holds zero `-> core-api` edge of any kind (the
	 * concrete boundary close named in architecture.md §9's Increment 11
	 * paragraph). Currently RED: `registerAssistantTriggerInternal` still
	 * subscribes `thread_message_appended` today, so `subscribed` is
	 * `["thread_message_appended"]`, not empty — the `toEqual(new Set())`
	 * assertion below fails for that reason.
	 */
	test("start wires ZERO event subscriptions now that the pin trigger moved core-side (Increment 11)", async () => {
		const eventBus = new EventBus();
		const subscribed: string[] = [];
		const originalOn = eventBus.on.bind(eventBus);
		const originalOff = eventBus.off.bind(eventBus);
		vi.spyOn(eventBus, "on").mockImplementation(((type: string, handler: never) => {
			subscribed.push(type);
			return originalOn(type as never, handler);
		}) as typeof eventBus.on);
		const off = vi
			.spyOn(eventBus, "off")
			.mockImplementation(((type: string, handler: never) =>
				originalOff(type as never, handler)) as typeof eventBus.off);
		const ops = createDispatchOps(inertPorts());

		const dispose = await ops.start({
			db: inertDb(),
			eventBus,
		});

		// AU21 §9 Increment 4: `bet_state_changed` (the builtin-routine reaction)
		// is no longer subscribed by `dispatchOps.start` — it relocated to
		// `@hyperidle/routine`'s `registerBuiltinRoutineHandlers`.
		// AU21 §9 Increment 9 (forensic-triage wave, second pass): the task-queue
		// trigger (`task_state_changed`/`session_ended`) is gone too — the
		// mechanism was genuinely dead (see `service.ts`'s `dispatch::work`
		// `@lore`).
		// AU21 §9 Increment 11 (Wave B): the assistant-thread pin trigger
		// (`thread_message_appended`) is gone too — the pin decision now lives
		// entirely core-side. `dispatch` subscribes to NOTHING.
		expect(new Set(subscribed)).toEqual(new Set());
		await expect(ops.start({ db: inertDb(), eventBus })).rejects.toThrow(
			"dispatch already started",
		);
		dispose();
		expect(off).toHaveBeenCalledTimes(subscribed.length);
		dispose();
		const restarted = await ops.start({ db: inertDb(), eventBus });
		restarted();
	});

	test("cron parsing and next-match preserve named days, ranges, and strict after-time semantics", () => {
		const cron = parseCron("30 9 1-7 * MON");
		const match = nextCronMatch(cron, new Date("2026-06-01T09:30:00.000Z"));

		expect(match.toISOString()).toBe("2026-07-06T09:30:00.000Z");
		expect(() => parseCron("61 9 * * MON")).toThrow("Invalid cron field value: 61");
	});
});
