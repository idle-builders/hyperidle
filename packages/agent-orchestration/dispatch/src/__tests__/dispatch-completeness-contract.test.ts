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
	 */
	test("start wires every non-scheduled trigger source and its disposer removes every subscription", async () => {
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
		// `@lore`). `dispatch` now subscribes to exactly one event.
		expect(new Set(subscribed)).toEqual(new Set(["thread_message_appended"]));
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
