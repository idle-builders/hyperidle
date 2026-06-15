/**
 * AJ5 — resolve-component.ts
 *
 * Resolves the nearest React component identity and element descriptor for a
 * clicked DOM node in the design-system viewer.
 *
 * Resolution chain for `target.component` (single, non-ambiguous):
 *   1. Nearest React fiber: walk node.__reactFiber$* upward via .return, collect
 *      the first fiber whose .type is a function/class (skip host string types),
 *      use type.displayName ?? type.name.
 *   2. ELSE: nearest [data-ds-component] attribute value (via closest()).
 *   3. ELSE: literal "unknown".
 *
 * The resolved `component` is echoed VERBATIM in the popover header. When it is
 * "unknown" (no fiber, no data-ds) OR resolved only from data-ds (no fiber key),
 * that weak label surfaces unmodified so the founder sees resolution was thin.
 *
 * @lore AJ5 FIBER-KEY BRITTLENESS: React attaches fiber data to DOM nodes via a
 * property whose name starts with "__reactFiber$" followed by a bundle-unique
 * random suffix (e.g. "__reactFiber$abc123"). This is a React INTERNAL — not
 * part of the public API. The suffix can change between React versions or between
 * production and development bundles. We resolve the key by scanning
 * Object.keys(node) for a "__reactFiber$" prefix rather than hardcoding the
 * suffix. This is intentionally version-coupled to React 19 (the version used
 * in this monorepo). If React changes the internal property naming scheme, this
 * fiber walk will silently fail and fall through to [data-ds-component] or
 * "unknown" — the graceful fallback is the correct behavior. Update this comment
 * and the cast if the React version or fiber shape changes.
 *
 * @lore AJ5 DEV-ONLY: This module runs only in the Vite dev viewer at :8098,
 * never in a production bundle. The fiber key scanning is safe in dev but would
 * be meaningless in a minified production build anyway.
 */

import type { AnnotationTarget } from "./types.js";

// ---------------------------------------------------------------------------
// Fiber type shape (minimal, for the cast below)
// ---------------------------------------------------------------------------

/**
 * Minimal shape of a React fiber node for our traversal needs.
 *
 * @lore AJ5 FIBER-CAST: We cast the raw fiber object to this interface.
 * This is the ONE documented unsafe cast in the codebase — it is unavoidable
 * because React fibers are not typed publicly. The cast is narrow (only the
 * fields we actually use) and is documented with this lore comment.
 * `type` is `unknown` to prevent further unsafe access downstream; we
 * narrow it with typeof checks before use.
 */
interface ReactFiberNode {
	type: unknown;
	return: ReactFiberNode | null;
}

// ---------------------------------------------------------------------------
// Fiber resolution
// ---------------------------------------------------------------------------

/** Find the __reactFiber$* key on a DOM element by scanning Object.keys. */
function getFiberKey(node: Element): string | null {
	const keys = Object.keys(node);
	for (const key of keys) {
		if (key.startsWith("__reactFiber$")) {
			return key;
		}
	}
	return null;
}

/**
 * Walk the fiber tree upward from the given fiber, collecting the first
 * fiber whose `.type` is a function or class (i.e. a React component, not
 * a host element like "div" or "button").
 *
 * Returns the component displayName or name, or null if none found.
 */
function walkFiberForComponent(fiber: ReactFiberNode): string | null {
	let current: ReactFiberNode | null = fiber;
	while (current !== null) {
		const t = current.type;
		if (typeof t === "function") {
			// Could be a function component or class component.
			// displayName is set by React DevTools / forwardRef / memo etc.
			const name =
				(t as { displayName?: string; name?: string }).displayName ||
				(t as { displayName?: string; name?: string }).name ||
				null;
			if (name) return name;
		}
		current = current.return;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Element descriptor
// ---------------------------------------------------------------------------

/**
 * Build a terse tag+class/text descriptor for the clicked node.
 *
 * Format: `tag.class1.class2 "short text"` (text only for leaf nodes, capped at 20 chars).
 */
function buildElementDescriptor(node: Element): string {
	const tag = node.tagName.toLowerCase();
	const classes = Array.from(node.classList)
		.slice(0, 3)
		.map((c) => `.${c}`)
		.join("");
	const text = node.textContent?.trim() ?? "";
	const shortText = text.length > 0 && text.length <= 30 ? ` "${text}"` : "";
	return `${tag}${classes}${shortText}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the annotation target for a clicked DOM element.
 *
 * See module-level doc for the resolution chain.
 */
export function resolveComponentTarget(node: Element): AnnotationTarget {
	// Always compute dsComponent independently (corroboration field)
	const dsComponentAttr = node.closest("[data-ds-component]")?.getAttribute("data-ds-component");
	const dsComponent = dsComponentAttr ?? null;

	// Step 1: Fiber walk
	const fiberKey = getFiberKey(node);
	let component: string | null = null;

	if (fiberKey !== null) {
		// Cast is documented above — the ONE narrow unsafe cast in this module.
		const fiber = (node as unknown as Record<string, unknown>)[fiberKey] as ReactFiberNode;
		component = walkFiberForComponent(fiber);
	}

	// Step 2: data-ds-component fallback
	if (component === null) {
		component = dsComponent;
	}

	// Step 3: "unknown" fallback
	if (component === null) {
		component = "unknown";
	}

	// Build element descriptor
	const element = buildElementDescriptor(node);

	return { component, dsComponent, element };
}
