import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboardNavigation } from "../hooks/useKeyboardNavigation";

describe("useKeyboardNavigation", () => {
	const defaultOpts = {
		itemCount: 5,
		onSelect: vi.fn(),
		onClose: vi.fn(),
	};

	it("starts with activeIndex 0", () => {
		const { result } = renderHook(() => useKeyboardNavigation(defaultOpts));
		expect(result.current.activeIndex).toBe(0);
	});

	it("ArrowDown increments activeIndex", () => {
		const { result } = renderHook(() => useKeyboardNavigation(defaultOpts));
		act(() => {
			result.current.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowDown" }));
		});
		expect(result.current.activeIndex).toBe(1);
	});

	it("ArrowDown wraps from last to first", () => {
		const { result } = renderHook(() => useKeyboardNavigation({ ...defaultOpts, itemCount: 3 }));
		act(() => {
			result.current.setActiveIndex(2);
		});
		act(() => {
			result.current.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowDown" }));
		});
		expect(result.current.activeIndex).toBe(0);
	});

	it("ArrowUp decrements activeIndex", () => {
		const { result } = renderHook(() => useKeyboardNavigation(defaultOpts));
		act(() => {
			result.current.setActiveIndex(2);
		});
		act(() => {
			result.current.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowUp" }));
		});
		expect(result.current.activeIndex).toBe(1);
	});

	it("ArrowUp wraps from first to last", () => {
		const { result } = renderHook(() => useKeyboardNavigation({ ...defaultOpts, itemCount: 3 }));
		expect(result.current.activeIndex).toBe(0);
		act(() => {
			result.current.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowUp" }));
		});
		expect(result.current.activeIndex).toBe(2);
	});

	it("Enter calls onSelect with current activeIndex", () => {
		const onSelect = vi.fn();
		const { result } = renderHook(() => useKeyboardNavigation({ ...defaultOpts, onSelect }));
		act(() => {
			result.current.setActiveIndex(3);
		});
		act(() => {
			result.current.onKeyDown(new KeyboardEvent("keydown", { key: "Enter" }));
		});
		expect(onSelect).toHaveBeenCalledWith(3);
	});

	it("Escape calls onClose", () => {
		const onClose = vi.fn();
		const { result } = renderHook(() => useKeyboardNavigation({ ...defaultOpts, onClose }));
		act(() => {
			result.current.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
		});
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("setActiveIndex updates the active index", () => {
		const { result } = renderHook(() => useKeyboardNavigation(defaultOpts));
		act(() => {
			result.current.setActiveIndex(4);
		});
		expect(result.current.activeIndex).toBe(4);
	});

	it("does nothing for unrelated keys", () => {
		const onSelect = vi.fn();
		const onClose = vi.fn();
		const { result } = renderHook(() =>
			useKeyboardNavigation({ ...defaultOpts, onSelect, onClose }),
		);
		act(() => {
			result.current.onKeyDown(new KeyboardEvent("keydown", { key: "a" }));
		});
		expect(result.current.activeIndex).toBe(0);
		expect(onSelect).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it("handles zero items without crashing", () => {
		const { result } = renderHook(() => useKeyboardNavigation({ ...defaultOpts, itemCount: 0 }));
		act(() => {
			result.current.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowDown" }));
		});
		expect(result.current.activeIndex).toBe(0);
	});

	it("resets activeIndex to 0 when itemCount changes", () => {
		const { result, rerender } = renderHook(
			({ itemCount }: { itemCount: number }) =>
				useKeyboardNavigation({ ...defaultOpts, itemCount }),
			{ initialProps: { itemCount: 5 } },
		);
		act(() => {
			result.current.setActiveIndex(3);
		});
		rerender({ itemCount: 2 });
		expect(result.current.activeIndex).toBe(0);
	});
});
