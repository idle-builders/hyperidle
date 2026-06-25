/**
 * AL5 — Surface resolution (pure, deterministic, no scoring).
 *
 * `resolveSurface` maps (situation, adoption, base) → one of:
 *   - the adopted surface component (source:"adopted")
 *   - the base canvas component (source:"base", with optional degraded reason)
 *
 * This is a pure Map lookup, NOT a scoring/auto-match function. There is no
 * candidate set, no ranking — the adoption row IS the decision (made by a human
 * at adopt time). The `situations` field on a manifest only pre-filters the
 * browse dialog; it is never consulted here.
 *
 * @lore AL5 §4.2: Determinism = a Map lookup keyed by the explicit adoption row.
 * Concept hard-rule #2: no runtime auto-apply/scoring — pure lookup.
 */

import type { AdoptionView, SurfaceManifest, SurfaceSituation } from "@hyperidle/shared";
import type { ReviewCanvasComponent } from "../review-artifact.js";
import { getSurfaceEntry } from "./surface-registry.js";

export interface ResolvedSurface {
	/** The component to render — either the adopted surface or the base canvas. */
	readonly component: ReviewCanvasComponent;
	/** Whether the resolved component is the adopted surface or the base canvas. */
	readonly source: "adopted" | "base";
	/** Present when source === "adopted". */
	readonly manifest?: SurfaceManifest;
	/** Why we fell to base despite an adoption, or version note when still adopted. */
	readonly degraded?: "missing-surface" | "version-mismatch";
}

/**
 * Resolve which surface (or base canvas) to render for a given situation.
 *
 * @param situation - The (tool, kind) pair for the artifact being rendered.
 * @param adoption  - The team's adoption row for this situation (from GET /api/surface-adoptions).
 *                    Undefined = no adoption = render the floor.
 * @param base      - The base canvas component (from getReviewCanvas(kind)).
 *                    This is the floor — always renders if no surface is active.
 *
 * @lore AL5: Pure function — never mutates situation or adoption (invariant #5).
 * The result is stable across calls with the same inputs (Map lookup is deterministic).
 */
export function resolveSurface(
	_situation: SurfaceSituation,
	adoption: AdoptionView | undefined,
	base: ReviewCanvasComponent,
): ResolvedSurface {
	// No adoption → base canvas (floor-always-works).
	if (!adoption) {
		return { component: base, source: "base" };
	}

	// Look up the surface in the registry by the adoption's surfaceId.
	const entry = getSurfaceEntry(adoption.surfaceId);
	if (!entry) {
		// Adoption names a missing/unbuilt surfaceId — degrade to base.
		return { component: base, source: "base", degraded: "missing-surface" };
	}

	// Version pin check — informational at AL5 (single in-repo version per surface).
	// Record mismatch but still render the entry (not degraded to base at AL5).
	const degraded =
		entry.manifest.version !== adoption.pinnedVersion
			? ("version-mismatch" as const)
			: undefined;

	// Return the adopted surface. The component type here is ReviewCanvasComponent
	// for the registry's discriminated union. The render site (ReviewComposition.tsx §4.3)
	// calls the resolved component with the full branch props — it is NOT cast here.
	// @lore AL5: The cast is safe because the registry discriminated union ensures
	// action_operation entries carry ActionOperationCanvasProps (§A7 surface-registry.ts).
	// The render site's hard-branch already has the correct props in scope.
	return {
		component: entry.component as ReviewCanvasComponent,
		source: "adopted",
		manifest: entry.manifest,
		degraded,
	};
}
