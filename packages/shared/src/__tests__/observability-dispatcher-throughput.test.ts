/**
 * H3 AC5 — Performance budget: 1000 enqueues in <100ms (non-blocking).
 *
 * The contract is that `enqueue()` stays on the hot path with no async
 * work. We do NOT measure adapter throughput — the adapter is fire-and-
 * forget. We measure the enqueue loop only.
 *
 * @lore Adversary review #1: the original test used an empty argsSummary,
 * which exercised neither the real per-event payload size nor the drop-
 * oldest path (bufferCap set to 10_000, same as the event count). The
 * tests below use a realistic ~400-byte argsSummary and a small bufferCap
 * so the ring-buffer's drop-oldest path is actually hit.
 */

import type { ObservabilityEvent } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { createObservabilityDispatcher } from "../observability/dispatcher.js";
import type { ObservabilityAdapter } from "../observability/types.js";

function quietAdapter(): ObservabilityAdapter {
	return {
		name: "console",
		record: () => Promise.resolve(),
		flush: () => Promise.resolve(),
	};
}

/** A realistic args summary: ~400 chars of JSON-shaped content. */
function realisticArgsSummary(): string {
	const filler = "a".repeat(300);
	return JSON.stringify({ path: "/workspace/src/foo.ts", glob: "*.ts", content: filler });
}

describe("dispatcher throughput — 1000 events in <100ms", () => {
	it("enqueues 1000 events in under 100ms (realistic payload)", async () => {
		const dispatcher = createObservabilityDispatcher({
			adapter: quietAdapter(),
			// Keep the background timer far away so we measure the enqueue
			// loop only, not any microtask-triggered drain.
			config: { batchSize: 10_000, flushIntervalMs: 60_000, bufferCap: 10_000 },
		});

		const now = new Date().toISOString();
		const argsSummary = realisticArgsSummary();
		const base: ObservabilityEvent = {
			kind: "tool_call",
			traceId: "trace-x",
			sessionId: "sess-x",
			ts: now,
			toolName: "Read",
			argsSummary,
		};
		const start = performance.now();
		for (let i = 0; i < 1000; i += 1) {
			dispatcher.enqueue({ ...base, toolName: `Read-${i}` });
		}
		const elapsed = performance.now() - start;
		expect(dispatcher.status().bufferDepth).toBe(1000);
		expect(elapsed).toBeLessThan(100);
		await dispatcher.dispose();
	});

	it("drop-oldest stays O(1) at buffer cap — 10k enqueues at cap=100 in <100ms", async () => {
		// This test proves the ring buffer does not degrade when the buffer
		// is saturated. Previously (`shift` + `splice`) the enqueue loop was
		// O(n) per eviction and would approach quadratic time when cap was
		// much smaller than the burst (adversary review H3 #2).
		const dispatcher = createObservabilityDispatcher({
			adapter: quietAdapter(),
			config: { batchSize: 10_000, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		const now = new Date().toISOString();
		const argsSummary = realisticArgsSummary();
		const base: ObservabilityEvent = {
			kind: "tool_call",
			traceId: "trace-x",
			sessionId: "sess-x",
			ts: now,
			toolName: "Read",
			argsSummary,
		};
		const start = performance.now();
		for (let i = 0; i < 10_000; i += 1) {
			dispatcher.enqueue({ ...base, toolName: `Read-${i}` });
		}
		const elapsed = performance.now() - start;
		expect(dispatcher.status().bufferDepth).toBe(100);
		expect(dispatcher.status().dropped).toBe(9_900);
		expect(elapsed).toBeLessThan(100);
		await dispatcher.dispose();
	});
});
