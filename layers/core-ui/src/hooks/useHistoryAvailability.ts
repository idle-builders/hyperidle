// @lore: canGoBack reads RR's internal window.history.state.idx — no public API; if RR changes state shape, tests fail loudly (assert on idx after push)

// @lore: canGoForward uses Chromium Navigation API (window.navigation.canGoForward) — absent on non-Chromium; falls back false (forward button hidden)

import { useEffect, useState } from "react";

export interface HistoryAvailability {
	canGoBack: boolean;
	canGoForward: boolean;
}

function readAvailability(): HistoryAvailability {
	const idx =
		typeof window !== "undefined"
			? ((window.history.state as { idx?: number } | null)?.idx ?? 0)
			: 0;
	const canGoBack = idx > 0;

	const nav =
		typeof window !== "undefined"
			? (window as { navigation?: { canGoForward?: boolean } }).navigation
			: undefined;
	const canGoForward = nav?.canGoForward ?? false;

	return { canGoBack, canGoForward };
}

export function useHistoryAvailability(locationKey?: string): HistoryAvailability {
	const [availability, setAvailability] = useState<HistoryAvailability>(readAvailability);

	// Re-read on popstate (fired by RR navigation) — works without Router context
	useEffect(() => {
		void locationKey;
		setAvailability(readAvailability());

		function onPopState(): void {
			setAvailability(readAvailability());
		}
		window.addEventListener("popstate", onPopState);
		return () => {
			window.removeEventListener("popstate", onPopState);
		};
	}, [locationKey]);

	return availability;
}
