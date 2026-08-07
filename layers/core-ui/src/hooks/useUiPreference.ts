/**
 * useUiPreference — localStorage-backed split-view ratio hook.
 *
 * @lore AM5 T6: SplitView is presentational (props in). This hook owns the
 * persistence concern: each surface passes a distinct surfaceKey, reads its
 * last ratio on mount, and writes on every drag. Clamped 0.2–0.8, NaN-safe.
 * Key format: "hyperidle.split.<surfaceKey>" (namespaced to avoid collisions).
 */
import { useCallback, useState } from "react";

const PREFIX = "hyperidle.split.";
const MIN = 0.2;
const MAX = 0.8;

function clamp(v: number): number {
	return Math.min(MAX, Math.max(MIN, v));
}

function readStored(surfaceKey: string, defaultRatio: number): number {
	try {
		const raw = localStorage.getItem(`${PREFIX}${surfaceKey}`);
		if (raw === null) return defaultRatio;
		const parsed = Number(raw);
		if (Number.isNaN(parsed)) return defaultRatio;
		return clamp(parsed);
	} catch {
		return defaultRatio;
	}
}

/**
 * Returns [ratio, setRatio] — localStorage-backed, clamped 0.2..0.8.
 * Call setRatio from SplitView's onRatioChange to persist.
 */
export function useUiPreference(
	surfaceKey: string,
	defaultRatio: number,
): [number, (v: number) => void] {
	const [ratio, setRatioState] = useState<number>(() => readStored(surfaceKey, defaultRatio));

	const setRatio = useCallback(
		(v: number): void => {
			const clamped = clamp(v);
			setRatioState(clamped);
			try {
				localStorage.setItem(`${PREFIX}${surfaceKey}`, String(clamped));
			} catch {
				// localStorage unavailable (private browsing, quota exceeded) — silent fallback.
			}
		},
		[surfaceKey],
	);

	return [ratio, setRatio];
}
