/**
 * AL5 — Review Surface shared types.
 *
 * Shared because both the web registry loader and the server adoption resolver
 * reference the *shape*; the **component** stays in web.
 *
 * @lore AL5: NO component reference here — shared has no React. The registry
 * (web) joins manifest.id → component. Same split as KindDefinition (schema in
 * shared, renderer in web).
 */

import type { TrustTier } from "./connection.js";

/**
 * The 9 review canvas kinds from AL2. Moved here so shared can reference the
 * union without importing from web (web → shared direction is safe; shared ↛ web).
 *
 * @lore AL5 A2: ReviewCanvasKind in web/review-artifact.ts re-exports from here.
 * The const here is the authority; web's union type is derived from it.
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

/** The addressable review situation: a (tool, kind) pair. */
export interface SurfaceSituation {
	readonly tool: string; // "stripe"
	readonly kind: ReviewCanvasKind; // "action_operation"
}

/** Where the surface sits on its base canvas. CLOSED (concept). */
export const LAYERING_MODES = ["wrap", "eject"] as const;
export type LayeringMode = (typeof LAYERING_MODES)[number];

/** Who authored it. CLOSED. Distinct from TrustTier (vetted|community). */
export const SURFACE_PROVENANCE = ["first-party", "community"] as const;
export type SurfaceProvenance = (typeof SURFACE_PROVENANCE)[number];

/**
 * A community registry pointer — a URL serving a `surface-registry.json` index
 * (an array of SurfaceManifest + a resolvable component module URL).
 *
 * @lore AL5 §3.2: This type is consumed by the browse dialog's "add a registry URL"
 * read path (B5 displays remote manifests). The knip guard requires a real importer.
 */
export interface CommunityRegistryIndex {
	readonly url: string;
	readonly manifests: readonly SurfaceManifest[];
}

/**
 * The descriptor that accompanies a review-surface component. Mirrors a shadcn
 * registry-item.json: an id, the base canvas it specializes (registryDependency),
 * npm deps, provenance/trust, version, and bundled sample data for preview.
 */
export interface SurfaceManifest {
	/** Stable registry id, namespaced for community: "stripe-refund-review" | "@acme/figma-review". */
	readonly id: string;
	readonly title: string;
	readonly description: string;
	/** "Name <email>" (shadcn author convention). */
	readonly author: string;
	/** semver. Adoptions PIN this. */
	readonly version: string;
	/** The base canvas it specializes — the shadcn `registryDependencies` of the floor. */
	readonly baseCanvas: ReviewCanvasKind;
	readonly layering: LayeringMode;
	readonly provenance: SurfaceProvenance;
	readonly trustTier: TrustTier; // {vetted, community} — reused from AN, not redefined
	/** npm runtime deps, shadcn-style "pkg@1.2.3". Informational at AL5 (in-repo build). */
	readonly dependencies?: readonly string[];
	/** The (tool, kind) situations this surface is BUILT for — discovery hint, NOT auto-apply.
	 *  Adoption is still an explicit human choice; this only pre-filters the browse dialog. */
	readonly situations: readonly SurfaceSituation[];
	/** Bundled sample fixture id for the preview (renders the surface's .stories.tsx). */
	readonly sampleFixture: string;
}

/**
 * The flat display shape for an adoption, server-joined against the registry
 * for surfaceTitle/baseCanvas.
 *
 * Architecture §5: server-joined display shape, never carries a secret.
 */
export interface AdoptionView {
	readonly id: string;
	readonly tool: string;
	readonly kind: ReviewCanvasKind;
	readonly surfaceId: string;
	readonly pinnedVersion: string;
	readonly provenance: SurfaceProvenance;
	readonly trustTier: TrustTier;
	readonly surfaceTitle: string;
	readonly baseCanvas: ReviewCanvasKind;
}

/**
 * First-party surface manifests — single source of truth shared by the web
 * surface-registry and the server surface-adoptions validator.
 *
 * @lore AL5 FIX-2: Previously the server inlined a duplicate copy of these
 * manifests in surface-adoptions.ts. Moving here eliminates drift between the
 * web manifest.ts files and the server validator. Neither side imports from the
 * other; both import from shared (web → shared and server → shared are both
 * safe directions). NO component references here — shared has no React.
 */
export const FIRST_PARTY_SURFACE_MANIFESTS: readonly SurfaceManifest[] = [
	{
		id: "stripe-refund-review",
		title: "Stripe Refund Review",
		description:
			"Specializes the action_operation canvas for Stripe refunds with a refund-specific lead summary and routing note.",
		author: "HyperIdle <hi@hyperidle.com>",
		version: "1.0.0",
		baseCanvas: "action_operation",
		layering: "wrap",
		provenance: "first-party",
		trustTier: "vetted",
		situations: [{ tool: "stripe", kind: "action_operation" }],
		sampleFixture: "stripe-refund",
	},
];
