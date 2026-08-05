/**
 * L16: useBet — thin one-shot fetch hook for GET /api/bets/:id.
 *
 * @lore L16: No caching, no retry, no SWR — when a real data layer
 * (React Query, RSC, etc.) lands track-wide, replace this hook in one edit.
 * The hook is intentionally local to layers/web/src/hooks/ rather than a
 * shared service so the replacement diff is contained.
 *
 * @lore L14: `refresh()` increments an internal counter that triggers the
 * useEffect. Incrementing is cheaper than toggling a boolean and avoids
 * race conditions where two rapid refresh() calls collapse to a single fetch.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import type { BetDetail } from "../types/bet";

export interface UseBetResult {
	data: BetDetail | null;
	loading: boolean;
	error: Error | null;
	/** L14: trigger a re-fetch from the same URL. */
	refresh: () => void;
}

export function useBet(betId: string | undefined): UseBetResult {
	const [refreshCounter, setRefreshCounter] = useState(0);
	const [state, setState] = useState<Omit<UseBetResult, "refresh">>({
		data: null,
		loading: betId !== undefined,
		error: null,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshCounter is intentionally included to trigger re-fetches on demand via refresh()
	useEffect(() => {
		if (!betId) {
			setState({ data: null, loading: false, error: null });
			return;
		}
		let cancelled = false;
		setState({ data: null, loading: true, error: null });
		apiFetch(`/api/bets/${encodeURIComponent(betId)}`)
			.then((res) => {
				if (!res.ok) throw new Error(`Bet fetch failed: ${res.status}`);
				return res.json() as Promise<BetDetail>;
			})
			.then((data) => {
				if (!cancelled) setState({ data, loading: false, error: null });
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setState({
						data: null,
						loading: false,
						error: err instanceof Error ? err : new Error(String(err)),
					});
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [betId, refreshCounter]);

	const refresh = useCallback((): void => {
		setRefreshCounter((c) => c + 1);
	}, []);

	return { ...state, refresh };
}
