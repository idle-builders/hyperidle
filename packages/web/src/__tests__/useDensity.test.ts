/**
 * P4 — useDensity hook tests (Task 10, AC-26)
 *
 * AC-26: Density preference persists across page reload
 *
 * The useDensity hook reads/writes density to localStorage key 'hyperidle:density'.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDensity } from "../hooks/useDensity";

const DENSITY_KEY = "hyperidle:density";

describe("useDensity", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	// AC-26: Reads density from localStorage
	it("reads initial density from localStorage", () => {
		localStorage.setItem(DENSITY_KEY, "compact");

		const { result } = renderHook(() => useDensity());
		expect(result.current.density).toBe("compact");
	});

	// AC-26: Defaults to "auto" when no value in localStorage
	it("defaults to 'auto' when localStorage has no density", () => {
		const { result } = renderHook(() => useDensity());
		expect(result.current.density).toBe("auto");
	});

	// AC-26: Writing density persists to localStorage
	it("setDensity writes to localStorage", () => {
		const { result } = renderHook(() => useDensity());

		act(() => {
			result.current.setDensity("compact");
		});

		expect(localStorage.getItem(DENSITY_KEY)).toBe("compact");
	});

	// AC-26: setDensity updates the returned density
	it("setDensity updates the returned density value", () => {
		const { result } = renderHook(() => useDensity());

		act(() => {
			result.current.setDensity("comfortable");
		});

		expect(result.current.density).toBe("comfortable");
	});

	// All valid density values can be set
	it.each([
		"auto",
		"compact",
		"default",
		"comfortable",
	] as const)("accepts density value '%s'", (density) => {
		const { result } = renderHook(() => useDensity());

		act(() => {
			result.current.setDensity(density);
		});

		expect(result.current.density).toBe(density);
		expect(localStorage.getItem(DENSITY_KEY)).toBe(density);
	});

	// Simulates page reload by reading from localStorage
	it("simulates persistence across reload (reading pre-set localStorage)", () => {
		localStorage.setItem(DENSITY_KEY, "default");

		const { result } = renderHook(() => useDensity());
		expect(result.current.density).toBe("default");
	});
});
