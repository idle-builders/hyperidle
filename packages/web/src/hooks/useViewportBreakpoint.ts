import { useEffect, useState } from "react";

/**
 * I4 R1/R2: single source of truth for the AppShell responsive breakpoints.
 * Returns whether the Submenu should be collapsed (viewport < 1024px) and
 * whether the Rail should be expanded (viewport >= 1280px).
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
}

const SUBMENU_COLLAPSE_MAX = "(max-width: 1023px)";
const RAIL_EXPAND_MIN = "(min-width: 1280px)";

function readBreakpoint(): ViewportBreakpoint {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return { submenuCollapsed: false, railExpanded: true };
	}
	return {
		submenuCollapsed: window.matchMedia(SUBMENU_COLLAPSE_MAX).matches,
		railExpanded: window.matchMedia(RAIL_EXPAND_MIN).matches,
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
		submenuMql?.addEventListener("change", update);
		railMql?.addEventListener("change", update);
		return () => {
			window.removeEventListener("resize", update);
			submenuMql?.removeEventListener("change", update);
			railMql?.removeEventListener("change", update);
		};
	}, []);

	return state;
}
