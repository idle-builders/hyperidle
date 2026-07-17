/**
 * P5 FirstTimeHints — React context + hook for hint progress.
 *
 * HintProvider: fetches hint progress once at app boot and caches
 * dismissed hint IDs in context. Gracefully degrades when the API
 * fails (treats all hints as dismissed — don't show any).
 *
 * useHint(hintId): returns { visible, dismiss, copy, testId }
 * - visible: true only when data is loaded AND hint is NOT dismissed
 * - dismiss: optimistic — hides immediately and fires POST in background
 * - copy: the catalog copy string for this hint
 * - testId: the data-testid for E2E selection
 *
 * The caller is responsible for checking view-local trigger conditions
 * in addition to visible. Example:
 *   const hint = useHint("create-bet");
 *   if (hint.visible && activeBets.length === 0) { ... }
 *
 * @lore P5: dismissed is Set<HintId> (not Set<string>) to preserve
 * type safety across the hint system. The reviewer flagged Set<string>
 * as a type-safety gap.
 *
 * @lore P5: On API failure, we set ready=true but leave dismissed empty.
 * This means all hints would show as visible — NOT what we want when the
 * backend is unreachable. We instead treat all hints as dismissed by
 * setting a separate "failed" flag checked by the visibility computation.
 * See graceful degradation in the catch block.
 */

import type { HintId } from "@hyperidle/shared";
import { HINT_CATALOG } from "@hyperidle/shared";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

interface HintContextValue {
	/** Set of hint IDs the user has dismissed. */
	dismissed: ReadonlySet<HintId>;
	/** Whether the hint progress data has loaded successfully. */
	ready: boolean;
	/** Whether the API call failed (graceful degradation mode). */
	failed: boolean;
	/** Dismiss a hint by ID. Optimistic — hides immediately. */
	dismiss: (hintId: HintId) => void;
}

const HintContext = createContext<HintContextValue>({
	dismissed: new Set<HintId>(),
	ready: false,
	failed: false,
	dismiss: () => {
		// no-op: HintContext default — replaced by HintProvider implementation
	},
});

export function HintProvider({ children }: { children: ReactNode }): ReactNode {
	const [dismissed, setDismissed] = useState<Set<HintId>>(new Set<HintId>());
	const [ready, setReady] = useState(false);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		// Wrap in Promise.resolve so a non-thenable return (e.g. undefined in tests)
		// is still caught by .catch rather than throwing synchronously.
		Promise.resolve(apiFetch("/api/hint-progress"))
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json() as Promise<{
					dismissed: Array<{ hintId: string; seenAt: string }>;
				}>;
			})
			.then((data) => {
				if (!cancelled) {
					const ids = data.dismissed
						.map((d) => d.hintId)
						.filter((id): id is HintId => HINT_CATALOG.some((h) => h.id === id));
					setDismissed(new Set<HintId>(ids));
					setReady(true);
					setFailed(false);
				}
			})
			.catch(() => {
				// Graceful failure: mark as ready but failed — no hints will show.
				if (!cancelled) {
					setReady(true);
					setFailed(true);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const dismiss = useCallback((hintId: HintId) => {
		// Optimistic update — hide immediately without waiting for server
		setDismissed((prev) => {
			const next = new Set<HintId>(prev);
			next.add(hintId);
			return next;
		});
		// Fire-and-forget POST to persist the dismissal
		apiFetch(`/api/hint-progress/${hintId}/dismiss`, { method: "POST" }).catch(() => {
			// Best effort — don't re-show the hint on failure
		});
	}, []);

	return (
		<HintContext.Provider value={{ dismissed, ready, failed, dismiss }}>
			{children}
		</HintContext.Provider>
	);
}

/**
 * Hook to check whether a specific hint should be shown.
 *
 * Returns `{ visible, dismiss, copy, testId }`.
 * - `visible` is true only when: data loaded successfully AND hint NOT dismissed.
 * - The caller MUST also check their view-local trigger condition.
 *   This hook only handles progress — trigger evaluation is the caller's job.
 *
 * @example
 *   const hint = useHint("create-bet");
 *   if (hint.visible && activeBets.length === 0) {
 *     // render the hint
 *   }
 */
export function useHint(hintId: HintId): {
	visible: boolean;
	dismiss: () => void;
	copy: string;
	testId: string;
} {
	const { dismissed, ready, failed, dismiss } = useContext(HintContext);
	const entry = HINT_CATALOG.find((h) => h.id === hintId);

	return {
		// Not visible while loading, not visible on API failure, not visible if dismissed
		visible: ready && !failed && !dismissed.has(hintId),
		dismiss: () => dismiss(hintId),
		copy: entry?.copy ?? "",
		testId: entry?.testId ?? "",
	};
}
