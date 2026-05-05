/**
 * L16: useBet — thin one-shot fetch hook for GET /api/bets/:id.
 *
 * @lore L16: No caching, no retry, no SWR — when a real data layer
 * (React Query, RSC, etc.) lands track-wide, replace this hook in one edit.
 * The hook is intentionally local to packages/web/src/hooks/ rather than a
 * shared service so the replacement diff is contained.
 *
 * RED PHASE STUB: this file exists so the test can import it; the actual
 * implementation is provided in the green phase.
 */

import type { BetDetail } from "../types/bet";

export interface UseBetResult {
	data: BetDetail | null;
	loading: boolean;
	error: Error | null;
}

export function useBet(_betId: string | undefined): UseBetResult {
	// Stub: always returns not-loading, no data. Tests will fail against this.
	return { data: null, loading: false, error: null };
}
