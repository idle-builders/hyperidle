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
 *   1. Walk `path` from root; if every index resolves → return it.
 *   2. ELSE querySelectorAll within root, pick the first whose resolved
 *      component === anchor.component AND element descriptor === anchor.element.
 *   3. ELSE return null (caller renders "not visible").
 */
export function resolveAnchor(anchor: AnnotationAnchor, root: HTMLElement): HTMLElement | null {
	// 1. Path walk.
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

	// 2. Component + element descriptor fallback.
	const all = root.querySelectorAll<HTMLElement>("*");
	for (const candidate of all) {
		const t = resolveComponentTarget(candidate);
		if (t.component === anchor.component && t.element === anchor.element) {
			return candidate;
		}
	}

	// 3. Unresolvable.
	return null;
}
