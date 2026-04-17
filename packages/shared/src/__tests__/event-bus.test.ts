import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../event-bus.js";
import type {
	BetShippedEvent,
	DomainEvent,
	NotificationEvent,
	TaskStateChangedEvent,
} from "../events.js";

function makeTaskEvent(taskId: string, seq: number): TaskStateChangedEvent {
	return {
		type: "task_state_changed",
		streamId: `task:${taskId}`,
		taskId,
		fromState: "proposed",
		toState: "in_progress",
		timestamp: seq,
	};
}

function makeNotification(targetId: string, seq: number): NotificationEvent {
	return {
		type: "notification",
		streamId: `user:${targetId}`,
		targetId,
		message: `msg-${seq}`,
		timestamp: seq,
	};
}

describe("EventBus", () => {
	it("subscribers receive events in order for the same stream", () => {
		const bus = new EventBus();
		const received: number[] = [];

		bus.on("task_state_changed", (e) => {
			received.push(e.timestamp);
		});

		for (let i = 0; i < 5; i++) {
			bus.emit(makeTaskEvent("t1", i));
		}

		expect(received).toEqual([0, 1, 2, 3, 4]);
	});

	it("multiple subscribers to same event both receive it", () => {
		const bus = new EventBus();
		const receivedA: string[] = [];
		const receivedB: string[] = [];

		bus.on("task_state_changed", (e) => {
			receivedA.push(e.taskId);
		});
		bus.on("task_state_changed", (e) => {
			receivedB.push(e.taskId);
		});

		bus.emit(makeTaskEvent("t1", 1));

		expect(receivedA).toEqual(["t1"]);
		expect(receivedB).toEqual(["t1"]);
	});

	it("unsubscribe prevents future delivery", () => {
		const bus = new EventBus();
		const received: string[] = [];

		const handler = (e: TaskStateChangedEvent): void => {
			received.push(e.taskId);
		};

		bus.on("task_state_changed", handler);
		bus.emit(makeTaskEvent("t1", 1));
		bus.off("task_state_changed", handler);
		bus.emit(makeTaskEvent("t2", 2));

		expect(received).toEqual(["t1"]);
	});

	it("wildcard subscription receives all events", () => {
		const bus = new EventBus();
		const received: DomainEvent[] = [];

		bus.on("*", (e) => {
			received.push(e);
		});

		bus.emit(makeTaskEvent("t1", 1));
		bus.emit(makeNotification("u1", 2));

		expect(received).toHaveLength(2);
		expect(received[0].type).toBe("task_state_changed");
		expect(received[1].type).toBe("notification");
	});

	it("wildcard unsubscribe works", () => {
		const bus = new EventBus();
		const received: DomainEvent[] = [];

		const handler = (e: DomainEvent): void => {
			received.push(e);
		};

		bus.on("*", handler);
		bus.emit(makeTaskEvent("t1", 1));
		bus.off("*", handler);
		bus.emit(makeTaskEvent("t2", 2));

		expect(received).toHaveLength(1);
	});

	it("per-stream ordering: 5 sequential events for same task arrive in order", () => {
		const bus = new EventBus();
		const received: number[] = [];

		bus.on("task_state_changed", (e) => {
			received.push(e.timestamp);
		});

		for (let i = 0; i < 5; i++) {
			bus.emit(makeTaskEvent("same-task", i));
		}

		expect(received).toEqual([0, 1, 2, 3, 4]);
	});

	it("once() delivers exactly one event then auto-unsubscribes", () => {
		const bus = new EventBus();
		const received: string[] = [];

		bus.once("task_state_changed", (e) => {
			received.push(e.taskId);
		});

		bus.emit(makeTaskEvent("t1", 1));
		bus.emit(makeTaskEvent("t2", 2));

		expect(received).toEqual(["t1"]);
	});

	it("throughput: 1000 events/sec without drops", () => {
		const bus = new EventBus();
		let count = 0;

		bus.on("task_state_changed", () => {
			count++;
		});

		const eventCount = 1000;
		const start = performance.now();

		for (let i = 0; i < eventCount; i++) {
			bus.emit(makeTaskEvent("perf", i));
		}

		const elapsed = performance.now() - start;
		const eventsPerSec = (eventCount / elapsed) * 1000;

		expect(count).toBe(eventCount);
		// Must handle at least 1000 events/sec
		expect(eventsPerSec).toBeGreaterThan(1000);
	});

	it("emit is synchronous (events delivered before emit returns)", () => {
		const bus = new EventBus();
		let delivered = false;

		bus.on("task_state_changed", () => {
			delivered = true;
		});

		bus.emit(makeTaskEvent("t1", 1));

		// If emit were async, delivered would still be false here
		expect(delivered).toBe(true);
	});

	it("different event types do not cross-deliver", () => {
		const bus = new EventBus();
		const handler = vi.fn();

		bus.on("bet_shipped", handler);
		bus.emit(makeTaskEvent("t1", 1));

		expect(handler).not.toHaveBeenCalled();
	});

	it("type safety: handler receives correctly typed event", () => {
		const bus = new EventBus();

		// This test verifies compile-time type safety.
		// If the types are wrong, tsc will reject this file.
		bus.on("task_state_changed", (e) => {
			// These property accesses must type-check
			const TaskId: string = e.taskId;
			const From: string = e.fromState;
			const To: string = e.toState;
			expect(TaskId).toBeDefined();
			expect(From).toBeDefined();
			expect(To).toBeDefined();
		});

		bus.on("bet_shipped", (e) => {
			const BetId: string = e.betId;
			expect(BetId).toBeDefined();
		});

		bus.emit(makeTaskEvent("t1", 1));
		bus.emit({
			type: "bet_shipped",
			streamId: "bet:b1",
			betId: "b1",
			timestamp: 1,
		} satisfies BetShippedEvent);
	});
});
