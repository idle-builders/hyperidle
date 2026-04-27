/**
 * L8 — useSystemStability hook tests.
 *
 * Acceptance:
 * - Fetches GET /api/system/stability on mount.
 * - Polls no faster than every 30s. (Spec: "Do NOT poll faster than every 30s".)
 * - Returns sensible default (zeros) while loading.
 * - Cleans up on unmount (no leaked intervals).
 * - Tolerates fetch failure (returns zeros, sets error).
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSystemStability } from "../useSystemStability";

describe("useSystemStability (L8)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
			return new Response(
				JSON.stringify({ crashed_sessions: 1, cap_reached: 0, api_degraded: 0 }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("fetches /api/system/stability on mount and exposes the result", async () => {
		const { result } = renderHook(() => useSystemStability());
		await vi.waitFor(() => {
			expect(result.current.stability.crashed_sessions).toBe(1);
		});
		expect(globalThis.fetch).toHaveBeenCalledWith("/api/system/stability", expect.any(Object));
	});

	it("does not poll faster than every 30s", async () => {
		renderHook(() => useSystemStability());
		await vi.waitFor(() => {
			expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		});

		// Advance only 29s — must NOT trigger another fetch.
		vi.advanceTimersByTime(29_000);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);

		// Cross the 30s boundary — one more fetch.
		vi.advanceTimersByTime(2_000);
		await vi.waitFor(() => {
			expect(globalThis.fetch).toHaveBeenCalledTimes(2);
		});
	});

	it("clears the polling interval on unmount", async () => {
		const { unmount } = renderHook(() => useSystemStability());
		await vi.waitFor(() => {
			expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		});
		unmount();
		vi.advanceTimersByTime(60_000);
		// No additional fetch after unmount.
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	});

	it("returns zero stability when fetch fails", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
		const { result } = renderHook(() => useSystemStability());
		await waitFor(() => {
			expect(result.current.error).not.toBeNull();
		});
		expect(result.current.stability.crashed_sessions).toBe(0);
		expect(result.current.stability.cap_reached).toBe(0);
		expect(result.current.stability.api_degraded).toBe(0);
	});
});
