/**
 * AL5 (simplified + drop-in) — Named review surface registry.
 *
 * Two sources:
 * 1. REVIEW_SURFACE_REGISTRY — built-in static map (compile-time, wins on clash).
 * 2. RUNTIME_SURFACE_REGISTRY — folder surfaces loaded at boot from
 *    ~/.hyperidle/surfaces/ via the /api/surfaces HTTP route.
 *
 * Adding a built-in surface = write the component, add one line here, add an
 * entry to REVIEW_SURFACES in @hyperidle/shared, then rebuild/restart.
 *
 * Adding a folder surface = author builds with `npm run build-surface`, drops
 * the .js in ~/.hyperidle/surfaces/, restarts. No app rebuild.
 *
 * @lore AL5: The old model (DB adoptions, install CLI, manifest, surface-registry.ts,
 * resolve-surface.ts, SurfaceBoundary, slot-policy, surface-slots) was deleted.
 *
 * @lore AL5: getReviewSurface(name) returns undefined for unknown names — the caller
 * falls back to getReviewCanvas(kind). Unknown names never throw or show an error;
 * they silently degrade to the family canvas (safe floor).
 *
 * @lore AL5: Built-ins always win — REVIEW_SURFACE_REGISTRY is checked first.
 * This prevents a dropped surface from silently overriding a shipped built-in.
 */

import type { ReviewCanvasComponent } from "./review-artifact.js";
import { RUNTIME_SURFACE_REGISTRY } from "./surface-loader.js";
import { StripeRefundReview } from "./surfaces/stripe-refund-review/StripeRefundReview.js";

/**
 * Built-in static map: surface name → component.
 * Keys must match REVIEW_SURFACES[*].name in @hyperidle/shared exactly.
 */
export const REVIEW_SURFACE_REGISTRY: Record<string, ReviewCanvasComponent> = {
	"stripe-refund-review": StripeRefundReview as ReviewCanvasComponent,
};

/**
 * Look up a named surface component.
 *
 * Checks built-in registry first, then the runtime folder registry.
 * Returns undefined for unknown/null/undefined names — the caller should fall
 * back to getReviewCanvas(artifact.kind) in that case.
 */
export function getReviewSurface(
	name: string | null | undefined,
): ReviewCanvasComponent | undefined {
	if (!name) return undefined;
	// Built-in wins on name clash
	const builtin = REVIEW_SURFACE_REGISTRY[name];
	if (builtin) return builtin;
	// Fall through to runtime folder registry
	return RUNTIME_SURFACE_REGISTRY.get(name);
}
