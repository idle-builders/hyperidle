/**
 * Increment 7, Wave B (Decision E) — RED phase.
 *
 * architecture.md §6 Decision E / §9 Increment 7: "Today's `SessionActivityBuffer`
 * lives in `agent-orchestration/run-orchestration/src/session-activity-buffer.ts`
 * — the wrong home for the buffer under this model... exposed to the UI via
 * `AgentOrchestrationPort` as the gateway door." The buffer itself belongs to
 * `agent-execution` (where tokens/tool-calls originate) — it imports only
 * `@hyperidle/shared` types and touches no DB/Drizzle, so it carries no
 * persistence concern into a Layer that must stay thin (Mechanism B).
 *
 * `../session-activity-buffer.js` does not exist yet in this package — the
 * module resolution failure below is this file's primary RED signal, mirroring
 * `agent-orchestration-port.integration.test.ts`'s own RED-phase framing.
 * This suite is a straight behavioral port of the existing
 * `layers/agent-orchestration/run-orchestration/src/__tests__/session-activity-buffer.test.ts`
 * — same assertions, new home — proving the relocation changes ownership, not
 * behavior. The old file is deleted in the GREEN phase that physically moves
 * the class.
 */

import type { ActivityEntry, ToolCallRecordedEvent } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// NOT YET CREATED — this import failing to resolve is this file's primary RED signal.
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

describe("SessionActivityBuffer (agent-execution home)", () => {
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

	it("stores tool_call_recorded entries for the correct session", () => {
		bus.emit(mkToolCallEvent({ sessionId: "sess-1", toolName: "bash" }));
		bus.emit(mkToolCallEvent({ sessionId: "sess-1", toolName: "read_file" }));

		const entries = buffer.getActivity("sess-1");
		expect(entries).toHaveLength(2);
		expect(entries[0]!.type).toBe("tool_call");
		expect((entries[0]!.data as ToolCallData).toolName).toBe("bash");
		expect((entries[1]!.data as ToolCallData).toolName).toBe("read_file");
	});

	it("isolates entries per session id", () => {
		bus.emit(mkToolCallEvent({ sessionId: "sess-1" }));
		bus.emit(mkToolCallEvent({ sessionId: "sess-2", toolName: "write_file" }));

		expect(buffer.getActivity("sess-1")).toHaveLength(1);
		expect(buffer.getActivity("sess-2")).toHaveLength(1);
		expect((buffer.getActivity("sess-2")[0]!.data as ToolCallData).toolName).toBe("write_file");
	});

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
		expect(entries.length).toBeLessThanOrEqual(100);
		const toolNames = entries.map((e) => (e.data as ToolCallData).toolName);
		expect(toolNames).not.toContain("tool_0");
		expect(toolNames).not.toContain("tool_4");
		expect(toolNames).toContain("tool_104");
	});

	it("returns empty array for unknown session id", () => {
		const entries = buffer.getActivity("unknown-session");
		expect(entries).toEqual([]);
	});

	it("entries include timestamp from the event", () => {
		const ts = 1718000000000;
		bus.emit(mkToolCallEvent({ sessionId: "sess-ts", timestamp: ts }));

		const entries = buffer.getActivity("sess-ts");
		expect(entries[0]!.timestamp).toBe(ts);
	});

	it("stops collecting after stop()", () => {
		bus.emit(mkToolCallEvent({ sessionId: "sess-stop" }));
		buffer.stop();
		bus.emit(mkToolCallEvent({ sessionId: "sess-stop", toolName: "after_stop" }));

		const entries = buffer.getActivity("sess-stop");
		expect(entries).toHaveLength(1);
		expect((entries[0]!.data as ToolCallData).toolName).not.toBe("after_stop");
	});

	it("re-subscribes when start() is called after stop()", () => {
		buffer.stop();
		buffer.start();
		bus.emit(mkToolCallEvent({ sessionId: "sess-restart" }));

		expect(buffer.getActivity("sess-restart")).toHaveLength(1);
	});

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
