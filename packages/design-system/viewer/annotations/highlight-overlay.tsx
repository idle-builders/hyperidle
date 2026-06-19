/**
 * AJ7 — highlight-overlay.tsx
 *
 * HighlightLayer — a fixed, pointer-events:none box + floating label drawn over an
 * inspected element. It NEVER mutates the inspected element's classList (concept
 * hard-rule #1; retires AJ5's .anno-hover/.anno-selected/.anno-saved). Reused in
 * three contexts (live hover, held selection, note re-highlight) → earns its budget.
 *
 * @lore AJ7 LIVE-TRACK: the box is driven by useElementRect, NOT a frozen rect.
 * It re-measures on scroll/resize so the box stays glued to the element while the
 * founder scrolls a long story. A frozen rect here was the founder's rejected drift.
 *
 * @lore AJ7 DEV-ONLY: runs only in the :8098 viewer, never in a production bundle.
 */

import { useElementRect } from "./use-element-rect.js";

export type HighlightTone = "hover" | "selected" | "rehighlight";

export interface HighlightLayerProps {
	/** The element to frame; the layer live-tracks it via useElementRect. null → renders nothing. */
	el: HTMLElement | null;
	label: string;
	tone: HighlightTone;
}

export function HighlightLayer({ el, label, tone }: HighlightLayerProps): React.JSX.Element | null {
	const rect = useElementRect(el);
	if (!(el && rect)) return null;

	// Label sits above the box unless there is no room (then below it).
	const labelTop = rect.top > 22 ? rect.top - 21 : rect.top + rect.height + 3;

	return (
		<>
			<div
				className="anno-hl-box"
				data-tone={tone}
				style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
			/>
			<div className="anno-hl-label" data-tone={tone} style={{ top: labelTop, left: rect.left }}>
				{label}
			</div>
		</>
	);
}
