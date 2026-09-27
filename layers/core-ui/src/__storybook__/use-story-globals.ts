/**
 * Story-only helpers: install temporary globals for the lifetime of a story
 * mount.
 */

import { useLayoutEffect, useState } from "react";

/** Install `globalThis.fetch` for the lifetime of the story mount. */
export function useStoryFetch(mock: typeof fetch): void {
	useLayoutEffect(() => {
		const prev = globalThis.fetch;
		globalThis.fetch = mock;
		return () => {
			globalThis.fetch = prev;
		};
	}, [mock]);
}

/**
 * Install or clear `window.__HYPERIDLE__` for the lifetime of the story mount.
 *
 * Installing it in an effect (even `useLayoutEffect`) is still too late for
 * `DesktopTitleBar`/`SettingsWorker`, which read the global during their own
 * render — a child's render always happens before any effect fires. So the
 * story component gates its children on this hook's return value: children
 * render only on the mount pass that comes after the bridge is installed
 * (the layout effect flips `installed` to `true` and React re-renders before
 * the browser paints, so there is no visible flash of the un-set state).
 */
export function useStoryHyperIdleBridge(
	bridge: Partial<HyperIdleElectronBridge> | null | undefined,
): boolean {
	const [installed, setInstalled] = useState(false);
	useLayoutEffect(() => {
		if (typeof window === "undefined") return;
		const prev = Object.getOwnPropertyDescriptor(window, "__HYPERIDLE__");
		if (bridge === null || bridge === undefined) {
			Reflect.deleteProperty(window, "__HYPERIDLE__");
		} else {
			// Stories install partial stubs; defineProperty avoids `as unknown as`.
			Object.defineProperty(window, "__HYPERIDLE__", {
				configurable: true,
				enumerable: true,
				writable: true,
				value: bridge,
			});
		}
		setInstalled(true);
		return () => {
			setInstalled(false);
			if (prev === undefined) Reflect.deleteProperty(window, "__HYPERIDLE__");
			else Object.defineProperty(window, "__HYPERIDLE__", prev);
		};
	}, [bridge]);
	return installed;
}
