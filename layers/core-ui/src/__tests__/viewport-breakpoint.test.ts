/**
 * U6 — useViewportBreakpoint simplified hook tests (AC-12).
 *
 * AC-12: useViewportBreakpoint.ts simplified — returns `{ sidebarMobile: boolean }`.
 *   - At viewport ≤ 768px, sidebarMobile is true.
 *   - At viewport > 768px, sidebarMobile is false.
 *   - No submenuCollapsed or railExpanded properties on the return value.
 *
 * The test-setup.ts polyfill evaluates max/min-width queries against
 * window.innerWidth, so we drive the hook by reassigning that property.
 */

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint";

function setViewportWidth(width: number): void {
	Object.defineProperty(window, "innerWidth", {
		writable: true,
		configurable: true,
		value: width,
	});
	window.dispatchEvent(new Event("resize"));
}

const originalWidth = window.innerWidth;

describe("useViewportBreakpoint — AC-12: simplified hook", () => {
	beforeEach(() => {
		setViewportWidth(1920);
	});

	afterEach(() => {
		setViewportWidth(originalWidth);
	});

	it("returns { sidebarMobile: false } on desktop (1920px)", () => {
		setViewportWidth(1920);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.sidebarMobile).toBe(false);
	});

	it("returns { sidebarMobile: false } at 1024px (above threshold)", () => {
		setViewportWidth(1024);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.sidebarMobile).toBe(false);
	});

	it("returns { sidebarMobile: false } at 769px (just above threshold)", () => {
		setViewportWidth(769);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.sidebarMobile).toBe(false);
	});

	it("returns { sidebarMobile: true } at 768px (at threshold)", () => {
		setViewportWidth(768);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.sidebarMobile).toBe(true);
	});

	it("returns { sidebarMobile: true } at 375px (mobile)", () => {
		setViewportWidth(375);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.sidebarMobile).toBe(true);
	});

	it("returns exactly { sidebarMobile } — no extra properties", () => {
		setViewportWidth(1920);
		const { result } = renderHook(() => useViewportBreakpoint());
		const keys = Object.keys(result.current);
		expect(keys).toEqual(["sidebarMobile"]);
	});
});
