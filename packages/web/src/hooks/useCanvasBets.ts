/**
 * Q3 — useCanvasBets: fetch GET /api/bets/canvas.
 *
 * Returns all shaped + committed bets merged into a flat array, plus
 * capacity info. Follows the same thin-hook pattern as useBet (L16):
 * no caching, no retry — replace with a real data layer track-wide later.
 *
 * @lore Q3: The canvas endpoint returns enriched bet shapes (with product
 * name, derived title, formatted appetite). The hook merges shaped and
 * committed arrays into a single flat `bets` array so the Canvas component
 * can filter by status itself (matching the existing CanvasBet shape).
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import type { CanvasBet } from "../shell/Canvas.js";

export interface CanvasCapacity {
	used: number;
	max: number;
}

export interface UseCanvasBetsResult {
	bets: CanvasBet[];
	capacity: CanvasCapacity;
	loading: boolean;
	error: Error | null;
	/** Trigger a re-fetch from the same URL. */
	refresh: () => void;
}

interface CanvasApiResponse {
	shaped: CanvasBet[];
	committed: CanvasBet[];
	capacity: CanvasCapacity;
}

export function useCanvasBets(): UseCanvasBetsResult {
	const [refreshCounter, setRefreshCounter] = useState(0);
	const [state, setState] = useState<Omit<UseCanvasBetsResult, "refresh">>({
		bets: [],
		capacity: { used: 0, max: 0 },
		loading: true,
		error: null,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshCounter is intentionally included to trigger re-fetches on demand via refresh()
	useEffect(() => {
		let cancelled = false;
		setState((prev) => ({ ...prev, loading: true, error: null }));

		apiFetch("/api/bets/canvas")
			.then((res) => {
				if (!res.ok) throw new Error(`Canvas fetch failed: ${res.status}`);
				return res.json() as Promise<CanvasApiResponse>;
			})
			.then((data) => {
				if (!cancelled) {
					setState({
						bets: [...data.shaped, ...data.committed],
						capacity: data.capacity,
						loading: false,
						error: null,
					});
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setState({
						bets: [],
						capacity: { used: 0, max: 0 },
						loading: false,
						error: err instanceof Error ? err : new Error(String(err)),
					});
				}
			});

		return (): void => {
			cancelled = true;
		};
	}, [refreshCounter]);

	const refresh = useCallback((): void => {
		setRefreshCounter((c) => c + 1);
	}, []);

	return { ...state, refresh };
}
