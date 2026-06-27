/**
 * AL5 (simplified) — Named review surface registry.
 *
 * A dead-simple static map: surface name → component. Mirrors canvas-registry.ts
 * exactly (no dynamic registration, no DB, no CLI, no manifest).
 *
 * Adding a surface = write the component, add one line here, add an entry to
 * REVIEW_SURFACES in @hyperidle/shared, then rebuild/restart. Config-time change.
 *
 * @lore AL5: The old model (DB adoptions, install CLI, manifest, surface-registry.ts,
 * resolve-surface.ts, SurfaceBoundary, slot-policy, surface-slots) was deleted.
 * This file is its entire replacement.
 *
 * @lore AL5: getReviewSurface(name) returns undefined for unknown names — the caller
 * falls back to getReviewCanvas(kind). Unknown names never throw or show an error;
 * they silently degrade to the family canvas (safe floor).
 */

import type { ReviewCanvasComponent } from "./review-artifact.js";
import { StripeRefundReview } from "./surfaces/stripe-refund-review/StripeRefundReview.js";

/**
 * Static map: surface name → component.
 *
 * Keys must match REVIEW_SURFACES[*].name in @hyperidle/shared exactly.
 */
export const REVIEW_SURFACE_REGISTRY: Record<string, ReviewCanvasComponent> = {
	"stripe-refund-review": StripeRefundReview as ReviewCanvasComponent,
};

/**
 * Look up a named surface component.
 *
 * Returns undefined for unknown/null/undefined names — the caller should fall
 * back to getReviewCanvas(artifact.kind) in that case.
 */
export function getReviewSurface(
	name: string | null | undefined,
): ReviewCanvasComponent | undefined {
	if (!name) return undefined;
	return REVIEW_SURFACE_REGISTRY[name];
}
