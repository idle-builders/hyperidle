import { useEffect, useState } from "react";

/**
 * I4 R1/R2: single source of truth for the AppShell responsive breakpoints.
 * Returns whether the Submenu should be collapsed (viewport < 1024px) and
 * whether the Rail should be expanded (viewport >= 1280px).
 *
 * L5 extends the shape with `mobile` (<768px) and `tablet` (768-1023px)
 * states. The desktop pair (`submenuCollapsed`/`railExpanded`) is preserved
 * so existing call sites (AppShell desktop branch, density auto-resolver)
 * keep working unchanged.
 *
 * @lore L5: keep the prior pair additive — adding a mobile branch in
 * AppShell shouldn't ripple into every desktop test. The mobile/tablet
 * flags are derived from the same viewport observation; consumers pick
 * which axis they care about.
 *
 * @lore Uses `window.matchMedia` listeners so the hook reacts to viewport
 * resizes (not just initial mount). The shim in `test-setup.ts` evaluates
 * max/min-width queries against `window.innerWidth` so jsdom-based tests
 * can drive the hook by reassigning `window.innerWidth` and dispatching a
 * `resize` event.
 */

export interface ViewportBreakpoint {
	submenuCollapsed: boolean;
	railExpanded: boolean;
	/** L5: viewport < 768px — phone-first shell branch is active. */
	mobile: boolean;
	/** L5: viewport in [768, 1023]px — tablet (Submenu collapsed but not phone). */
	tablet: boolean;
}

const SUBMENU_COLLAPSE_MAX = "(max-width: 1023px)";
const RAIL_EXPAND_MIN = "(min-width: 1280px)";
const MOBILE_MAX = "(max-width: 767px)";
const TABLET_RANGE = "(min-width: 768px) and (max-width: 1023px)";

function readBreakpoint(): ViewportBreakpoint {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return { submenuCollapsed: false, railExpanded: true, mobile: false, tablet: false };
	}
	return {
		submenuCollapsed: window.matchMedia(SUBMENU_COLLAPSE_MAX).matches,
		railExpanded: window.matchMedia(RAIL_EXPAND_MIN).matches,
		mobile: window.matchMedia(MOBILE_MAX).matches,
		tablet: window.matchMedia(TABLET_RANGE).matches,
	};
}

export function useViewportBreakpoint(): ViewportBreakpoint {
	const [state, setState] = useState<ViewportBreakpoint>(readBreakpoint);

	useEffect(() => {
		function update(): void {
			setState(readBreakpoint());
		}
		window.addEventListener("resize", update);
		// Some browsers fire matchMedia change events but not resize for
		// orientation changes; listen to both so the hook reacts in either
		// path.
		const submenuMql =
			typeof window.matchMedia === "function" ? window.matchMedia(SUBMENU_COLLAPSE_MAX) : null;
		const railMql =
			typeof window.matchMedia === "function" ? window.matchMedia(RAIL_EXPAND_MIN) : null;
		const mobileMql =
			typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_MAX) : null;
		const tabletMql =
			typeof window.matchMedia === "function" ? window.matchMedia(TABLET_RANGE) : null;
		submenuMql?.addEventListener("change", update);
		railMql?.addEventListener("change", update);
		mobileMql?.addEventListener("change", update);
		tabletMql?.addEventListener("change", update);
		return () => {
			window.removeEventListener("resize", update);
			submenuMql?.removeEventListener("change", update);
			railMql?.removeEventListener("change", update);
			mobileMql?.removeEventListener("change", update);
			tabletMql?.removeEventListener("change", update);
		};
	}, []);

	return state;
}
