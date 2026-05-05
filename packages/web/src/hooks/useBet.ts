/**
 * L16: useBet — thin one-shot fetch hook for GET /api/bets/:id.
 *
 * @lore L16: No caching, no retry, no SWR — when a real data layer
 * (React Query, RSC, etc.) lands track-wide, replace this hook in one edit.
 * The hook is intentionally local to packages/web/src/hooks/ rather than a
 * shared service so the replacement diff is contained.
 */

import { useEffect, useState } from "react";
import type { BetDetail } from "../types/bet";

export interface UseBetResult {
	data: BetDetail | null;
	loading: boolean;
	error: Error | null;
}

export function useBet(betId: string | undefined): UseBetResult {
	const [state, setState] = useState<UseBetResult>({
		data: null,
		loading: betId !== undefined,
		error: null,
	});

	useEffect(() => {
		if (!betId) {
			setState({ data: null, loading: false, error: null });
			return;
		}
		let cancelled = false;
		setState({ data: null, loading: true, error: null });
		fetch(`/api/bets/${encodeURIComponent(betId)}`)
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
	}, [betId]);

	return state;
}
