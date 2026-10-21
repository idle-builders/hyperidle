import { useEffect, useState } from "react";

/**
 * How the app looks for whoever is looking at it: light, dark, or like this computer. A per-viewer
 * choice kept in this browser; nobody else sees it.
 */
export const LOOKS = ["Light", "Dark", "Like this computer"] as const;
export type Looks = (typeof LOOKS)[number];

const KEY = "hyperidle.looks";
const CHANGED = "hyperidle:looks";
/** The choice made on this page, for a browser that keeps nothing. */
let chosen: Looks = "Like this computer";

function stored(): Looks {
	try {
		const saved = window.localStorage.getItem(KEY);
		return LOOKS.find((l) => l === saved) ?? chosen;
	} catch {
		return chosen;
	}
}

/** Paints the app in the chosen looks, and again whenever the choice or the computer changes. */
export function useAppLooks(): void {
	useEffect(() => {
		const dark = window.matchMedia("(prefers-color-scheme: dark)");
		const apply = () => {
			const looks = stored();
			document.documentElement.dataset.skin = "paper";
			document.documentElement.dataset.mode =
				looks === "Dark" || (looks === "Like this computer" && dark.matches) ? "dark" : "light";
		};
		apply();
		dark.addEventListener("change", apply);
		window.addEventListener(CHANGED, apply);
		return () => {
			dark.removeEventListener("change", apply);
			window.removeEventListener(CHANGED, apply);
		};
	}, []);
}

/** Keep the choice for this viewer and repaint the app. */
function choose(next: Looks): void {
	chosen = next;
	try {
		window.localStorage.setItem(KEY, next);
	} catch {
		// Without storage the choice still holds until the page reloads.
	}
	window.dispatchEvent(new Event(CHANGED));
}

/** The viewer's choice, and the way to change it. */
export function useLooks(): [Looks, (looks: Looks) => void] {
	const [looks, setLooks] = useState<Looks>(stored);
	return [
		looks,
		(next) => {
			choose(next);
			setLooks(next);
		},
	];
}
