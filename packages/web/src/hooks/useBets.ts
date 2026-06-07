/**
 * U9 — useBets: fetch GET /api/bets and flatten the grouped response.
 *
 * Returns a flat array of all bets across all statuses (draft, active,
 * completed, killed) for the WorkPortfolio bet grid.
 *
 * @lore U9: The existing GET /api/bets endpoint returns bets grouped by
 * status (`{ draft: [], active: [], completed: [], killed: [] }`). This hook
 * flattens them client-side rather than adding a new server endpoint — Option A
 * from the architecture plan (keeps existing consumers unaffected).
 */

import type { BetOutcomeVerdict, BetStatus } from "@hyperidle/shared";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface BetListItem {
	id: string;
	title: string;
	teamId: string;
	status: BetStatus;
	description: string;
	costAppetite: import("@hyperidle/shared").WireMoney | null;
	atRisk: boolean;
	/** AC1: Structured bet outcome verdict. Null = not evaluated. */
	outcomeVerdict?: BetOutcomeVerdict | null;
}

export interface UseBetsResult {
	bets: BetListItem[];
	loading: boolean;
	error: string | null;
	refresh: () => void;
}

/** Grouped response from GET /api/bets */
interface BetsGroupedResponse {
	draft: BetListItem[];
	active: BetListItem[];
	completed: BetListItem[];
	killed: BetListItem[];
}

export function useBets(): UseBetsResult {
	const [refreshCounter, setRefreshCounter] = useState(0);
	const [bets, setBets] = useState<BetListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshCounter triggers re-fetch
	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);

		apiFetch("/api/bets")
			.then((res) => {
				if (!res.ok) throw new Error(`Bets fetch failed: ${res.status}`);
				return res.json() as Promise<BetsGroupedResponse>;
			})
			.then((data) => {
				if (!cancelled) {
					// Flatten all status groups into a single array
					const flat: BetListItem[] = [
						...data.draft,
						...data.active,
						...data.completed,
						...data.killed,
					];
					setBets(flat);
					setLoading(false);
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : String(err));
					setBets([]);
					setLoading(false);
				}
			});

		return (): void => {
			cancelled = true;
		};
	}, [refreshCounter]);

	const refresh = useCallback((): void => {
		setRefreshCounter((c) => c + 1);
	}, []);

	return { bets, loading, error, refresh };
}
