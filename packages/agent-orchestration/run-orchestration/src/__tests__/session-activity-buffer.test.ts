/**
 * Q1 — AC6 / AC10: SessionActivityBuffer ring buffer.
 *
 * Architecture plan §6.1: in-memory ring buffer (max 100 per session),
 * populated by tool_call_recorded events from the EventBus.
 *
 * @lore AU20 B2c: moved from `@hyperidle/capture-writeback` into
 * `@hyperidle/run-orchestration`.
 */

import type { ActivityEntry, ToolCallRecordedEvent } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionActivityBuffer } from "../session-activity-buffer.js";

type ToolCallData = Extract<ActivityEntry, { type: "tool_call" }>["data"];

function mkToolCallEvent(overrides?: Partial<ToolCallRecordedEvent>): ToolCallRecordedEvent {
	return {
		type: "tool_call_recorded",
		streamId: overrides?.sessionId ?? "sess-1",
		sessionId: overrides?.sessionId ?? "sess-1",
		toolName: overrides?.toolName ?? "bash",
		argsSummary: overrides?.argsSummary ?? 'cmd="ls -la"',
		timestamp: overrides?.timestamp ?? Date.now(),
	};
}

describe("SessionActivityBuffer (Q1 §6.1)", () => {
	let bus: EventBus;
	let buffer: SessionActivityBuffer;

	beforeEach(() => {
		bus = new EventBus();
		buffer = new SessionActivityBuffer(bus);
		buffer.start();
	});

	afterEach(() => {
		buffer.stop();
	});

	// AC6: buffer stores tool_call_recorded entries per session
	it("stores tool_call_recorded entries for the correct session", () => {
		bus.emit(mkToolCallEvent({ sessionId: "sess-1", toolName: "bash" }));
		bus.emit(mkToolCallEvent({ sessionId: "sess-1", toolName: "read_file" }));

		const entries = buffer.getActivity("sess-1");
		expect(entries).toHaveLength(2);
		expect(entries[0]!.type).toBe("tool_call");
		expect((entries[0]!.data as ToolCallData).toolName).toBe("bash");
		expect((entries[1]!.data as ToolCallData).toolName).toBe("read_file");
	});

	// Isolation: events for different sessions do not bleed across
	it("isolates entries per session id", () => {
		bus.emit(mkToolCallEvent({ sessionId: "sess-1" }));
		bus.emit(mkToolCallEvent({ sessionId: "sess-2", toolName: "write_file" }));

		expect(buffer.getActivity("sess-1")).toHaveLength(1);
		expect(buffer.getActivity("sess-2")).toHaveLength(1);
		expect((buffer.getActivity("sess-2")[0]!.data as ToolCallData).toolName).toBe("write_file");
	});

	// Eviction: ring buffer caps at 100 entries per session (FIFO)
	it("evicts oldest entries when buffer exceeds maxPerSession (100)", () => {
		for (let i = 0; i < 105; i++) {
			bus.emit(
				mkToolCallEvent({
					sessionId: "sess-evict",
					toolName: `tool_${i}`,
					timestamp: i,
				}),
			);
		}
		const entries = buffer.getActivity("sess-evict");
		// Should have max 100 entries
		expect(entries.length).toBeLessThanOrEqual(100);
		// Oldest entries (tool_0 through tool_4) should be evicted
		const toolNames = entries.map((e) => (e.data as ToolCallData).toolName);
		expect(toolNames).not.toContain("tool_0");
		expect(toolNames).not.toContain("tool_4");
		// Most recent entry should be present
		expect(toolNames).toContain("tool_104");
	});

	// Unknown session returns empty array
	it("returns empty array for unknown session id", () => {
		const entries = buffer.getActivity("unknown-session");
		expect(entries).toEqual([]);
	});

	// Entries have correct discriminated shape
	it("entries include timestamp from the event", () => {
		const ts = 1718000000000;
		bus.emit(mkToolCallEvent({ sessionId: "sess-ts", timestamp: ts }));

		const entries = buffer.getActivity("sess-ts");
		expect(entries[0]!.timestamp).toBe(ts);
	});

	// stop() halts event collection
	it("stops collecting after stop()", () => {
		bus.emit(mkToolCallEvent({ sessionId: "sess-stop" }));
		buffer.stop();
		bus.emit(mkToolCallEvent({ sessionId: "sess-stop", toolName: "after_stop" }));

		const entries = buffer.getActivity("sess-stop");
		expect(entries).toHaveLength(1);
		// Second event (emitted after stop) should not be present
		expect((entries[0]!.data as ToolCallData).toolName).not.toBe("after_stop");
	});

	// start() can be called after stop() to re-subscribe
	it("re-subscribes when start() is called after stop()", () => {
		buffer.stop();
		buffer.start();
		bus.emit(mkToolCallEvent({ sessionId: "sess-restart" }));

		expect(buffer.getActivity("sess-restart")).toHaveLength(1);
	});

	// getActivity returns a readonly copy — mutation should not affect internal state
	it("getActivity returns items in insertion order (oldest first)", () => {
		bus.emit(mkToolCallEvent({ sessionId: "sess-order", toolName: "first", timestamp: 100 }));
		bus.emit(mkToolCallEvent({ sessionId: "sess-order", toolName: "second", timestamp: 200 }));
		bus.emit(mkToolCallEvent({ sessionId: "sess-order", toolName: "third", timestamp: 300 }));

		const entries = buffer.getActivity("sess-order");
		expect((entries[0]!.data as ToolCallData).toolName).toBe("first");
		expect((entries[1]!.data as ToolCallData).toolName).toBe("second");
		expect((entries[2]!.data as ToolCallData).toolName).toBe("third");
	});

	it("returns a defensive snapshot that cannot mutate buffered activity", () => {
		bus.emit(mkToolCallEvent({ sessionId: "sess-copy", toolName: "original" }));
		const snapshot = buffer.getActivity("sess-copy");
		Reflect.set(snapshot, "length", 0);

		expect(buffer.getActivity("sess-copy")).toHaveLength(1);
		expect((buffer.getActivity("sess-copy")[0]!.data as ToolCallData).toolName).toBe("original");
	});

	it("keeps the final snapshot for five minutes, then evicts it", () => {
		vi.useFakeTimers();
		try {
			bus.emit(mkToolCallEvent({ sessionId: "sess-ended", toolName: "final" }));
			bus.emit({
				type: "session_ended",
				streamId: "session:sess-ended",
				sessionId: "sess-ended",
				agentId: "agent-ended",
				taskId: null,
				outcome: "completed",
				timestamp: Date.now(),
			});

			vi.advanceTimersByTime(5 * 60 * 1_000 - 1);
			expect(buffer.getActivity("sess-ended")).toHaveLength(1);
			vi.advanceTimersByTime(1);
			expect(buffer.getActivity("sess-ended")).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});
});
