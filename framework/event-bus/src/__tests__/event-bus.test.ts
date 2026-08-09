import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture the error logger calls across tests. The EventBus (green phase)
// must wrap each handler invocation in try/catch and log via `createLogger`
// — this mock lets us assert the error surfaced without relying on
// console.error (which other tests may also hit).
const errorMock = vi.fn();
const warnMock = vi.fn();
const infoMock = vi.fn();
const debugMock = vi.fn();

// @lore AU34: the specifier is the PACKAGE, not a relative path. `logger.ts` left this package for
// `@hyperidle/diagnostics`, and a `vi.mock` of a path that no longer resolves is silently a no-op —
// vitest does not complain, the bus logs for real, and the assertion below is the only thing that
// notices. A relative `vi.mock` crossing a package boundary is the one rewrite the split's codemod
// could not see, because the string is an argument rather than an import.
vi.mock("@hyperidle/diagnostics", () => ({
	createLogger: vi.fn(() => ({
		debug: debugMock,
		info: infoMock,
		warn: warnMock,
		error: errorMock,
	})),
}));

import type {
	BetStateChangedEvent,
	DomainEvent,
	NotificationEvent,
	TaskStateChangedEvent,
} from "@hyperidle/domain-model";
import { EventBus } from "../event-bus.js";

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
		// AF8: kind is now mandatory. Tests use "attention" as the default.
		kind: "attention",
		message: `msg-${seq}`,
		timestamp: seq,
	};
}

describe("EventBus", () => {
	beforeEach(() => {
		errorMock.mockClear();
		warnMock.mockClear();
		infoMock.mockClear();
		debugMock.mockClear();
	});

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
		expect(received[0]!.type).toBe("task_state_changed");
		expect(received[1]!.type).toBe("notification");
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

		bus.on("bet_state_changed", handler);
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

		bus.on("bet_state_changed", (e) => {
			const BetId: string = e.betId;
			expect(BetId).toBeDefined();
		});

		bus.emit(makeTaskEvent("t1", 1));
		bus.emit({
			type: "bet_state_changed",
			streamId: "bet:b1",
			betId: "b1",
			fromState: "active",
			toState: "completed",
			timestamp: 1,
		} satisfies BetStateChangedEvent);
	});

	// ---------------- I1 / EventBus resilience ----------------
	// E1: a throwing handler must not block subsequent handlers on the
	// same event type. Today's EventBus aborts the iteration on the first
	// throw — this test is RED until the green phase wraps each handler in
	// try/catch.
	describe("I1 E1: throwing handler does not block subsequent handlers", () => {
		it("continues delivering to remaining type-specific subscribers when one throws", () => {
			const bus = new EventBus();
			const subsequent = vi.fn();

			bus.on("task_state_changed", () => {
				throw new Error("boom-E1");
			});
			bus.on("task_state_changed", subsequent);

			// emit must NOT throw — the bus swallows per-handler failures.
			expect(() => bus.emit(makeTaskEvent("t1", 1))).not.toThrow();
			expect(subsequent).toHaveBeenCalledTimes(1);
		});
	});

	// E2: the handler exception must be logged via `createLogger`. The
	// mock at the top of this file captures calls to `.error(...)`.
	describe("I1 E2: handler errors are logged", () => {
		it("logs via createLogger.error when a handler throws", () => {
			const bus = new EventBus();

			bus.on("task_state_changed", () => {
				throw new Error("boom-E2");
			});

			bus.emit(makeTaskEvent("t1", 1));

			expect(errorMock).toHaveBeenCalled();
			// First argument is the log message; second is the structured
			// context. We assert the error surfaced by searching the calls
			// rather than pinning to a specific message.
			const allCalls = errorMock.mock.calls.map((c) => JSON.stringify(c));
			expect(allCalls.some((s) => s.includes("boom-E2"))).toBe(true);
		});
	});

	// E3: wildcard subscribers must also isolate errors. A throwing
	// wildcard handler must not block other wildcard handlers.
	describe("I1 E3: wildcard path also isolates errors", () => {
		it("continues delivering to remaining wildcard subscribers when one throws", () => {
			const bus = new EventBus();
			const subsequent = vi.fn();

			bus.on("*", () => {
				throw new Error("boom-E3");
			});
			bus.on("*", subsequent);

			expect(() => bus.emit(makeTaskEvent("t1", 1))).not.toThrow();
			expect(subsequent).toHaveBeenCalledTimes(1);
		});

		it("a type-specific throw does not prevent wildcard delivery", () => {
			const bus = new EventBus();
			const wildcard = vi.fn();

			bus.on("task_state_changed", () => {
				throw new Error("boom-E3b");
			});
			bus.on("*", wildcard);

			expect(() => bus.emit(makeTaskEvent("t1", 1))).not.toThrow();
			expect(wildcard).toHaveBeenCalledTimes(1);
		});

		it("a wildcard throw does not prevent a second type-specific delivery", () => {
			// Cross-isolation: wildcards run after type-specific. A wildcard
			// throw must not break later wildcard handlers — covered above.
			// This case verifies that a throw in wildcard does not bubble
			// back into the emit contract.
			const bus = new EventBus();
			const laterType = vi.fn();
			const laterWild = vi.fn();

			// Type-specific fires first (insertion order), then wildcards.
			bus.on("task_state_changed", laterType);
			bus.on("*", () => {
				throw new Error("boom-E3c");
			});
			bus.on("*", laterWild);

			expect(() => bus.emit(makeTaskEvent("t1", 1))).not.toThrow();
			expect(laterType).toHaveBeenCalledTimes(1);
			expect(laterWild).toHaveBeenCalledTimes(1);
		});
	});
});
