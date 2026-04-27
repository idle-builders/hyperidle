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

	// L5: three-state breakpoints — mobile (<768) / tablet (768-1023) / desktop (>=1024).
	it("L5: at 390px (phone) returns mobile=true and tablet=false", () => {
		setViewportWidth(390);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.mobile).toBe(true);
		expect(result.current.tablet).toBe(false);
		expect(result.current.submenuCollapsed).toBe(true);
		expect(result.current.railExpanded).toBe(false);
	});

	it("L5: at 768px (tablet boundary) returns tablet=true and mobile=false", () => {
		setViewportWidth(768);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.tablet).toBe(true);
		expect(result.current.mobile).toBe(false);
	});

	it("L5: at 1023px (still tablet) returns tablet=true and mobile=false", () => {
		setViewportWidth(1023);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.tablet).toBe(true);
		expect(result.current.mobile).toBe(false);
	});

	it("L5: at 1024px (desktop) returns mobile=false and tablet=false", () => {
		setViewportWidth(1024);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.mobile).toBe(false);
		expect(result.current.tablet).toBe(false);
	});

	it("L5: at 767px (just below tablet) is mobile=true tablet=false", () => {
		setViewportWidth(767);
		const { result } = renderHook(() => useViewportBreakpoint());
		expect(result.current.mobile).toBe(true);
		expect(result.current.tablet).toBe(false);
	});
});
