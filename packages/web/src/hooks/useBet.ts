/**
 * L16: useBet — thin one-shot fetch hook for GET /api/bets/:id.
 *
 * @lore api-contract: Replaced manual fetch() + `as Promise<BetDetail>` cast
 * with hc<BetsRoutes>. The response type is derived from the server's route
 * definition, not hand-maintained. If the server's response shape changes,
 * this hook fails to compile.
 * See plans/api-contract/concept.md §Dependency flow contract.
 *
 * @lore L16: No caching, no retry, no SWR — when a real data layer
 * (React Query, RSC, etc.) lands track-wide, replace this hook in one edit.
 * The hook is intentionally local to packages/web/src/hooks/ rather than a
 * shared service so the replacement diff is contained.
 *
 * @lore L14: `refresh()` increments an internal counter that triggers the
 * useEffect. Incrementing is cheaper than toggling a boolean and avoids
 * race conditions where two rapid refresh() calls collapse to a single fetch.
 */

import type { BetsRoutes } from "@hyperidle/server/routes/bets";
import { hc } from "hono/client";
import { useCallback, useEffect, useState } from "react";

const client = hc<BetsRoutes>("/api/bets");

// Extract the inferred response type for bet detail (200 status path of GET /:id).
// Resolves to the enriched bet object with title, product, team, progress, tasks.
type BetDetailResponse = Awaited<
	ReturnType<Awaited<ReturnType<(typeof client)[":id"]["$get"]>>["json"]>
>;

export interface UseBetResult {
	data: BetDetailResponse | null;
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
		client[":id"]
			.$get({ param: { id: betId } })
			.then((res) => {
				if (!res.ok) throw new Error(`Bet fetch failed: ${res.status}`);
				return res.json();
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
