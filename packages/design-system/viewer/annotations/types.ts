/**
 * AJ5 — Annotation system type contracts.
 *
 * These types are consumed by all annotation modules:
 *   annotation-store.ts (Node fs, server-side)
 *   request-handler.ts (pure adapter)
 *   resolve-component.ts (client, jsdom-testable)
 *   annotation-overlay.tsx (React client)
 *   vite-plugin-annotations.ts (dev middleware)
 */

/**
 * AJ7 — a re-resolvable descriptor so a saved note can re-find its element later.
 * Best-effort only (concept hard-rule #5): a miss degrades to "not visible", never errors.
 */
export interface AnnotationAnchor {
	/**
	 * Child-index path from the story root down to the element, root-most first.
	 * e.g. [0, 2, 1] = root.children[0].children[2].children[1]. Stable across
	 * re-render as long as sibling order is unchanged.
	 */
	path: number[];
	/** Resolved component name at capture time (corroboration; resolveAnchor prefers path). */
	component: string;
	/** Element descriptor at capture time (tag.class "text") — last-resort match + display. */
	element: string;
}

export interface AnnotationTarget {
	/** Resolution chain: nearest fiber displayName||name → nearest [data-ds-component] → "unknown" */
	component: string;
	/** Corroboration: closest [data-ds-component] value, else null */
	dsComponent: string | null;
	/** Terse tag+class/text descriptor of the clicked DOM node */
	element: string;
	/**
	 * AJ7, OPTIONAL. Absent on all AJ5 annotations (back-compat). Present → re-highlight
	 * can re-resolve the element. Absent → re-highlight is honestly "not visible".
	 */
	anchor?: AnnotationAnchor;
}

export interface Annotation {
	id: string;
	/** ISO 8601 timestamp */
	createdAt: string;
	story: string;
	variant: string;
	note: string;
	target: AnnotationTarget;
}

export interface Round {
	round: number;
	/** ISO 8601 timestamp when this round was started */
	startedAt: string;
	annotations: Annotation[];
}

export interface AnnotationState {
	currentRound: number;
	rounds: Round[];
}

/** POST body from the client overlay */
export interface AnnotationInput {
	story: string;
	variant: string;
	note: string;
	target: AnnotationTarget;
}
