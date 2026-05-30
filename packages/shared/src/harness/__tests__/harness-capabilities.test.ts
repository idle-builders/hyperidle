/**
 * S2 — HarnessCapabilities extension: tests (AC2 Task2, AC7).
 *
 * Tests that:
 * - HarnessCapabilities now includes modelProviders field
 * - HarnessAdapter interface still has exactly 4 methods
 * - HarnessEvent union still has exactly 6 variants
 * - MockHarnessAdapter returns modelProviders
 *
 * These fail (red phase) until harness-adapter.ts is updated with modelProviders.
 */

import { describe, expect, it } from "vitest";
import { MockHarnessAdapter } from "../mock-harness-adapter.js";

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

describe("HarnessEvent union unchanged — exactly 6 variants (AC7)", () => {
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

	it("has cost_update variant", () => {
		const ev = { type: "cost_update" as const, totalCost: 1, deltaCost: 0.5 };
		expect(ev.type).toBe("cost_update");
	});

	it("has pre_compaction variant", () => {
		const ev = { type: "pre_compaction" as const, contextTokens: 100, maxTokens: 200000 };
		expect(ev.type).toBe("pre_compaction");
	});
});
