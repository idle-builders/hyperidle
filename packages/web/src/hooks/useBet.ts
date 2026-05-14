/**
 * L16: useBet — thin one-shot fetch hook for GET /api/bets/:id.
 *
 * @lore L16: No caching, no retry, no SWR — when a real data layer
 * (React Query, RSC, etc.) lands track-wide, replace this hook in one edit.
 * The hook is intentionally local to packages/web/src/hooks/ rather than a
 * shared service so the replacement diff is contained.
 *
 * @lore L14: `refresh()` increments an internal counter that triggers the
 * useEffect. Incrementing is cheaper than toggling a boolean and avoids
 * race conditions where two rapid refresh() calls collapse to a single fetch.
 *
 * @lore api-typesafety S4: Migrated from raw apiFetch('/api/bets/:id') to the
 * typed hono/client (apiClient). The client infers request/response shapes from
 * AppType so TypeScript catches wire-shape mismatches at compile time rather
 * than at runtime. BetDetail remains the page-layer type; we cast from the
 * wire type because the wire schema uses z.record(z.unknown()) for nested
 * objects (see bets.ts inline schemas). A full wire→page mapping function is
 * deferred until the bets route schema is tightened in a follow-up workpackage.
 */

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client.js";
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
		apiClient.bets[":id"]
			.$get({ param: { id: betId } })
			.then((res) => {
				if (!res.ok) throw new Error(`Bet fetch failed: ${res.status}`);
				// @lore api-typesafety S4: The inline bets schema uses z.record(z.unknown())
				// for nested task objects — the wire type is structurally compatible with
				// BetDetail but not identical. The cast is intentional and bounded: both
				// sides agree on the top-level string fields; only tasks[] sub-shapes differ.
				// Remove this cast once the bets route schema is tightened to match BetDetail.
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
