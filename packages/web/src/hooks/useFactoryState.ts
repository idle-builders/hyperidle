/**
 * L7 — `useFactoryState` (TRACK-L L7 plan §5).
 *
 * Source-of-truth subscription to the singleton `factory_state` row,
 * exposed via `GET /api/factory/state`. Polls every 30 seconds as a
 * fallback for the (still-pending) WebSocket fan-out — cheap singleton
 * read, single in-flight request guarded by AbortController.
 *
 * @lore L7 plan §5: a future story can wire the existing `/api/ws/*`
 * channel to push state changes; until then the 30s poll is the
 * cheapest correct option.
 * @lore L7 (AI6): response is validated with `factoryStateResponseSchema`
 * at the trust boundary — a mid-flight schema drift surfaces as a
 * dropped poll instead of corrupted state.
 */
import { factoryStateResponseSchema, type FactoryStateResponse } from "@hyperidle/shared";
import { useCallback, useEffect, useState } from "react";

const POLL_INTERVAL_MS = 30_000;

const RUNNING: FactoryStateResponse = {
	paused: false,
	pausedBy: null,
	pausedAt: null,
	pausedReason: null,
};

interface UseFactoryStateResult {
	state: FactoryStateResponse;
	refresh: () => void;
}

export function useFactoryState(): UseFactoryStateResult {
	const [state, setState] = useState<FactoryStateResponse>(RUNNING);

	const fetchState = useCallback(async (signal?: AbortSignal): Promise<void> => {
		try {
			const res = await fetch("/api/factory/state", { signal });
			if (!res.ok) return;
			const json: unknown = await res.json();
			const parsed = factoryStateResponseSchema.safeParse(json);
			if (parsed.success) {
				setState(parsed.data);
			}
		} catch {
			// Aborts + transient network errors — stale state is
			// preferred to a flicker. JSON parse failures fall through
			// here too; a mid-flight schema drift would show as a
			// silently-skipped poll, not a thrown render.
		}
	}, []);

	useEffect(() => {
		const controller = new AbortController();
		void fetchState(controller.signal);
		const interval = window.setInterval(() => {
			void fetchState(controller.signal);
		}, POLL_INTERVAL_MS);
		return () => {
			controller.abort();
			window.clearInterval(interval);
		};
	}, [fetchState]);

	const refresh = useCallback(() => {
		void fetchState();
	}, [fetchState]);

	return { state, refresh };
}
