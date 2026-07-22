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
		await expect(ops.start({ db: inertDb(), eventBus })).rejects.toThrow(
			"dispatch already started",
		);
		dispose();
		expect(off).toHaveBeenCalledTimes(subscribed.length);
		dispose();
		const restarted = await ops.start({ db: inertDb(), eventBus });
		restarted();
	});

	test("scheduler startup failure removes prior subscriptions and leaves no interval", async () => {
		vi.useFakeTimers();
		const eventBus = new EventBus();
		const subscriptions: Array<() => void> = [];
		const originalOn = eventBus.on.bind(eventBus);
		vi.spyOn(eventBus, "on").mockImplementation(((type: string, handler: never) => {
			const unsubscribe = originalOn(type as never, handler);
			subscriptions.push(vi.fn(unsubscribe));
			return subscriptions.at(-1) as () => void;
		}) as typeof eventBus.on);
		const ports = inertPorts();
		ports.routine.listScheduledRoutinesMissingNextRunAt = vi.fn(async () => []);
		ports.routine.listActiveRoutines = vi.fn(async () => {
			throw new Error("event trigger discovery failed");
		});
		const ops = createDispatchOps(ports);

		await expect(
			ops.start({
				db: inertDb(),
				eventBus,
				scheduler: { pollIntervalMs: 10 },
			}),
		).rejects.toThrow("event trigger discovery failed");

		expect(vi.getTimerCount()).toBe(0);
		expect(subscriptions.length).toBeGreaterThan(0);
		expect(
			subscriptions.every((unsubscribe) => vi.mocked(unsubscribe).mock.calls.length === 1),
		).toBe(true);
	});

	test("partial event-trigger registration unwinds earlier subscriptions and creates no interval", async () => {
		vi.useFakeTimers();
		const eventBus = new EventBus();
		const subscriptions: Array<ReturnType<typeof vi.fn<() => void>>> = [];
		const originalOn = eventBus.on.bind(eventBus);
		vi.spyOn(eventBus, "on").mockImplementation(((type: string, handler: never) => {
			const unsubscribe = vi.fn(originalOn(type as never, handler));
			subscriptions.push(unsubscribe);
			return unsubscribe;
		}) as typeof eventBus.on);
		const ports = inertPorts();
		ports.routine.listScheduledRoutinesMissingNextRunAt = vi.fn(async () => []);
		ports.routine.listActiveRoutines = vi.fn(async () => [
			{ id: "event-one", triggerConfig: '{"eventType":"task_state_changed"}' },
			{ id: "event-two", triggerConfig: "{" },
		]) as unknown as typeof ports.routine.listActiveRoutines;
		const ops = createDispatchOps(ports);

		await expect(
			ops.start({
				db: inertDb(),
				eventBus,
				scheduler: { pollIntervalMs: 10 },
			}),
		).rejects.toThrow();

		expect(subscriptions.length).toBeGreaterThan(1);
		expect(subscriptions.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	test("interval construction failure unwinds scheduler event subscriptions", async () => {
		vi.useFakeTimers();
		const eventBus = new EventBus();
		const subscriptions: Array<ReturnType<typeof vi.fn<() => void>>> = [];
		const originalOn = eventBus.on.bind(eventBus);
		vi.spyOn(eventBus, "on").mockImplementation(((type: string, handler: never) => {
			const unsubscribe = vi.fn(originalOn(type as never, handler));
			subscriptions.push(unsubscribe);
			return unsubscribe;
		}) as typeof eventBus.on);
		const ports = inertPorts();
		ports.routine.listScheduledRoutinesMissingNextRunAt = vi.fn(async () => []);
		ports.routine.listActiveRoutines = vi.fn(async () => [
			{ id: "event-one", triggerConfig: '{"eventType":"task_state_changed"}' },
		]) as unknown as typeof ports.routine.listActiveRoutines;
		vi.spyOn(globalThis, "setInterval").mockImplementationOnce(() => {
			throw new Error("timer unavailable");
		});
		const ops = createDispatchOps(ports);

		await expect(
			ops.start({
				db: inertDb(),
				eventBus,
				scheduler: { pollIntervalMs: 10 },
			}),
		).rejects.toThrow("timer unavailable");

		expect(subscriptions.length).toBeGreaterThan(1);
		expect(subscriptions.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	test("scheduler does not overlap asynchronous ticks", async () => {
		vi.useFakeTimers();
		let releaseFirstTick!: () => void;
		const firstTick = new Promise<readonly never[]>((resolve) => {
			releaseFirstTick = () => resolve([]);
		});
		const ports = inertPorts();
		ports.routine.listScheduledRoutinesMissingNextRunAt = vi.fn(async () => []);
		ports.routine.listActiveRoutines = vi
			.fn()
			.mockResolvedValueOnce([])
			.mockReturnValueOnce(firstTick)
			.mockResolvedValue([]);
		const ops = createDispatchOps(ports);
		const dispose = await ops.start({
			db: inertDb(),
			eventBus: new EventBus(),
			scheduler: { pollIntervalMs: 10 },
		});

		await vi.advanceTimersByTimeAsync(10);
		expect(ports.routine.listActiveRoutines).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(20);
		expect(ports.routine.listActiveRoutines).toHaveBeenCalledTimes(2);

		releaseFirstTick();
		await vi.advanceTimersByTimeAsync(10);
		expect(ports.routine.listActiveRoutines).toHaveBeenCalledTimes(3);
		dispose();
		expect(vi.getTimerCount()).toBe(0);
	});

	test("queue snapshots expose live state without leaking the mutable queue array", () => {
		const ops = createDispatchOps(inertPorts());
		const first = ops.getQueueSnapshot();
		expect(first).toEqual({ entries: [], draining: false });
		const second = ops.getQueueSnapshot();
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
