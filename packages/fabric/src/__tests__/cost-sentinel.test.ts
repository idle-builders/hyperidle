/**
 * AD8c — Cost Sentinel: unit tests for the extracted cost-sentinel module.
 *
 * AC4: cost-sentinel is application code (scheduled job), not an agent routine.
 * W3 (critique): verify startCostSentinel actually registers an interval.
 *
 * Tests call the module directly — no DB needed for the scheduling tests.
 * The threshold/event-emission tests live in
 * packages/server/src/__tests__/builtin-routines.integration.test.ts
 * (calling runCostSentinelCheck directly with a DB fixture).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearCostSentinelCache,
	COST_SENTINEL_INTERVAL_MS,
	startCostSentinel,
} from "../services/cost-sentinel.js";

// ---------------------------------------------------------------------------
// COST_SENTINEL_INTERVAL_MS constant
// ---------------------------------------------------------------------------

describe("COST_SENTINEL_INTERVAL_MS", () => {
	it("is 900_000 (15 minutes in milliseconds)", () => {
		expect(COST_SENTINEL_INTERVAL_MS).toBe(900_000);
	});
});

// ---------------------------------------------------------------------------
// startCostSentinel — W3: verify interval is registered
// ---------------------------------------------------------------------------

describe("startCostSentinel", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		clearCostSentinelCache();
	});

	afterEach(() => {
		vi.useRealTimers();
		clearCostSentinelCache();
	});

	it("returns a cleanup function", () => {
		// Minimal stubs — startCostSentinel only needs db and eventBus references
		// to pass to runCostSentinelCheck; the interval fires asynchronously.
		const mockDb = {} as Parameters<typeof startCostSentinel>[0];
		const mockEventBus = {} as Parameters<typeof startCostSentinel>[1];

		const cleanup = startCostSentinel(mockDb, mockEventBus);
		expect(typeof cleanup).toBe("function");
		cleanup();
	});

	it("calls setInterval with COST_SENTINEL_INTERVAL_MS", () => {
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const mockDb = {} as Parameters<typeof startCostSentinel>[0];
		const mockEventBus = {} as Parameters<typeof startCostSentinel>[1];

		const cleanup = startCostSentinel(mockDb, mockEventBus);

		expect(setIntervalSpy).toHaveBeenCalledOnce();
		const [, delay] = setIntervalSpy.mock.calls[0] as [unknown, number];
		expect(delay).toBe(COST_SENTINEL_INTERVAL_MS);

		cleanup();
		setIntervalSpy.mockRestore();
	});

	it("cleanup calls clearInterval (interval is cancelled on cleanup)", () => {
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
		const mockDb = {} as Parameters<typeof startCostSentinel>[0];
		const mockEventBus = {} as Parameters<typeof startCostSentinel>[1];

		const cleanup = startCostSentinel(mockDb, mockEventBus);
		cleanup();

		expect(clearIntervalSpy).toHaveBeenCalledOnce();
		clearIntervalSpy.mockRestore();
	});

	it("calling cleanup twice does not throw", () => {
		const mockDb = {} as Parameters<typeof startCostSentinel>[0];
		const mockEventBus = {} as Parameters<typeof startCostSentinel>[1];

		const cleanup = startCostSentinel(mockDb, mockEventBus);
		expect(() => {
			cleanup();
			cleanup();
		}).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// clearCostSentinelCache — exported from new module
// ---------------------------------------------------------------------------

describe("clearCostSentinelCache", () => {
	it("is a function and does not throw", () => {
		expect(typeof clearCostSentinelCache).toBe("function");
		expect(() => clearCostSentinelCache()).not.toThrow();
	});
});
