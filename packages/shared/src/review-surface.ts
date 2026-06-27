/**
 * AL5 (simplified) — Review surface shared types.
 *
 * Contains only what shared needs to export:
 * 1. The 9 canvas kinds (REVIEW_CANVAS_KINDS / ReviewCanvasKind).
 * 2. The named surface catalog (REVIEW_SURFACES) — a tiny static list the
 *    agent uses when calling create_artifact with surface=.
 *
 * All machinery (SurfaceManifest, REGISTERED_SURFACE_MANIFESTS, AdoptionView,
 * registry-index, add-install) has been removed (AL5 simplification).
 *
 * @lore AL5: The old model (DB adoptions, install CLI, manifest, slot/wrap/eject)
 * was replaced with a dead-simple named-surface registry in the web package:
 * `REVIEW_SURFACE_REGISTRY: Record<string, ReviewCanvasComponent>`.
 * Shared only provides the surface NAME list so the agent can reference names
 * in create_artifact's `surface` param without importing from web.
 */

/**
 * The 9 review canvas kinds from AL2. Shared so web's `review-artifact.ts`
 * and server-side code can reference the union without importing from web.
 *
 * @lore AL5: Previously exported alongside SurfaceManifest etc. The kinds
 * themselves remain valid — only the surface-install machinery is removed.
 */
export const REVIEW_CANVAS_KINDS = [
	"outcome_summary",
	"field_change_set",
	"action_operation",
	"rendered_in_context",
	"metrics_moved",
	"visual_diff",
	"code_diff",
	"batch",
	"browser_preview",
] as const;

export type ReviewCanvasKind = (typeof REVIEW_CANVAS_KINDS)[number];

/**
 * Catalog of named review surfaces available at runtime.
 *
 * The agent uses this when calling create_artifact with an optional `surface`
 * param. Web's REVIEW_SURFACE_REGISTRY keys must match these names exactly.
 * Adding a surface = write the component, add it to REVIEW_SURFACE_REGISTRY,
 * and add one entry here. Config-time, no DB, no install.
 */
export interface ReviewSurfaceCatalogEntry {
	/** Stable name matching the key in REVIEW_SURFACE_REGISTRY. */
	readonly name: string;
	/** Short description for the agent. */
	readonly description: string;
}

export const REVIEW_SURFACES: ReadonlyArray<ReviewSurfaceCatalogEntry> = [
	{
		name: "stripe-refund-review",
		description:
			"Specializes the action_operation canvas for Stripe refunds with a refund-specific lead summary and routing note.",
	},
];
