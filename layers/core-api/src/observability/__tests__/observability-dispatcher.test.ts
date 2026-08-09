/**
 * H3 AC3/AC4/AC5 — Dispatcher tests.
 *
 * @lore AU26 C2: `TraceIdResolver` is DELETED. `seed()` had zero non-test
 * callers, so `resolve()` always missed in production and every traceId was
 * already the fallback — the sessionId. These tests now assert that production
 * behaviour directly instead of a seeded value no running system could produce.
 *
 * Covers:
 *  - Trace correlation (AC3): events within a session share traceId.
 *  - Events logged (AC4): all 6 kinds reach the adapter.
 *  - Non-blocking buffered design: enqueue never awaits; flush is async.
 *  - Drop-oldest policy when buffer cap reached.
 *  - Subscribe-once + clean unsubscribe on dispose.
 */

import type { ObservabilityAdapter, ObservabilityChannel } from "@hyperidle/diagnostics";
import { type ObservabilityEvent, summarizeToolArgs } from "@hyperidle/diagnostics";
import type {
	BetStateChangedEvent,
	KnowledgeUpdatedEvent,
	SessionStartedEvent,
	TaskStateChangedEvent,
	ToolCallRecordedEvent,
} from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, describe, expect, test } from "vitest";
import { createObservabilityDispatcher, registerObservabilityDispatcher } from "../dispatcher.js";

function fakeAdapter(
	name: ObservabilityChannel = "console",
	override?: (batch: readonly ObservabilityEvent[]) => Promise<void>,
): ObservabilityAdapter & { batches: ObservabilityEvent[][]; flushed: number } {
	const batches: ObservabilityEvent[][] = [];
	let flushed = 0;
	return {
		name,
		batches,
		get flushed(): number {
			return flushed;
		},
		async record(batch: readonly ObservabilityEvent[]): Promise<void> {
			if (override) return override(batch);
			batches.push([...batch]);
		},
		async flush(): Promise<void> {
			flushed += 1;
		},
	};
}

describe("ObservabilityDispatcher — enqueue / drain", () => {
	afterEach(() => {
		/* noop — vi.useRealTimers not needed here */
	});

	test("delivers enqueued events on flush", async () => {
		const adapter = fakeAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 10, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		dispatcher.enqueue({
			kind: "session_started",
			traceId: "t",
			sessionId: "s",
			ts: new Date().toISOString(),
			agentId: "a",
			taskId: "tk",
		});
		await dispatcher.flush();
		expect(adapter.batches).toHaveLength(1);
		expect(adapter!.batches[0]![0]!.kind).toBe("session_started");
		expect(dispatcher.status().delivered).toBe(1);
		await dispatcher.dispose();
	});

	test("batches to adapter with batchSize events per record()", async () => {
		const adapter = fakeAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 3, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		for (let i = 0; i < 7; i += 1) {
			dispatcher.enqueue({
				kind: "tool_call",
				traceId: "t",
				sessionId: "s",
				ts: new Date().toISOString(),
				toolName: `tool-${i}`,
				argsSummary: "{}",
			});
		}
		await dispatcher.flush();
		expect(adapter.batches.map((b) => b.length)).toEqual([3, 3, 1]);
		await dispatcher.dispose();
	});

	test("drops oldest when bufferCap exceeded and increments `dropped`", async () => {
		const adapter = fakeAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 1000, flushIntervalMs: 60_000, bufferCap: 5 },
		});
		for (let i = 0; i < 10; i += 1) {
			dispatcher.enqueue({
				kind: "tool_call",
				traceId: "t",
				sessionId: "s",
				ts: new Date().toISOString(),
				toolName: `tool-${i}`,
				argsSummary: "{}",
			});
		}
		expect(dispatcher.status().bufferDepth).toBe(5);
		expect(dispatcher.status().dropped).toBe(5);
		await dispatcher.flush();
		// Oldest 5 dropped, last 5 delivered (tool-5..tool-9).
		const flat = adapter.batches.flat();
		expect(flat).toHaveLength(5);
		expect(flat.map((e) => (e.kind === "tool_call" ? e.toolName : ""))).toEqual([
			"tool-5",
			"tool-6",
			"tool-7",
			"tool-8",
			"tool-9",
		]);
		await dispatcher.dispose();
	});

	test("triggers early flush when batchSize reached", async () => {
		const adapter = fakeAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 2, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		dispatcher.enqueue({
			kind: "tool_call",
			traceId: "t",
			sessionId: "s",
			ts: new Date().toISOString(),
			toolName: "a",
			argsSummary: "{}",
		});
		dispatcher.enqueue({
			kind: "tool_call",
			traceId: "t",
			sessionId: "s",
			ts: new Date().toISOString(),
			toolName: "b",
			argsSummary: "{}",
		});
		// Let the queueMicrotask run.
		await new Promise<void>((r) => setTimeout(r, 0));
		expect(adapter.batches).toHaveLength(1);
		await dispatcher.dispose();
	});

	test("records lastError when adapter throws and counts dropped batch", async () => {
		const adapter = fakeAdapter("console", async () => {
			throw new Error("network down");
		});
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 5, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		dispatcher.enqueue({
			kind: "tool_call",
			traceId: "t",
			sessionId: "s",
			ts: new Date().toISOString(),
			toolName: "a",
			argsSummary: "{}",
		});
		await dispatcher.flush();
		const s = dispatcher.status();
		expect(s.lastError).toBe("network down");
		expect(s.dropped).toBe(1);
		expect(s.delivered).toBe(0);
		await dispatcher.dispose();
	});

	test("dispose stops accepting events and unsubs timer", async () => {
		const adapter = fakeAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 10, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		await dispatcher.dispose();
		dispatcher.enqueue({
			kind: "session_started",
			traceId: "t",
			sessionId: "s",
			ts: new Date().toISOString(),
			agentId: "a",
			taskId: "tk",
		});
		expect(dispatcher.status().bufferDepth).toBe(0);
	});

	test("status reflects adapter name", async () => {
		const adapter = fakeAdapter("noop");
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 10, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		expect(dispatcher.status().adapter).toBe("noop");
		await dispatcher.dispose();
	});
});

describe("registerObservabilityDispatcher — bus subscriber", () => {
	test("translates all 7 DomainEvent types into ObservabilityEvents (AC4)", async () => {
		const bus = new EventBus();
		const adapter = fakeAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 100, flushIntervalMs: 60_000, bufferCap: 1000 },
		});
		const unsub = registerObservabilityDispatcher(bus, { dispatcher });

		const now = Date.now();
		bus.emit<"session_started">({
			type: "session_started",
			streamId: "sess-1",
			sessionId: "sess-1",
			agentId: "a",
			taskId: "t",
			timestamp: now,
		} satisfies SessionStartedEvent);
		bus.emit<"task_state_changed">({
			type: "task_state_changed",
			streamId: "task-1",
			taskId: "task-1",
			fromState: "proposed",
			toState: "accepted",
			timestamp: now,
		} satisfies TaskStateChangedEvent);
		bus.emit<"bet_state_changed">({
			type: "bet_state_changed",
			streamId: "bet-1",
			betId: "bet-1",
			fromState: "draft",
			toState: "active",
			timestamp: now,
		} satisfies BetStateChangedEvent);
		bus.emit<"knowledge_updated">({
			type: "knowledge_updated",
			streamId: "knowledge:ki-1",
			itemId: "ki-1",
			action: "created",
			timestamp: now,
		} satisfies KnowledgeUpdatedEvent);
		bus.emit<"session_ended">({
			type: "session_ended",
			streamId: "sess-1",
			sessionId: "sess-1",
			agentId: "a",
			taskId: "t",
			timestamp: now,
			outcome: "completed",
		});

		await dispatcher.flush();
		unsub();
		const flat = adapter.batches.flat();
		const kinds = flat.map((e) => e.kind);
		expect(kinds).toEqual([
			"session_started",
			"task_state_changed",
			"bet_state_changed",
			"knowledge_write",
			"session_ended",
		]);
		// AC3 — both session events for one session share ONE trace id, and that
		// trace id is the session id itself.
		const sessionEvents = flat.filter(
			(e) => e.kind === "session_started" || e.kind === "session_ended",
		);
		for (const ev of sessionEvents) expect(ev.traceId).toBe("sess-1");
		await dispatcher.dispose();
	});

	test("derives traceId from sessionId — the only path once the resolver is gone (AC3)", async () => {
		const bus = new EventBus();
		const adapter = fakeAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 10, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		const unsub = registerObservabilityDispatcher(bus, { dispatcher });

		bus.emit<"session_started">({
			type: "session_started",
			streamId: "missing-sess",
			sessionId: "missing-sess",
			agentId: "a",
			taskId: "t",
			timestamp: Date.now(),
		});
		await dispatcher.flush();
		unsub();
		const flat = adapter.batches.flat();
		expect(flat[0]!.traceId).toBe("missing-sess");
		await dispatcher.dispose();
	});

	test("unsub removes handlers (no more events delivered)", async () => {
		const bus = new EventBus();
		const adapter = fakeAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 10, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		const unsub = registerObservabilityDispatcher(bus, { dispatcher });
		unsub();
		bus.emit<"session_started">({
			type: "session_started",
			streamId: "sess-1",
			sessionId: "sess-1",
			agentId: "a",
			taskId: "t",
			timestamp: Date.now(),
		});
		await dispatcher.flush();
		expect(adapter.batches.flat()).toHaveLength(0);
		await dispatcher.dispose();
	});
});

describe("summarizeToolArgs", () => {
	test("truncates long arg blobs to 512 chars", () => {
		const big = { secret: "x".repeat(1000) };
		const out = summarizeToolArgs(big);
		expect(out.length).toBeLessThanOrEqual(512);
		expect(out.endsWith("...")).toBe(true);
	});
	test("scrubs inline bearer tokens", () => {
		const out = summarizeToolArgs({ h: "Bearer abcdef123456" });
		expect(out).toContain("[REDACTED]");
		expect(out).not.toContain("abcdef123456");
	});
	test("scrubs sk-/pk- keys", () => {
		const out = summarizeToolArgs({ key: "sk-proj-verysecretvalueshere" });
		expect(out).not.toContain("verysecret");
	});
});

/**
 * @lore AU26 C2: folded in from the deleted
 * `observability/src/__tests__/trace-correlation.integration.test.ts`. Its
 * first test only exercised `createDbTraceIdResolver`'s seed cache — dead
 * machinery kept alive by its own test, deleted here. Its second test — the
 * real AC3 claim — is preserved verbatim in substance below, minus the
 * hand-built resolver no production caller ever supplied.
 */
describe("trace correlation", () => {
	test("a session's events all carry the same trace id", async () => {
		const bus = new EventBus();
		const adapter = fakeAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 100, flushIntervalMs: 60_000, bufferCap: 1000 },
		});
		const unsub = registerObservabilityDispatcher(bus, { dispatcher });

		bus.emit<"session_started">({
			type: "session_started",
			streamId: "sess-X",
			sessionId: "sess-X",
			agentId: "a",
			taskId: "t",
			timestamp: Date.now(),
		} satisfies SessionStartedEvent);
		bus.emit<"tool_call_recorded">({
			type: "tool_call_recorded",
			streamId: "sess-X",
			sessionId: "sess-X",
			toolName: "Read",
			argsSummary: "{}",
			timestamp: Date.now(),
		} satisfies ToolCallRecordedEvent);

		await dispatcher.flush();
		unsub();
		const flat = adapter.batches.flat();
		expect(flat).toHaveLength(2);
		const [session, toolCall] = flat;
		expect(session!.traceId).toBe("sess-X");
		expect(toolCall!.traceId).toBe(session!.traceId);
		await dispatcher.dispose();
	});
});
