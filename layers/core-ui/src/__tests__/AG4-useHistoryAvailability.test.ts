/**
 * AG4 — useHistoryAvailability hook (RED phase).
 *
 * Decision 2 from architecture: hybrid canGoBack/canGoForward.
 *   canGoBack  = (window.history.state?.idx ?? 0) > 0
 *   canGoForward = window.navigation?.canGoForward ?? false
 *
 * @lore RR v7 has no public canGoBack/canGoForward. We read `idx` from
 * window.history.state — an RR internal. If RR changes its state shape this
 * breaks; the popstate test below is the canary.
 */

// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHistoryAvailability } from "../hooks/useHistoryAvailability.js";

function stubHistoryState(idx: number | undefined): void {
	Object.defineProperty(window, "history", {
		writable: true,
		configurable: true,
		value: {
			...window.history,
			state: idx !== undefined ? { idx } : null,
		},
	});
}

function stubNavigationApi(canGoForward: boolean | undefined): void {
	if (canGoForward === undefined) {
		// @ts-expect-error - simulating absent Navigation API
		delete window.navigation;
	} else {
		Object.defineProperty(window, "navigation", {
			writable: true,
			configurable: true,
			value: { canGoForward },
		});
	}
}

describe("useHistoryAvailability", () => {
	let originalHistory: History;
	let originalNavigation: typeof window.navigation | undefined;

	beforeEach(() => {
		originalHistory = window.history;
		originalNavigation = window.navigation;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		Object.defineProperty(window, "history", {
			writable: true,
			configurable: true,
			value: originalHistory,
		});
		if (originalNavigation !== undefined) {
			Object.defineProperty(window, "navigation", {
				writable: true,
				configurable: true,
				value: originalNavigation,
			});
		}
	});

	describe("canGoBack", () => {
		it("returns false when history.state.idx is 0", () => {
			stubHistoryState(0);
			stubNavigationApi(false);
			const { result } = renderHook(() => useHistoryAvailability());
			expect(result.current.canGoBack).toBe(false);
		});

		it("returns false when history.state is null/undefined (deep link)", () => {
			stubHistoryState(undefined);
			stubNavigationApi(false);
			const { result } = renderHook(() => useHistoryAvailability());
			expect(result.current.canGoBack).toBe(false);
		});

		it("returns true when history.state.idx > 0", () => {
			stubHistoryState(1);
			stubNavigationApi(false);
			const { result } = renderHook(() => useHistoryAvailability());
			expect(result.current.canGoBack).toBe(true);
		});
	});

	describe("canGoForward", () => {
		it("returns true when window.navigation.canGoForward is true", () => {
			stubHistoryState(0);
			stubNavigationApi(true);
			const { result } = renderHook(() => useHistoryAvailability());
			expect(result.current.canGoForward).toBe(true);
		});

		it("returns false when window.navigation.canGoForward is false", () => {
			stubHistoryState(0);
			stubNavigationApi(false);
			const { result } = renderHook(() => useHistoryAvailability());
			expect(result.current.canGoForward).toBe(false);
		});

		it("falls back to false when window.navigation is absent", () => {
			stubHistoryState(0);
			stubNavigationApi(undefined);
			const { result } = renderHook(() => useHistoryAvailability());
			expect(result.current.canGoForward).toBe(false);
		});
	});

	describe("returns correct shape", () => {
		it("returns object with canGoBack and canGoForward", () => {
			stubHistoryState(1);
			stubNavigationApi(true);
			const { result } = renderHook(() => useHistoryAvailability());
			expect(result.current).toHaveProperty("canGoBack");
			expect(result.current).toHaveProperty("canGoForward");
		});
	});

	describe("reacts to popstate", () => {
		it("updates canGoBack when popstate fires and idx changes", () => {
			stubHistoryState(0);
			stubNavigationApi(false);
			const { result } = renderHook(() => useHistoryAvailability());
			expect(result.current.canGoBack).toBe(false);

			// Simulate navigation by updating history.state.idx then firing popstate
			stubHistoryState(2);
			act(() => {
				window.dispatchEvent(new PopStateEvent("popstate", { state: { idx: 2 } }));
			});
			expect(result.current.canGoBack).toBe(true);
		});

		it("re-reads history after a React Router push changes the location key", () => {
			stubHistoryState(0);
			stubNavigationApi(false);
			const { result, rerender } = renderHook(
				({ locationKey }) => useHistoryAvailability(locationKey),
				{ initialProps: { locationKey: "default" } },
			);
			expect(result.current.canGoBack).toBe(false);
			stubHistoryState(1);
			rerender({ locationKey: "pushed" });
			expect(result.current.canGoBack).toBe(true);
		});
	});
});
