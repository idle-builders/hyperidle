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

export interface AnnotationTarget {
	/** Resolution chain: nearest fiber displayName||name → nearest [data-ds-component] → "unknown" */
	component: string;
	/** Corroboration: closest [data-ds-component] value, else null */
	dsComponent: string | null;
	/** Terse tag+class/text descriptor of the clicked DOM node */
	element: string;
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
