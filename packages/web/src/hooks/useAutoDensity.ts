import { useEffect, useState } from "react";
import type { Density, ResolvedDensity } from "../components/SettingsPanel";

/**
 * @lore K7 / AESTHETICS.md § Mobile & Touch row "Auto-density behavior":
 * at viewport ≤ 1024px and Settings preference `"auto"`, the AppShell
 * cascades `[data-density="comfortable"]`. Otherwise `"default"`. Once the
 * user picks a non-`auto` value in Settings, that explicit choice wins
 * over the viewport switch — the user override is the contract per
 * AESTHETICS.md § Mobile & Touch row "Density preference state".
 *
 * This hook resolves the tri-state preference into the `data-density`
 * value to apply. It returns the resolved string suitable for the DOM
 * attribute. Server-side persistence is out of scope (J3/J8).
 */

export const MOBILE_BREAKPOINT_MAX = "(max-width: 1024px)";

function readMobile(): boolean {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return false;
	}
	return window.matchMedia(MOBILE_BREAKPOINT_MAX).matches;
}

/**
 * Resolve a density preference plus a viewport flag into the concrete
 * `data-density` value the shell should set.
 *
 * - When the preference is explicit (`compact` / `default` / `comfortable`),
 *   that wins regardless of viewport — user-sovereignty per AESTHETICS.md.
 * - When the preference is `auto`, the viewport drives the choice:
 *   ≤ 1024px → `comfortable` (touch-target headroom), else → `default`.
 */
export function resolveDensity(preference: Density, isMobile: boolean): ResolvedDensity {
	if (preference !== "auto") {
		return preference;
	}
	return isMobile ? "comfortable" : "default";
}

export function useAutoDensity(preference: Density): ResolvedDensity {
	const [isMobile, setIsMobile] = useState<boolean>(readMobile);

	useEffect(() => {
		function update(): void {
			setIsMobile(readMobile());
		}
		window.addEventListener("resize", update);
		const mql =
			typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_BREAKPOINT_MAX) : null;
		mql?.addEventListener("change", update);
		return () => {
			window.removeEventListener("resize", update);
			mql?.removeEventListener("change", update);
		};
	}, []);

	return resolveDensity(preference, isMobile);
}
