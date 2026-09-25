/**
 * History availability hook.
 *
 * Returns whether Back and Forward navigation are available.
 *
 * @lore AG4 Decision 2: Hybrid canGoBack/canGoForward.
 *   canGoBack  — React Router v7 stores a monotonic `idx` on
 *     window.history.state.idx. idx > 0 means there are entries behind the
 *     current one. RR has no public canGoBack API — this is an internal we
 *     read directly. If RR changes its state shape the tests here will fail
 *     loudly (they assert on idx after a push), acting as a canary.
 *   canGoForward — Chromium Navigation API (window.navigation.canGoForward).
 *     Present in Electron Chromium renderer and Chromium-based dev browsers.
 *     Falls back to false when absent (forward button simply stays hidden).
 *
 */

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

	// Chromium Navigation API — present in Electron renderer and Chromium browsers.
	// ⚠️ UNVERIFIED: Non-Chromium dev browsers may not expose window.navigation.
	// Fallback false = Forward button stays hidden, which is the safe default.
	const nav =
		typeof window !== "undefined"
			? (window as { navigation?: { canGoForward?: boolean } }).navigation
			: undefined;
	const canGoForward = nav?.canGoForward ?? false;

	return { canGoBack, canGoForward };
}

export function useHistoryAvailability(locationKey?: string): HistoryAvailability {
	const [availability, setAvailability] = useState<HistoryAvailability>(readAvailability);

	// Re-read on popstate events (fired by RR on navigate(-1), navigate(1),
	// and also on route pushes in some RR versions). This is the primary update
	// mechanism and works without requiring a Router context.
	useEffect(() => {
		void locationKey;
		// Read immediately on mount to capture any state that was set before mount.
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
