/**
 * AJ7 — use-picker.ts
 *
 * The inspector engine over a live story root. Owns: armed state, one-shot
 * capturing click listener (AJ5 lore), hover target, held selection, deduped
 * ancestor breadcrumb, crumb re-point, and note re-highlight (with the in-DOM-but-
 * off-screen vs not-in-DOM split delegated to the overlay).
 *
 * @lore AJ7 NO-FROZEN-RECT: the picker stores HTMLElement references ONLY — never
 * a Rect. This is the STRUCTURAL guard against the founder's rejected frozen-box
 * drift: there is simply no rect in the engine to go stale. Rects are computed live
 * by useElementRect inside HighlightLayer. SUPERSEDES the prototype usePicker, which
 * stored { target, rect } and rendered the frozen rect verbatim.
 *
 * @lore AJ7 ONE-SHOT ARM (AJ5 lineage): on arm, a capturing click listener +
 * mousemove are attached to the STORY ROOT only (never document). The first
 * qualifying click detaches BOTH. Cleanup is idempotent so React 19 StrictMode's
 * double-invoke of the callback ref / effects cannot leave a dangling listener.
 *
 * @lore AJ7 DEV-ONLY: runs only in the :8098 viewer, never in a production bundle.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { computeAnchor, resolveAnchor } from "./resolve-anchor.js";
import { resolveComponentTarget } from "./resolve-component.js";
import type { Annotation, AnnotationTarget } from "./types.js";

/** Resolved hover/selection: the live element + its AnnotationTarget (incl. computed anchor). */
export interface PickTarget {
	target: AnnotationTarget;
	el: HTMLElement;
}

/** A breadcrumb crumb — already DEDUPED by the engine (design decision 5). */
export interface Crumb {
	el: HTMLElement;
	label: string;
	isCurrent: boolean;
	/** Stable React key — the crumb's depth from the story root (not an array index). */
	key: string;
}

export interface Picker {
	armed: boolean;
	arm(): void;
	disarm(): void;
	hover: PickTarget | null;
	selected: PickTarget | null;
	crumbs: Crumb[];
	selectCrumb(el: HTMLElement): void;
	reHighlightEl: HTMLElement | null;
	reHighlightMissing: boolean;
	beginReHighlight(a: Annotation): void;
	endReHighlight(): void;
	clearSelection(): void;
}

/** Build a PickTarget for an element: resolved component identity + computed anchor. */
function toPickTarget(el: HTMLElement, root: HTMLElement): PickTarget {
	const base = resolveComponentTarget(el);
	const anchor = computeAnchor(el, root);
	return { el, target: { ...base, anchor } };
}

/**
 * Build the deduped ancestor breadcrumb for `selected`, walking parentElement up to
 * (not past) the story root, root-most first. Dedupe rule (deterministic, design
 * decision 5): a crumb whose component label is byte-identical to the previously
 * KEPT crumb's label falls back to its element descriptor; if even that is
 * byte-identical, it is collapsed out. Result: `BetCard › div.head › span.title`
 * instead of `BetCard › BetCard › BetCard`.
 */
function buildCrumbs(selectedEl: HTMLElement, root: HTMLElement): Crumb[] {
	const chain: HTMLElement[] = [];
	let cur: HTMLElement | null = selectedEl;
	while (cur && cur !== root.parentElement) {
		chain.push(cur);
		if (cur === root) break;
		cur = cur.parentElement;
	}
	chain.reverse(); // root-most first

	const out: Crumb[] = [];
	let prevLabel: string | null = null;
	for (let depth = 0; depth < chain.length; depth++) {
		const el = chain[depth];
		if (!el) continue;
		const t = resolveComponentTarget(el);
		let label = t.component;
		if (label === prevLabel) {
			// Same component as the kept crumb → fall back to the element descriptor.
			label = t.element;
		}
		if (label === prevLabel) {
			// Even the descriptor is identical → collapse this crumb out entirely.
			continue;
		}
		out.push({ el, label, isCurrent: el === selectedEl, key: `d${depth}` });
		prevLabel = label;
	}
	return out;
}

export function usePicker(storyRoot: HTMLElement): Picker {
	const [armed, setArmed] = useState(false);
	const [hover, setHover] = useState<PickTarget | null>(null);
	const [selected, setSelected] = useState<PickTarget | null>(null);
	const [reHighlightEl, setReHighlightEl] = useState<HTMLElement | null>(null);
	const [reHighlightMissing, setReHighlightMissing] = useState(false);

	// Idempotent listener cleanup (StrictMode-safe).
	const cleanupRef = useRef<(() => void) | null>(null);

	const detach = useCallback((): void => {
		if (cleanupRef.current) {
			cleanupRef.current();
			cleanupRef.current = null;
		}
	}, []);

	const disarm = useCallback((): void => {
		setArmed(false);
		setHover(null);
		detach();
	}, [detach]);

	const arm = useCallback((): void => {
		setArmed(true);
		detach(); // idempotent — never stack listeners

		const onMove = (e: MouseEvent): void => {
			if (e.target instanceof HTMLElement && storyRoot.contains(e.target)) {
				setHover(toPickTarget(e.target, storyRoot));
			} else {
				setHover(null);
			}
		};

		const onClick = (e: MouseEvent): void => {
			// One-shot: detach BOTH listeners immediately.
			detach();
			setArmed(false);
			setHover(null);
			if (!(e.target instanceof HTMLElement)) return;
			e.preventDefault();
			e.stopPropagation();
			setSelected(toPickTarget(e.target, storyRoot));
		};

		storyRoot.addEventListener("mousemove", onMove);
		storyRoot.addEventListener("click", onClick, true);
		cleanupRef.current = (): void => {
			storyRoot.removeEventListener("mousemove", onMove);
			storyRoot.removeEventListener("click", onClick, true);
		};
	}, [storyRoot, detach]);

	// Unmount cleanup.
	useEffect(() => detach, [detach]);

	// @lore AJ7 UNMOUNT-CLEAR (SF-2): when a held element detaches from the DOM
	// (story re-render, variant nav, conditional sibling removal) the box must
	// disappear AND the selection clear — never a 0×0 ghost or a stale rail section
	// pointing at a gone element. useElementRect already nulls the box on a detached
	// node; this clears the engine state too. A MutationObserver on the story root
	// fires on subtree mutations; we re-check isConnected for the held/re-highlight
	// element and drop it if it is no longer connected. No-op when nothing is held.
	useEffect(() => {
		if (typeof MutationObserver === "undefined") return undefined;
		const mo = new MutationObserver(() => {
			setSelected((s) => (s && !s.el.isConnected ? null : s));
			setHover((h) => (h && !h.el.isConnected ? null : h));
			setReHighlightEl((el) => (el && !el.isConnected ? null : el));
		});
		mo.observe(storyRoot, { childList: true, subtree: true });
		return () => mo.disconnect();
	}, [storyRoot]);

	const clearSelection = useCallback((): void => {
		setSelected(null);
	}, []);

	const selectCrumb = useCallback(
		(el: HTMLElement): void => {
			setSelected(toPickTarget(el, storyRoot));
		},
		[storyRoot],
	);

	const beginReHighlight = useCallback(
		(a: Annotation): void => {
			const anchor = a.target.anchor;
			if (!anchor) {
				setReHighlightEl(null);
				setReHighlightMissing(true);
				return;
			}
			const el = resolveAnchor(anchor, storyRoot);
			if (!el) {
				setReHighlightEl(null);
				setReHighlightMissing(true);
				return;
			}
			setReHighlightEl(el);
			setReHighlightMissing(false);
		},
		[storyRoot],
	);

	const endReHighlight = useCallback((): void => {
		setReHighlightEl(null);
		setReHighlightMissing(false);
	}, []);

	const crumbs = selected ? buildCrumbs(selected.el, storyRoot) : [];

	return {
		armed,
		arm,
		disarm,
		hover,
		selected,
		crumbs,
		selectCrumb,
		reHighlightEl,
		reHighlightMissing,
		beginReHighlight,
		endReHighlight,
		clearSelection,
	};
}
