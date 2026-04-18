import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint";

/**
 * I4 R1/R2: `useViewportBreakpoint` returns `{ submenuCollapsed, railExpanded }`
 * based on `window.matchMedia`. Submenu collapses when viewport width is
 * below 1024px; Rail expands when viewport width is at or above 1280px.
 *
 * The test-setup.ts polyfill evaluates max/min-width queries against
 * `window.innerWidth`, so we can drive the hook by reassigning that property.
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

describe("useViewportBreakpoint", () => {
	beforeEach(() => {
		setViewportWidth(1920);
	});

	afterEach(() => {
		setViewportWidth(originalWidth);
	});

	it("on desktop (1920px) returns submenuCollapsed false and railExpanded true", () => {
		setViewportWidth(1920);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.submenuCollapsed).toBe(false);
		expect(result.current.railExpanded).toBe(true);
	});

	it("at 1280px boundary — Rail is expanded (>=1280) and Submenu is not collapsed", () => {
		setViewportWidth(1280);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.submenuCollapsed).toBe(false);
		expect(result.current.railExpanded).toBe(true);
	});

	it("at 1024px — Submenu not collapsed yet (>=1024) but Rail is collapsed (<1280)", () => {
		setViewportWidth(1024);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.submenuCollapsed).toBe(false);
		expect(result.current.railExpanded).toBe(false);
	});

	it("below 1024px the Submenu collapses by default", () => {
		setViewportWidth(800);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.submenuCollapsed).toBe(true);
	});

	it("below 1024px the Rail also collapses", () => {
		setViewportWidth(768);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.railExpanded).toBe(false);
	});
});
