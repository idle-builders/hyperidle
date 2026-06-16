/**
 * AJ7 — use-element-rect.ts
 *
 * Live-tracking rect for a DOM element. The structural cure for the founder's
 * rejected frozen-box drift: the box never stores a stale rect — it re-measures
 * getBoundingClientRect() on window `scroll` (CAPTURE phase, so it fires for
 * scroll inside ANY nested scroll container) and `resize` while `el` is non-null.
 *
 * @lore AJ7 SCROLL-CAPTURE: scroll events do not bubble. A capture-phase window
 * listener is the only way to observe scroll inside a nested overflow container
 * without attaching a listener to every scrollable ancestor. This is why the
 * held box stays glued when the founder scrolls a long story.
 *
 * @lore AJ7 TRANSFORMED-ANCESTOR BLIND SPOT: getBoundingClientRect already accounts
 * for CSS transforms on ancestors, so position:fixed boxes map correctly. BUT a
 * reflow that fires NEITHER window scroll NOR resize (e.g. the inspector rail
 * collapsing/expanding, which shifts the canvas via grid-template-columns change)
 * will NOT trigger a re-measure here — the overlay couples a ResizeObserver /
 * transition-driven re-measure for that case (see annotation-overlay.tsx). This
 * hook intentionally covers only scroll + resize; the overlay owns the rest.
 *
 * @lore AJ7 DEV-ONLY: runs only in the :8098 viewer, never in a production bundle.
 */

import { useLayoutEffect, useState } from "react";

export interface Rect {
	top: number;
	left: number;
	width: number;
	height: number;
}

/** Pure, exported for tests: viewport-coord rect of an element. */
export function measureRect(el: HTMLElement): Rect {
	const r = el.getBoundingClientRect();
	return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Pure, exported: is this rect fully or partly outside the current viewport? */
export function isRectOffscreen(rect: Rect, viewportW: number, viewportH: number): boolean {
	return (
		rect.top < 0 ||
		rect.left < 0 ||
		rect.top + rect.height > viewportH ||
		rect.left + rect.width > viewportW
	);
}

/**
 * Live-tracking rect for a DOM element. Re-measures on window `scroll` (capture)
 * and `resize` while `el` is non-null, rAF-throttled (one measure per frame max).
 * Returns null when el is null.
 */
export function useElementRect(el: HTMLElement | null): Rect | null {
	const [rect, setRect] = useState<Rect | null>(() => (el?.isConnected ? measureRect(el) : null));

	useLayoutEffect(() => {
		if (!el?.isConnected) {
			setRect(null);
			return;
		}
		// Measure immediately so the first paint is not a frame behind.
		setRect(measureRect(el));

		let frame = 0;
		const onChange = (): void => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				// @lore AJ7 UNMOUNT-GUARD (SF-2): a held element can detach between
				// frames (variant nav, conditional sibling removal). getBoundingClientRect
				// on a detached node returns all-zeros → a 0×0 ghost box at the viewport
				// origin. Treat !isConnected as null so the box disappears instead of lying.
				setRect(el.isConnected ? measureRect(el) : null);
			});
		};

		// Capture phase so scroll inside any nested overflow container is observed.
		window.addEventListener("scroll", onChange, true);
		window.addEventListener("resize", onChange);
		return (): void => {
			window.removeEventListener("scroll", onChange, true);
			window.removeEventListener("resize", onChange);
			if (frame) cancelAnimationFrame(frame);
		};
	}, [el]);

	return rect;
}
