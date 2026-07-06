/**
 * AV5 — DesktopTitleBar
 *
 * Electron-only draggable top inset. The macOS window uses
 * `titleBarStyle: "hiddenInset"`, which floats the OS traffic-lights at the
 * top-left of the window. This thin strip sits at the top of the sidebar column
 * so the sidebar's search/nav shifts down clear of the lights — while the main
 * content card still reaches the top of the window. The strip is a
 * `-webkit-app-region: drag` handle so the window can be moved by it.
 *
 * Renders nothing in the browser (no `window.__HYPERIDLE__`) → zero layout
 * impact on the web build.
 *
 * @lore AV5: -webkit-app-region is not in React.CSSProperties, so `drag` is
 * applied via the .app-region-drag utility class (index.css), not inline style.
 */

import type { ReactElement } from "react";

export function DesktopTitleBar(): ReactElement | null {
	// Gate strictly on the desktop context — null in browser → zero layout impact.
	if (typeof window === "undefined" || window.__HYPERIDLE__ === undefined) {
		return null;
	}

	// Height reserves the macOS traffic-light zone (~28px title-bar standard;
	// trafficLightPosition y:11) so the sidebar search/nav sits fully below the
	// lights. aria-hidden — pure chrome, a drag handle only.
	return <div className="app-region-drag shrink-0 h-[28px] w-full" aria-hidden="true" />;
}
