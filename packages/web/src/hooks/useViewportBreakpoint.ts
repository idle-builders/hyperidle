import { useEffect, useState } from "react";

/**
 * U6: Simplified viewport breakpoint hook.
 * Returns whether the sidebar should collapse to mobile mode (viewport ≤ 768px).
 *
 * @lore U6: The old hook returned { submenuCollapsed, railExpanded } for
 * the IconRail | Submenu | Rail layout. U6 replaces that layout with a
 * 200px fixed Sidebar, so only one breakpoint matters: ≤ 768px hides the
 * sidebar behind a mobile drawer pattern (sidebarMobile=true).
 *
 * @lore Uses `window.matchMedia` listeners so the hook reacts to viewport
 * resizes (not just initial mount). The shim in `test-setup.ts` evaluates
 * max/min-width queries against `window.innerWidth` so jsdom-based tests
 * can drive the hook by reassigning `window.innerWidth` and dispatching a
 * `resize` event.
 */

export interface ViewportBreakpoint {
	sidebarMobile: boolean;
}

const MOBILE_MAX = "(max-width: 768px)";

function readBreakpoint(): ViewportBreakpoint {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return { sidebarMobile: false };
	}
	return {
		sidebarMobile: window.matchMedia(MOBILE_MAX).matches,
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
		const mobileMql =
			typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_MAX) : null;
		mobileMql?.addEventListener("change", update);
		return () => {
			window.removeEventListener("resize", update);
			mobileMql?.removeEventListener("change", update);
		};
	}, []);

	return state;
}
