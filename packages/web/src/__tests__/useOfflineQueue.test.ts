import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfflineQueue } from "../hooks/useOfflineQueue";

function setOnline(value: boolean): void {
	Object.defineProperty(navigator, "onLine", {
		writable: true,
		configurable: true,
		value,
	});
	window.dispatchEvent(new Event(value ? "online" : "offline"));
}

describe("useOfflineQueue (L5)", () => {
	beforeEach(() => {
		setOnline(true);
	});
	afterEach(() => {
		setOnline(true);
	});

	it("initial offline state mirrors navigator.onLine", () => {
		setOnline(false);
		const { result } = renderHook(() => useOfflineQueue({ commit: async () => {} }));
		expect(result.current.offline).toBe(true);
	});

	it("enqueue while offline does NOT call commit; queueLength increments", () => {
		setOnline(false);
		const commit = vi.fn(async () => {});
		const { result } = renderHook(() => useOfflineQueue({ commit }));
		act(() => {
			result.current.enqueue({ itemId: "i1", threadId: "t1", decision: "approve" });
		});
		expect(commit).not.toHaveBeenCalled();
		expect(result.current.queueLength).toBe(1);
	});

	it("on reconnect, queued verdicts replay and syncedCount reflects the batch", async () => {
		setOnline(false);
		const commit = vi.fn(async () => {});
		const { result } = renderHook(() => useOfflineQueue({ commit }));
		act(() => {
			result.current.enqueue({ itemId: "i1", threadId: "t1", decision: "approve" });
			result.current.enqueue({ itemId: "i2", threadId: "t2", decision: "reject" });
		});
		await act(async () => {
			setOnline(true);
			// Allow microtask drain.
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(commit).toHaveBeenCalledTimes(2);
		expect(result.current.queueLength).toBe(0);
		expect(result.current.syncedCount).toBe(2);
	});

	it("dismissSyncedToast resets syncedCount", async () => {
		const commit = vi.fn(async () => {});
		const { result } = renderHook(() => useOfflineQueue({ commit }));
		setOnline(false);
		act(() => {
			result.current.enqueue({ itemId: "i1", threadId: "t1", decision: "approve" });
		});
		await act(async () => {
			setOnline(true);
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(result.current.syncedCount).toBe(1);
		act(() => {
			result.current.dismissSyncedToast();
		});
		expect(result.current.syncedCount).toBeNull();
	});

	it("when online, enqueue invokes commit immediately", async () => {
		const commit = vi.fn(async () => {});
		const { result } = renderHook(() => useOfflineQueue({ commit }));
		await act(async () => {
			result.current.enqueue({ itemId: "i1", threadId: "t1", decision: "approve" });
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(commit).toHaveBeenCalledTimes(1);
		expect(result.current.queueLength).toBe(0);
	});

	it("commit failure stops drain and preserves queue order", async () => {
		setOnline(false);
		let calls = 0;
		const commit = vi.fn(async () => {
			calls += 1;
			if (calls === 1) throw new Error("net");
		});
		const { result } = renderHook(() => useOfflineQueue({ commit }));
		act(() => {
			result.current.enqueue({ itemId: "i1", threadId: "t1", decision: "approve" });
			result.current.enqueue({ itemId: "i2", threadId: "t2", decision: "reject" });
		});
		await act(async () => {
			setOnline(true);
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(commit).toHaveBeenCalledTimes(1);
		expect(result.current.queueLength).toBe(2);
	});
});
