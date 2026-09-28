import { useEffect, useState } from "react";

// @lore: matchMedia shim — test-setup.ts evaluates queries against window.innerWidth; tests reassign window.innerWidth and dispatch a resize event

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
