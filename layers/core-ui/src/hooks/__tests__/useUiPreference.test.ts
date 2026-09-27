import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiPreference } from "../useUiPreference.js";

describe("useUiPreference", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("returns defaultRatio when no stored value", () => {
		const { result } = renderHook(() => useUiPreference("test.key", 0.4));
		const [ratio] = result.current;
		expect(ratio).toBe(0.4);
	});

	it("returns stored value when localStorage has a valid ratio", () => {
		localStorage.setItem("hyperidle.split.test.key", "0.65");

		const { result } = renderHook(() => useUiPreference("test.key", 0.4));
		const [ratio] = result.current;
		expect(ratio).toBeCloseTo(0.65);
	});

	it("clamps stored value above 0.8 to 0.8", () => {
		localStorage.setItem("hyperidle.split.test.clamp-hi", "0.99");

		const { result } = renderHook(() => useUiPreference("test.clamp-hi", 0.5));
		const [ratio] = result.current;
		expect(ratio).toBe(0.8);
	});

	it("clamps stored value below 0.2 to 0.2", () => {
		localStorage.setItem("hyperidle.split.test.clamp-lo", "0.01");

		const { result } = renderHook(() => useUiPreference("test.clamp-lo", 0.5));
		const [ratio] = result.current;
		expect(ratio).toBe(0.2);
	});

	it("falls back to defaultRatio when stored value is NaN", () => {
		localStorage.setItem("hyperidle.split.test.nan", "not-a-number");

		const { result } = renderHook(() => useUiPreference("test.nan", 0.55));
		const [ratio] = result.current;
		expect(ratio).toBe(0.55);
	});

	it("setRatio persists to localStorage", async () => {
		const { result } = renderHook(() => useUiPreference("test.persist", 0.5));
		await act(async () => {
			result.current[1](0.7);
		});
		expect(result.current[0]).toBeCloseTo(0.7);
		expect(localStorage.getItem("hyperidle.split.test.persist")).toBe("0.7");
	});
});
