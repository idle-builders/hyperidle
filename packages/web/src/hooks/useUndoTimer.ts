/**
 * L4 — useUndoTimer.
 *
 * rAF-based countdown for the undo toast. See `.plan-L4.md` § 3.3.2.
 *
 * Contract:
 *   - `start()` flips `active=true`, sets `secondsLeft = windowSeconds`, and
 *     ticks it down every ~100ms via `setInterval`. When `secondsLeft`
 *     reaches 0, `onExpire` fires exactly once, `active` flips back to
 *     `false`, and the timer stops.
 *   - `cancel()` stops the timer without firing `onExpire`.
 *   - Calling `start()` while already running resets the countdown.
 *   - Unmount cleans up — pending `onExpire` does not fire.
 *
 * Implementation note:
 *   The plan calls for `requestAnimationFrame`, but rAF does not advance
 *   under `vi.useFakeTimers()` (jsdom provides no rAF mock that fake-timer
 *   advance triggers). `setInterval` at 100ms is mocked deterministically by
 *   vitest fake timers and gives a smooth-enough countdown for an 8-second
 *   window. `Date.now()` (mocked by vitest) provides the wall-clock so
 *   timing survives tab throttling.
 *
 * @lore L4: useUndoTimer uses setInterval(100ms) instead of
 * requestAnimationFrame because vi.useFakeTimers() does not advance rAF
 * callbacks; the countdown still feels smooth (10fps) and the wall-clock
 * comes from Date.now() so tab-throttling does not desync.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseUndoTimerOptions {
	windowSeconds: number;
	onExpire: () => void;
}

export interface UseUndoTimerReturn {
	secondsLeft: number;
	start: () => void;
	cancel: () => void;
	active: boolean;
}

const TICK_MS = 100;

export function useUndoTimer(opts: UseUndoTimerOptions): UseUndoTimerReturn {
	const { windowSeconds, onExpire } = opts;
	const [secondsLeft, setSecondsLeft] = useState<number>(windowSeconds);
	const [active, setActive] = useState<boolean>(false);

	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const startedAtRef = useRef<number>(0);
	const expiredRef = useRef<boolean>(false);
	const onExpireRef = useRef(onExpire);
	const mountedRef = useRef<boolean>(true);

	useEffect(() => {
		onExpireRef.current = onExpire;
	}, [onExpire]);

	const stopInterval = useCallback((): void => {
		if (intervalRef.current !== null) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
	}, []);

	const cancel = useCallback((): void => {
		stopInterval();
		setActive(false);
		setSecondsLeft(windowSeconds);
	}, [stopInterval, windowSeconds]);

	const start = useCallback((): void => {
		stopInterval();
		expiredRef.current = false;
		startedAtRef.current = Date.now();
		setSecondsLeft(windowSeconds);
		setActive(true);
		intervalRef.current = setInterval(() => {
			if (!mountedRef.current) return;
			const elapsedMs = Date.now() - startedAtRef.current;
			const remainingMs = windowSeconds * 1000 - elapsedMs;
			if (remainingMs <= 0) {
				if (!expiredRef.current) {
					expiredRef.current = true;
					stopInterval();
					setActive(false);
					setSecondsLeft(0);
					onExpireRef.current();
				}
				return;
			}
			setSecondsLeft(Math.ceil(remainingMs / 1000));
		}, TICK_MS);
	}, [stopInterval, windowSeconds]);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			stopInterval();
		};
	}, [stopInterval]);

	return { secondsLeft, start, cancel, active };
}
