import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveDensity, useAutoDensity } from "../hooks/useAutoDensity";

/**
 * K7 acceptance: "Given a viewport at the K1-specified mobile breakpoint,
 * when the page loads with no user override, then `[data-density]`
 * resolves to the K1-recommended mobile preset" + "Given a user has
 * explicitly set density in Settings, when the viewport changes to the
 * mobile breakpoint, then the user's choice still wins".
 *
 * Driven by AESTHETICS.md § Mobile & Touch rows "Auto-density behavior"
 * and "Density preference state".
 */

function setViewportWidth(width: number): void {
	Object.defineProperty(window, "innerWidth", {
		writable: true,
		configurable: true,
		value: width,
	});
	window.dispatchEvent(new Event("resize"));
}

const originalWidth = window.innerWidth;

describe("resolveDensity (pure)", () => {
	it("returns the explicit value when preference is `default`", () => {
		expect(resolveDensity("default", false)).toBe("default");
		expect(resolveDensity("default", true)).toBe("default");
	});

	it("returns the explicit value when preference is `compact` regardless of viewport", () => {
		expect(resolveDensity("compact", false)).toBe("compact");
		expect(resolveDensity("compact", true)).toBe("compact");
	});

	it("returns the explicit value when preference is `comfortable` regardless of viewport", () => {
		expect(resolveDensity("comfortable", false)).toBe("comfortable");
		expect(resolveDensity("comfortable", true)).toBe("comfortable");
	});

	it("auto + desktop viewport → `default`", () => {
		expect(resolveDensity("auto", false)).toBe("default");
	});

	it("auto + mobile viewport → `comfortable` (per AESTHETICS.md mobile rule)", () => {
		expect(resolveDensity("auto", true)).toBe("comfortable");
	});
});

describe("useAutoDensity", () => {
	beforeEach(() => {
		setViewportWidth(1920);
	});

	afterEach(() => {
		setViewportWidth(originalWidth);
	});

	it("at desktop viewport (1920px) with `auto` preference resolves to `default`", () => {
		setViewportWidth(1920);
		const { result } = renderHook(() => useAutoDensity("auto"));
		expect(result.current).toBe("default");
	});

	it("at mobile viewport (768px) with `auto` preference resolves to `comfortable`", () => {
		setViewportWidth(768);
		const { result } = renderHook(() => useAutoDensity("auto"));
		expect(result.current).toBe("comfortable");
	});

	it("at the 1024px boundary with `auto` preference resolves to `comfortable` (≤ inclusive)", () => {
		setViewportWidth(1024);
		const { result } = renderHook(() => useAutoDensity("auto"));
		expect(result.current).toBe("comfortable");
	});

	it("user override `compact` wins at desktop viewport", () => {
		setViewportWidth(1920);
		const { result } = renderHook(() => useAutoDensity("compact"));
		expect(result.current).toBe("compact");
	});

	it("user override `compact` wins at mobile viewport — explicit choice persists across breakpoints", () => {
		setViewportWidth(768);
		const { result } = renderHook(() => useAutoDensity("compact"));
		expect(result.current).toBe("compact");
	});

	it("user override `default` wins at mobile viewport", () => {
		setViewportWidth(768);
		const { result } = renderHook(() => useAutoDensity("default"));
		expect(result.current).toBe("default");
	});

	it("flips from `default` to `comfortable` when viewport crosses the breakpoint and preference is `auto`", () => {
		setViewportWidth(1920);
		const { result, rerender } = renderHook(({ pref }) => useAutoDensity(pref), {
			initialProps: { pref: "auto" as const },
		});
		expect(result.current).toBe("default");
		setViewportWidth(800);
		rerender({ pref: "auto" });
		expect(result.current).toBe("comfortable");
	});

	it("does NOT flip when preference is explicit, even on viewport change", () => {
		setViewportWidth(1920);
		const { result, rerender } = renderHook(({ pref }) => useAutoDensity(pref), {
			initialProps: { pref: "default" as const },
		});
		expect(result.current).toBe("default");
		setViewportWidth(800);
		rerender({ pref: "default" });
		expect(result.current).toBe("default");
	});
});
