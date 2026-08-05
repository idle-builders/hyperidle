/**
 * Unit tests for useTheme — K3 theme persistence.
 *
 * Covers:
 *   - Initial read from localStorage with default "system" on missing/unknown.
 *   - setTheme persists, applies data-theme, updates resolvedTheme.
 *   - matchMedia subscription updates resolvedTheme when system mode flips.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInitialTheme, useTheme } from "../useTheme";

const STORAGE_KEY = "hyperidle-theme";

interface MockMediaQueryList {
	matches: boolean;
	media: string;
	onchange: null;
	addEventListener: (type: string, cb: (e: MediaQueryListEvent) => void) => void;
	removeEventListener: (type: string, cb: (e: MediaQueryListEvent) => void) => void;
	addListener: () => void;
	removeListener: () => void;
	dispatchEvent: () => boolean;
	listeners: Array<(e: MediaQueryListEvent) => void>;
}

function installMatchMedia(prefersDark: boolean): MockMediaQueryList {
	const mql: MockMediaQueryList = {
		matches: prefersDark,
		media: "(prefers-color-scheme: dark)",
		onchange: null,
		listeners: [],
		addEventListener(_type, cb) {
			this.listeners.push(cb);
		},
		removeEventListener(_type, cb) {
			this.listeners = this.listeners.filter((fn) => fn !== cb);
		},
		addListener() {
			/* legacy noop */
		},
		removeListener() {
			/* legacy noop */
		},
		dispatchEvent() {
			return false;
		},
	};
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: vi.fn().mockReturnValue(mql),
	});
	return mql;
}

describe("useTheme", () => {
	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.removeAttribute("data-theme");
	});

	afterEach(() => {
		window.localStorage.clear();
		document.documentElement.removeAttribute("data-theme");
	});

	describe("getInitialTheme", () => {
		it("returns 'system' when localStorage is empty", () => {
			expect(getInitialTheme()).toBe("system");
		});

		it("returns the stored value when valid", () => {
			window.localStorage.setItem(STORAGE_KEY, "dark");
			expect(getInitialTheme()).toBe("dark");
			window.localStorage.setItem(STORAGE_KEY, "light");
			expect(getInitialTheme()).toBe("light");
			window.localStorage.setItem(STORAGE_KEY, "system");
			expect(getInitialTheme()).toBe("system");
		});

		it("falls back to 'system' for unknown values", () => {
			window.localStorage.setItem(STORAGE_KEY, "midnight");
			expect(getInitialTheme()).toBe("system");
		});
	});

	describe("hook behavior", () => {
		it("reads initial theme from localStorage", () => {
			installMatchMedia(false);
			window.localStorage.setItem(STORAGE_KEY, "dark");
			const { result } = renderHook(() => useTheme());
			expect(result.current.theme).toBe("dark");
			expect(result.current.resolvedTheme).toBe("dark");
		});

		it("defaults to 'system' on missing value and resolves via matchMedia", () => {
			installMatchMedia(true); // OS prefers dark
			const { result } = renderHook(() => useTheme());
			expect(result.current.theme).toBe("system");
			expect(result.current.resolvedTheme).toBe("dark");
			expect(document.documentElement.dataset.theme).toBe("hearth-dark");
		});

		it("treats unknown stored value as 'system'", () => {
			installMatchMedia(false); // OS prefers light
			window.localStorage.setItem(STORAGE_KEY, "midnight");
			const { result } = renderHook(() => useTheme());
			expect(result.current.theme).toBe("system");
			expect(result.current.resolvedTheme).toBe("light");
		});

		it("setTheme persists, applies data-theme, and updates resolvedTheme", () => {
			installMatchMedia(false);
			const { result } = renderHook(() => useTheme());

			act(() => {
				result.current.setTheme("dark");
			});

			expect(result.current.theme).toBe("dark");
			expect(result.current.resolvedTheme).toBe("dark");
			expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
			expect(document.documentElement.dataset.theme).toBe("hearth-dark");

			act(() => {
				result.current.setTheme("light");
			});
			expect(result.current.resolvedTheme).toBe("light");
			expect(document.documentElement.dataset.theme).toBe("hearth-light");
			expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light");
		});

		it("matchMedia subscription updates resolvedTheme when system mode flips", () => {
			const mql = installMatchMedia(false); // start light
			const { result } = renderHook(() => useTheme());
			expect(result.current.theme).toBe("system");
			expect(result.current.resolvedTheme).toBe("light");

			// Simulate OS flipping to dark.
			act(() => {
				mql.matches = true;
				for (const cb of mql.listeners) {
					cb({ matches: true } as MediaQueryListEvent);
				}
			});

			expect(result.current.resolvedTheme).toBe("dark");
			expect(document.documentElement.dataset.theme).toBe("hearth-dark");
		});

		it("does NOT update resolvedTheme via matchMedia when theme is explicit", () => {
			const mql = installMatchMedia(false);
			window.localStorage.setItem(STORAGE_KEY, "light");
			const { result } = renderHook(() => useTheme());
			expect(result.current.resolvedTheme).toBe("light");

			act(() => {
				mql.matches = true;
				for (const cb of mql.listeners) {
					cb({ matches: true } as MediaQueryListEvent);
				}
			});

			// Explicit light overrides OS — must remain light.
			expect(result.current.resolvedTheme).toBe("light");
			expect(document.documentElement.dataset.theme).toBe("hearth-light");
		});

		it("cleans up matchMedia subscription on unmount", () => {
			const mql = installMatchMedia(false);
			const { unmount } = renderHook(() => useTheme());
			expect(mql.listeners.length).toBeGreaterThan(0);
			unmount();
			expect(mql.listeners.length).toBe(0);
		});
	});
});
