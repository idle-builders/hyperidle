import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCommandK } from "../hooks/useCommandK";

describe("useCommandK", () => {
	it("starts with isOpen false", () => {
		const { result } = renderHook(() => useCommandK());
		expect(result.current.isOpen).toBe(false);
	});

	it("opens on Meta+K keydown", () => {
		const { result } = renderHook(() => useCommandK());
		act(() => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
		});
		expect(result.current.isOpen).toBe(true);
	});

	it("opens on Ctrl+K keydown", () => {
		const { result } = renderHook(() => useCommandK());
		act(() => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
		});
		expect(result.current.isOpen).toBe(true);
	});

	it("toggles closed if already open on Meta+K", () => {
		const { result } = renderHook(() => useCommandK());
		act(() => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
		});
		expect(result.current.isOpen).toBe(true);
		act(() => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
		});
		expect(result.current.isOpen).toBe(false);
	});

	it("does not open on plain K keydown without modifier", () => {
		const { result } = renderHook(() => useCommandK());
		act(() => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
		});
		expect(result.current.isOpen).toBe(false);
	});

	it("open() sets isOpen to true", () => {
		const { result } = renderHook(() => useCommandK());
		act(() => {
			result.current.open();
		});
		expect(result.current.isOpen).toBe(true);
	});

	it("close() sets isOpen to false", () => {
		const { result } = renderHook(() => useCommandK());
		act(() => {
			result.current.open();
		});
		expect(result.current.isOpen).toBe(true);
		act(() => {
			result.current.close();
		});
		expect(result.current.isOpen).toBe(false);
	});

	it("cleans up event listener on unmount", () => {
		const { result, unmount } = renderHook(() => useCommandK());
		unmount();
		act(() => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
		});
		// After unmount, state should remain false (hook is gone)
		expect(result.current.isOpen).toBe(false);
	});

	it("prevents default browser behavior on Cmd+K", () => {
		renderHook(() => useCommandK());
		const event = new KeyboardEvent("keydown", {
			key: "k",
			metaKey: true,
			cancelable: true,
		});
		act(() => {
			document.dispatchEvent(event);
		});
		expect(event.defaultPrevented).toBe(true);
	});
});
