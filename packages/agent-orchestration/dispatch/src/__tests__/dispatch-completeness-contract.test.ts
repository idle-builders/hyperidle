import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { describe, expect, test, vi } from "vitest";
import { createDispatchOps, getDispatchQueueSnapshot, nextCronMatch, parseCron } from "../index.js";
import type { DispatchPorts } from "../ports.js";

function inertPorts(): DispatchPorts {
	const operation = vi.fn(async () => []);
	const accessor = new Proxy(
		{},
		{
			get: () => operation,
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
			task: { adapterPool: {}, workspace: {}, sandboxBasePath: "/tmp/dispatch-contract" },
		});

		expect(new Set(subscribed)).toEqual(
			new Set([
				"bet_state_changed",
				"thread_message_appended",
				"task_state_changed",
				"session_ended",
			]),
		);
		dispose();
		expect(off).toHaveBeenCalledTimes(subscribed.length);
	});

	test("queue snapshots expose live state without leaking the mutable queue array", () => {
		const first = getDispatchQueueSnapshot();
		expect(first).toEqual({ entries: [], draining: false });
		const second = getDispatchQueueSnapshot();
		expect(second).toEqual({ entries: [], draining: false });
		expect(second.entries).not.toBe(first.entries);
	});

	test("cron parsing and next-match preserve named days, ranges, and strict after-time semantics", () => {
		const cron = parseCron("30 9 1-7 * MON");
		const match = nextCronMatch(cron, new Date("2026-06-01T09:30:00.000Z"));

		expect(match.toISOString()).toBe("2026-07-06T09:30:00.000Z");
		expect(() => parseCron("61 9 * * MON")).toThrow("Invalid cron field value: 61");
	});
});
