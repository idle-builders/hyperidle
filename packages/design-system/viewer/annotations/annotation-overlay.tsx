/**
 * AJ7 — annotation-overlay.tsx (v2, devtools-style element inspector)
 *
 * Composes usePicker (engine) + InspectorRail (docked chrome) + HighlightLayer
 * (live-tracking overlay boxes). Owns the /__annotations GET/POST/round wiring
 * (AJ5 parity) plus the additive `anchor` on the saved target and per-element
 * variant attribution.
 *
 * SUPERSEDES the AJ5 review pill + fixed-to-pill popover + element-mutating
 * outline classes (.anno-pill / .anno-popover / .anno-selected / .anno-saved):
 * those are retired. The inspected element's DOM is never touched (concept rule #1).
 *
 * @lore AJ7 RAIL-REFLOW RE-MEASURE: useElementRect re-measures on window scroll +
 * resize, but the rail collapsing/expanding shifts the canvas via a CSS grid change
 * that fires NEITHER event. We observe the story root with a ResizeObserver and bump
 * a `measureKey` (remounting HighlightLayer) so the held/re-highlight box re-measures
 * when the rail reflows. Without this the box drifts on collapse — the founder's
 * load-bearing requirement (architecture-critique WARNING #3).
 *
 * @lore AJ7 VARIANT-ATTRIBUTION: the per-element picker means the clicked element may
 * live in any .demo-section, so the old hardcoded variants[0] is wrong. We derive the
 * POST `variant` from the clicked element's enclosing .demo-section[data-variant],
 * falling back to the page's active variant prop only if none resolves.
 *
 * @lore AJ7 OFF-SCREEN SCROLL-INTO-VIEW: when a re-highlighted element is outside the
 * viewport we scrollIntoView({ block: "center" }) BEFORE the box draws; useElementRect
 * then live-tracks it to the settled position. in-DOM-but-off-screen (scroll to it) is
 * distinct from not-in-DOM (picker.reHighlightMissing → quiet "not visible" row).
 *
 * @lore AJ7 DEV-ONLY: runs only in the :8098 viewer, never in a production bundle.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { HighlightLayer } from "./highlight-overlay.js";
import { InspectorRail } from "./inspector-rail.js";
import { resolveComponentTarget } from "./resolve-component.js";
import type { AnnotationState, AnnotationTarget } from "./types.js";
import { isRectOffscreen, measureRect } from "./use-element-rect.js";
import { usePicker } from "./use-picker.js";

export interface AnnotationOverlayProps {
	/** The story currently displayed (echoed in POST payload). */
	story: string;
	/** Page-level active variant — fallback when an element resolves to no .demo-section. */
	variant: string;
	/** The live story content root (never null — the call site guards on it). */
	storyRoot: HTMLElement;
}

/** Derive the variant for a clicked element from its enclosing .demo-section. */
function variantForElement(el: HTMLElement, fallback: string): string {
	const section = el.closest<HTMLElement>(".demo-section");
	const attr = section?.getAttribute("data-variant");
	if (attr) return attr;
	// Fall back to the section title text when no explicit data-variant.
	const title = section?.querySelector(".demo-section-title")?.textContent?.trim();
	return title && title.length > 0 ? title : fallback;
}

export function AnnotationOverlay({
	story,
	variant,
	storyRoot,
}: AnnotationOverlayProps): React.JSX.Element {
	const picker = usePicker(storyRoot);
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [state, setState] = useState<AnnotationState | null>(null);
	const [collapsed, setCollapsed] = useState(false);
	const [measureKey, setMeasureKey] = useState(0);
	const armButtonRef = useRef<HTMLButtonElement>(null);

	// ---- Fetch state on mount (AJ5 parity) ------------------------------
	const fetchState = useCallback((): void => {
		void fetch("/__annotations")
			.then((r) => r.json())
			.then((data: { state: AnnotationState }) => setState(data.state))
			.catch(() => {
				// best-effort — middleware may be down in test env
			});
	}, []);
	useEffect(() => fetchState(), [fetchState]);

	const currentRound = state?.currentRound ?? 1;
	const currentRoundData = state?.rounds.find((r) => r.round === currentRound);
	const annotations = currentRoundData?.annotations ?? [];

	// ---- Rail reflow → re-measure held / re-highlight boxes -------------
	useEffect(() => {
		if (typeof ResizeObserver === "undefined") return undefined;
		const ro = new ResizeObserver(() => setMeasureKey((k) => k + 1));
		ro.observe(storyRoot);
		return () => ro.disconnect();
	}, [storyRoot]);
	// Collapse toggle also reflows the grid; bump the key explicitly too.
	useEffect(() => {
		setMeasureKey((k) => k + 1);
	}, []);

	// ---- Off-screen → scrollIntoView before drawing the re-highlight ----
	useEffect(() => {
		const el = picker.reHighlightEl;
		if (!el) return;
		const rect = measureRect(el);
		if (isRectOffscreen(rect, window.innerWidth, window.innerHeight)) {
			el.scrollIntoView({ block: "center", behavior: "auto" });
		}
	}, [picker.reHighlightEl]);

	// ---- Save (AJ5 parity + anchor + per-element variant) ---------------
	const handleSave = useCallback(async (): Promise<void> => {
		const sel = picker.selected;
		if (!sel || saving) return;
		setSaving(true);
		setError(null);
		try {
			const target: AnnotationTarget = sel.target;
			const resolvedVariant = variantForElement(sel.el, variant);
			const payload = { story, variant: resolvedVariant, note, target };
			const res = await fetch("/__annotations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) throw new Error("Server error");
			const data = (await res.json()) as { state: AnnotationState };
			setState(data.state);
			picker.clearSelection();
			setNote("");
		} catch {
			setError("Couldn't save — the viewer middleware may be down. Retry?");
		} finally {
			setSaving(false);
		}
	}, [picker, saving, story, variant, note]);

	const handleNewIteration = useCallback((): void => {
		if (annotations.length === 0) return;
		void fetch("/__annotations/round", { method: "POST" })
			.then((r) => r.json())
			.then((data: { state: AnnotationState }) => setState(data.state))
			.catch(() => undefined);
	}, [annotations.length]);

	// ---- Keyboard: Esc closes selection then disarms; Cmd/Ctrl+Enter saves
	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				if (picker.selected) {
					picker.clearSelection();
					setNote("");
					setError(null);
					armButtonRef.current?.focus();
				} else if (picker.armed) {
					picker.disarm();
					armButtonRef.current?.focus();
				}
			}
			if (picker.selected && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				void handleSave();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [picker, handleSave]);

	// ---- Overlay box: hover XOR held-selection XOR re-highlight ---------
	const hoverEl = picker.armed ? (picker.hover?.el ?? null) : null;
	const selectedEl = !hoverEl ? (picker.selected?.el ?? null) : null;
	const reHiEl = picker.reHighlightEl;

	return (
		<>
			<InspectorRail
				picker={picker}
				round={currentRound}
				annotations={annotations}
				note={note}
				onNoteChange={setNote}
				onSave={() => {
					void handleSave();
				}}
				saving={saving}
				error={error}
				onNewIteration={handleNewIteration}
				collapsed={collapsed}
				onToggleCollapsed={() => setCollapsed((c) => !c)}
				armButtonRef={armButtonRef}
			/>

			{/* Live overlay boxes — keyed by measureKey so a rail reflow re-measures. */}
			{hoverEl && (
				<HighlightLayer
					key={`hover-${measureKey}`}
					el={hoverEl}
					label={
						picker.hover ? `${picker.hover.target.component} · ${picker.hover.target.element}` : ""
					}
					tone="hover"
				/>
			)}
			{selectedEl && (
				<HighlightLayer
					key={`sel-${measureKey}`}
					el={selectedEl}
					label={
						picker.selected
							? `${picker.selected.target.component} · ${picker.selected.target.element}`
							: ""
					}
					tone="selected"
				/>
			)}
			{reHiEl &&
				(() => {
					const t = resolveComponentTarget(reHiEl);
					return (
						<HighlightLayer
							key={`rehi-${measureKey}`}
							el={reHiEl}
							label={`${t.component} · ${t.element}`}
							tone="rehighlight"
						/>
					);
				})()}
		</>
	);
}
