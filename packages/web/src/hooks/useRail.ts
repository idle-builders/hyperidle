/**
 * useRail — fetch rail data from GET /api/rail.
 *
 * @lore M3 C1: replaces the fixture imports for rail bets, blockers, and cost
 * from app-shell-data.ts. Returns live data from the server shaped
 * to match the Rail component's updated BetItem/BlockerItem/CostInfo interfaces.
 *
 * The server response already matches the new wire format (progress, taskId,
 * owner, durationBlockedMs, nullable cost fields) introduced in M3 C2.
 *
 * @lore M3: the hook returns { data, status, error, retry } to match the
 * architecture contract. AppShell destructures from data for Rail props.
 */

import type { WireMoney } from "@hyperidle/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BetItem, BlockerItem, CostInfo } from "../shell/Rail";

export interface RailData {
	bets: BetItem[];
	blockers: BlockerItem[];
	costBurnRate: CostInfo;
	awaitingOrdering: Array<{ id: string; title: string; createdAt: string }>;
}

interface RailResponseRaw {
	bets: Array<{
		id: string;
		title: string;
		status: string;
		progress: { done: number; total: number };
	}>;
	blockers: Array<{
		taskId: string;
		title: string;
		owner: string | null;
		durationBlockedMs: number;
	}>;
	awaitingOrdering: Array<{ id: string; title: string; createdAt: string }>;
	costBurnRate: {
		todaySpend: WireMoney | null;
		todayCap: WireMoney | null;
		weekSpend: WireMoney | null;
		weekCap: WireMoney | null;
		weekTokens: number | null;
	};
}

export type UseRailStatus = "loading" | "ready" | "error";

export interface UseRailResult {
	data: RailData | null;
	status: UseRailStatus;
	error: string | null;
	retry: () => void;
	/** @deprecated Use data.bets — kept for backward compat with AppShell */
	bets: BetItem[];
	/** @deprecated Use data.blockers — kept for backward compat with AppShell */
	blockers: BlockerItem[];
	/** @deprecated Use data.costBurnRate — kept for backward compat with AppShell */
	cost: CostInfo;
	/** @deprecated Use status/retry — kept for backward compat with AppShell */
	isLoading: boolean;
	/** @deprecated Use retry — kept for backward compat with AppShell */
	refresh: () => void;
}

const EMPTY_COST: CostInfo = {
	todaySpend: null,
	todayCap: null,
	weekSpend: null,
	weekCap: null,
	weekTokens: null,
};

export function useRail(): UseRailResult {
	const [data, setData] = useState<RailData | null>(null);
	const [status, setStatus] = useState<UseRailStatus>("loading");
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const abortRef = useRef<AbortController | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: tick is intentionally a dependency — bumping it via retry() re-runs the fetch
	useEffect(() => {
		const ac = new AbortController();
		abortRef.current?.abort();
		abortRef.current = ac;
		setStatus("loading");
		setError(null);

		(async (): Promise<void> => {
			try {
				const res = await fetch("/api/rail", { signal: ac.signal });
				if (ac.signal.aborted) return;
				if (!res.ok) {
					setError(`HTTP ${res.status}`);
					setStatus("error");
					return;
				}
				const raw = (await res.json()) as RailResponseRaw;
				if (ac.signal.aborted) return;

				const parsedData: RailData = {
					bets: raw.bets.map((b) => ({
						id: b.id,
						title: b.title,
						status: b.status as BetItem["status"],
						progress: b.progress,
					})),
					blockers: raw.blockers.map((bl) => ({
						taskId: bl.taskId,
						title: bl.title,
						owner: bl.owner,
						durationBlockedMs: bl.durationBlockedMs,
					})),
					costBurnRate: {
						todaySpend: raw.costBurnRate.todaySpend,
						todayCap: raw.costBurnRate.todayCap,
						weekSpend: raw.costBurnRate.weekSpend,
						weekCap: raw.costBurnRate.weekCap,
						weekTokens: raw.costBurnRate.weekTokens,
					},
					awaitingOrdering: raw.awaitingOrdering,
				};
				setData(parsedData);
				setStatus("ready");
			} catch (cause) {
				if (ac.signal.aborted) return;
				if (cause instanceof Error && cause.name === "AbortError") return;
				setError(cause instanceof Error ? cause.message : "Network error");
				setStatus("error");
			}
		})();

		return () => {
			ac.abort();
		};
	}, [tick]);

	const retry = useCallback((): void => {
		setTick((n) => n + 1);
	}, []);

	return {
		data,
		status,
		error,
		retry,
		// Backward-compat fields for AppShell destructuring
		bets: data?.bets ?? [],
		blockers: data?.blockers ?? [],
		cost: data?.costBurnRate ?? EMPTY_COST,
		isLoading: status === "loading",
		refresh: retry,
	};
}
