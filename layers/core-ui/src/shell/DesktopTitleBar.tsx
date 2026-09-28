import type { ReactElement } from "react";

export function DesktopTitleBar(): ReactElement | null {
	if (typeof window === "undefined" || window.__HYPERIDLE__ === undefined) {
		return null;
	}

	// 28px reserves the macOS traffic-light zone so sidebar search/nav sits below the lights
	return <div className="app-region-drag shrink-0 h-[28px] w-full" aria-hidden="true" />;
}
