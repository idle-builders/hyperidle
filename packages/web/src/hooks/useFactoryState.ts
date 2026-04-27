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
 * cheapest correct option. The hook is a no-op on `!enabled` so a
 * suspended-tab re-render does not amplify load.
 */
import type { FactoryStateResponse } from "@hyperidle/shared";
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

function isFactoryStateResponse(v: unknown): v is FactoryStateResponse {
	if (!v || typeof v !== "object") return false;
	const r = v as Record<string, unknown>;
	return typeof r.paused === "boolean";
}

export function useFactoryState(): UseFactoryStateResult {
	const [state, setState] = useState<FactoryStateResponse>(RUNNING);

	const fetchState = useCallback(async (signal?: AbortSignal): Promise<void> => {
		try {
			const res = await fetch("/api/factory/state", { signal });
			if (!res.ok) return;
			const json: unknown = await res.json();
			if (isFactoryStateResponse(json)) {
				setState(json);
			}
		} catch {
			// Network errors are silent — stale state is preferred to a flicker.
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
