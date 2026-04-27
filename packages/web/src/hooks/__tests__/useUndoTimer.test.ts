/**
 * L4 — useUndoTimer hook (red phase).
 *
 * Pins the contract from `.plan-L4.md` § 3.3.2:
 *   - secondsLeft counts down via a tick at ≤ 100ms cadence.
 *   - start() then advancing fake timers by windowSeconds * 1000 → onExpire
 *     fires exactly once.
 *   - cancel() after start → onExpire never fires.
 *   - Two start() calls in a row → only one onExpire (timer resets).
 *   - active flag toggles correctly across start/cancel/expiry.
 *
 * These tests MUST fail today: `useUndoTimer` does not yet exist.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUndoTimer } from "../useUndoTimer";

describe("useUndoTimer (L4)", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: false });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("is inactive on initial render and reports the configured windowSeconds as secondsLeft", () => {
		const { result } = renderHook(() =>
			useUndoTimer({
				windowSeconds: 8,
				onExpire: vi.fn(),
			}),
		);
		expect(result.current.active).toBe(false);
		expect(result.current.secondsLeft).toBe(8);
	});

	it("start() flips active=true and counts down to 0; onExpire fires exactly once on expiry", () => {
		const onExpire = vi.fn();
		const { result } = renderHook(() =>
			useUndoTimer({
				windowSeconds: 3,
				onExpire,
			}),
		);

		act(() => {
			result.current.start();
		});
		expect(result.current.active).toBe(true);

		// Advance past full window
		act(() => {
			vi.advanceTimersByTime(3_000);
		});
		expect(onExpire).toHaveBeenCalledTimes(1);
		expect(result.current.active).toBe(false);

		// Sanity: advancing further does not re-fire onExpire
		act(() => {
			vi.advanceTimersByTime(5_000);
		});
		expect(onExpire).toHaveBeenCalledTimes(1);
	});

	it("cancel() before expiry stops the timer; onExpire never fires", () => {
		const onExpire = vi.fn();
		const { result } = renderHook(() =>
			useUndoTimer({
				windowSeconds: 5,
				onExpire,
			}),
		);

		act(() => {
			result.current.start();
		});
		act(() => {
			vi.advanceTimersByTime(2_000);
		});
		act(() => {
			result.current.cancel();
		});
		expect(result.current.active).toBe(false);

		act(() => {
			vi.advanceTimersByTime(10_000);
		});
		expect(onExpire).not.toHaveBeenCalled();
	});

	it("two start() calls back-to-back result in only one onExpire (timer resets, not stacks)", () => {
		const onExpire = vi.fn();
		const { result } = renderHook(() =>
			useUndoTimer({
				windowSeconds: 3,
				onExpire,
			}),
		);

		act(() => {
			result.current.start();
		});
		act(() => {
			vi.advanceTimersByTime(1_500);
		});
		// Restart the timer mid-flight
		act(() => {
			result.current.start();
		});
		// Advance only 1.5s — first start would have fired by now; second
		// start should still be ticking.
		act(() => {
			vi.advanceTimersByTime(1_500);
		});
		expect(onExpire).not.toHaveBeenCalled();

		// Finish the (restarted) window.
		act(() => {
			vi.advanceTimersByTime(1_500);
		});
		expect(onExpire).toHaveBeenCalledTimes(1);
	});

	it("secondsLeft updates as time passes (countdown is observable)", () => {
		const { result } = renderHook(() =>
			useUndoTimer({
				windowSeconds: 8,
				onExpire: vi.fn(),
			}),
		);
		act(() => {
			result.current.start();
		});

		act(() => {
			vi.advanceTimersByTime(3_000);
		});
		// After 3s of an 8s window, no more than 5 seconds should be left.
		expect(result.current.secondsLeft).toBeLessThanOrEqual(5);
		expect(result.current.secondsLeft).toBeGreaterThanOrEqual(4);
	});

	it("cleans up on unmount: pending onExpire does not fire after unmount", () => {
		const onExpire = vi.fn();
		const { result, unmount } = renderHook(() =>
			useUndoTimer({
				windowSeconds: 3,
				onExpire,
			}),
		);
		act(() => {
			result.current.start();
		});
		unmount();
		act(() => {
			vi.advanceTimersByTime(10_000);
		});
		expect(onExpire).not.toHaveBeenCalled();
	});
});
