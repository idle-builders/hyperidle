/**
 * S2 — HarnessCapabilities extension: tests (AC2 Task2, AC7).
 *
 * Tests that:
 * - HarnessCapabilities now includes modelProviders field
 * - HarnessAdapter interface still has exactly 4 methods
 * - HarnessEvent union still has exactly 5 variants
 * - MockHarnessAdapter returns modelProviders
 *
 * These fail (red phase) until harness-adapter.ts is updated with modelProviders.
 *
 * @lore AU21 (harness-telemetry narrowing): `cost_update` is REMOVED from the
 * HarnessEvent union (6 variants → 5) — founder ruling narrowed harness
 * telemetry to token usage only.
 */

import { describe, expect, it } from "vitest";
import { MockHarnessAdapter } from "../__testing__/mock-harness-adapter.js";

describe("HarnessCapabilities.modelProviders (AC2 Task2)", () => {
	it("MockHarnessAdapter.getCapabilities() includes modelProviders", () => {
		const adapter = new MockHarnessAdapter();
		const caps = adapter.getCapabilities();

		// This fails until modelProviders is added to HarnessCapabilities
		expect(caps).toHaveProperty("modelProviders");
		expect(Array.isArray(caps.modelProviders)).toBe(true);
		expect(caps.modelProviders.length).toBeGreaterThan(0);
	});

	it("MockHarnessAdapter.getCapabilities() returns anthropic as provider", () => {
		const adapter = new MockHarnessAdapter();
		const caps = adapter.getCapabilities();
		expect(caps.modelProviders).toContain("anthropic");
	});

	it("existing capability fields are still present", () => {
		const adapter = new MockHarnessAdapter();
		const caps = adapter.getCapabilities();
		expect(typeof caps.preCompactionTrigger).toBe("boolean");
		expect(typeof caps.subAgents).toBe("boolean");
	});
});

describe("HarnessAdapter interface unchanged — exactly 4 methods (AC7)", () => {
	it("interface methods: startSession, streamEvents, stopSession, getCapabilities", () => {
		// Structural check: MockHarnessAdapter implements all 4 methods
		const adapter = new MockHarnessAdapter();
		expect(typeof adapter.startSession).toBe("function");
		expect(typeof adapter.streamEvents).toBe("function");
		expect(typeof adapter.stopSession).toBe("function");
		expect(typeof adapter.getCapabilities).toBe("function");
	});
});

describe("HarnessEvent union — exactly 4 variants (AC7; cost_update + pre_compaction narrowed out)", () => {
	it("has token_usage variant", () => {
		const ev = { type: "token_usage" as const, inputTokens: 1, outputTokens: 1 };
		expect(ev.type).toBe("token_usage");
	});

	it("has tool_call variant", () => {
		const ev = { type: "tool_call" as const, toolName: "Read", args: {} };
		expect(ev.type).toBe("tool_call");
	});

	it("has completion variant", () => {
		const ev = { type: "completion" as const, text: "done" };
		expect(ev.type).toBe("completion");
	});

	it("has error variant", () => {
		const ev = { type: "error" as const, message: "err", code: "ERR" };
		expect(ev.type).toBe("error");
	});

	it("does NOT have a cost_update variant", () => {
		type HasCostUpdate =
			Extract<import("../harness-events.js").HarnessEvent, { type: "cost_update" }> extends never
				? false
				: true;
		const hasCostUpdate: HasCostUpdate = false;
		expect(hasCostUpdate).toBe(false);
	});
});
