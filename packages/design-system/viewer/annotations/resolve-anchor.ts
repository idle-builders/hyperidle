/**
 * AJ7 — resolve-anchor.ts
 *
 * Build + re-resolve a best-effort structural anchor for an inspected element,
 * bounded by the story root. A saved note stores this anchor so a later hover can
 * re-find the element and draw the highlight fresh (no pins, no persisted geometry).
 *
 * @lore AJ7 WHY-CHILD-INDEX-PATH: the inspected stories have generated class names
 * and repeated structures (three identical BetCards). A positional child-index path
 * is the only descriptor that distinguishes betcards[0] from betcards[2]. A CSS
 * selector built from generated classes would be ambiguous or unstable. The
 * component+element fallback covers the case where the story re-renders with one
 * fewer sibling (the path shifts) but the target still exists.
 *
 * @lore AJ7 BEST-EFFORT: resolveAnchor NEVER throws and NEVER returns the wrong
 * element silently — the worst case is null ("not visible"). This honors concept
 * hard-rule #5 (anchor is best-effort, never load-bearing for correctness).
 */

import { resolveComponentTarget } from "./resolve-component.js";
import type { AnnotationAnchor } from "./types.js";

/**
 * Build the re-resolvable anchor for an element, bounded by the story root.
 * path = child-index chain root→el (excludes root itself); component + element
 * from resolveComponentTarget.
 */
export function computeAnchor(el: HTMLElement, root: HTMLElement): AnnotationAnchor {
	const path: number[] = [];
	let cur: HTMLElement | null = el;
	while (cur && cur !== root) {
		const parent: HTMLElement | null = cur.parentElement;
		if (!parent) break;
		const idx = Array.prototype.indexOf.call(parent.children, cur);
		path.unshift(idx);
		cur = parent;
	}
	const target = resolveComponentTarget(el);
	return { path, component: target.component, element: target.element };
}

/**
 * Re-find the element a saved anchor points to, within the current story root.
 * Strategy (best-effort, in order):
 *   1. PRIMARY — walk the child-index `path` from root; if every index resolves →
 *      return it. The path is the only descriptor that distinguishes betcards[0]
 *      from betcards[2] (WHY-CHILD-INDEX-PATH lore), so it is tried first and wins.
 *   2. FALLBACK (path shifted, e.g. a sibling removed) — collect every descendant
 *      whose resolved component === anchor.component AND element === anchor.element.
 *      • exactly one match → return it.
 *      • multiple matches (duplicate-component tree) → return the candidate whose
 *        OWN child-index path is closest (smallest distance) to anchor.path, so the
 *        re-highlight lands on the right instance, not always the first.
 *   3. ELSE return null (caller renders "not visible").
 *
 * @lore AJ7 DUPLICATE-SIBLING DISAMBIGUATION (SF-3): on stories with N identical
 * components the (component,element) descriptor is byte-identical across instances,
 * so the old "first match" fallback re-highlighted instance[0] even when the note
 * was on instance[2]. The path-distance tie-break keeps the hard-rule guarantee
 * ("never the wrong element") best-effort-true: it lands on the structurally nearest
 * surviving instance rather than guessing the first.
 */
export function resolveAnchor(anchor: AnnotationAnchor, root: HTMLElement): HTMLElement | null {
	// 1. PRIMARY: path walk.
	let cur: Element | null = root;
	let ok = true;
	for (const idx of anchor.path) {
		const next: Element | undefined = cur?.children[idx];
		if (!next) {
			ok = false;
			break;
		}
		cur = next;
	}
	if (ok && cur && cur !== root && cur instanceof HTMLElement) {
		return cur;
	}

	// 2. FALLBACK: component + element descriptor match, disambiguated by path distance.
	const matches: HTMLElement[] = [];
	for (const candidate of root.querySelectorAll<HTMLElement>("*")) {
		const t = resolveComponentTarget(candidate);
		if (t.component === anchor.component && t.element === anchor.element) {
			matches.push(candidate);
		}
	}
	if (matches.length === 0) return null;
	if (matches.length === 1) return matches[0] ?? null;

	// Multiple identical-descriptor candidates → pick the one whose own path is
	// structurally closest to the stored anchor.path (deterministic; ties keep the
	// earlier-in-document candidate via the strict < comparison).
	let best: HTMLElement | null = null;
	let bestDist = Number.POSITIVE_INFINITY;
	for (const candidate of matches) {
		const dist = pathDistance(computePath(candidate, root), anchor.path);
		if (dist < bestDist) {
			bestDist = dist;
			best = candidate;
		}
	}
	return best;
}

/** Child-index chain root→el (excludes root), root-most first. Mirrors computeAnchor's path. */
function computePath(el: HTMLElement, root: HTMLElement): number[] {
	const path: number[] = [];
	let cur: HTMLElement | null = el;
	while (cur && cur !== root) {
		const parent: HTMLElement | null = cur.parentElement;
		if (!parent) break;
		path.unshift(Array.prototype.indexOf.call(parent.children, cur));
		cur = parent;
	}
	return path;
}

/**
 * Distance between two child-index paths: positional index deltas plus a penalty per
 * length mismatch. 0 = identical. Smaller = structurally closer, so the nearest
 * surviving duplicate instance wins.
 */
function pathDistance(a: number[], b: number[]): number {
	const len = Math.max(a.length, b.length);
	let dist = 0;
	for (let i = 0; i < len; i++) {
		const av = a[i];
		const bv = b[i];
		if (av === undefined || bv === undefined) {
			dist += 100; // length mismatch penalty — depth difference dominates
		} else {
			dist += Math.abs(av - bv);
		}
	}
	return dist;
}
