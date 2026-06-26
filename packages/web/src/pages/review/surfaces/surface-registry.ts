/**
 * AL5 — Review Surface registry.
 *
 * Maps surface manifest ids → entries (manifest + component). First-party
 * surfaces are registered in FIRST_PARTY. Community surfaces are pointed-to
 * by URL (§3.2) but must be copied into the repo before they're active.
 *
 * @lore AL5 WARN-1: The SurfaceRegistryEntry discriminated union is keyed on
 * baseCanvas because action_operation surfaces carry extra AL7 props in their
 * component type (ActionOperationCanvasProps). A generic registry entry using
 * ReviewCanvasComponent would silently accept a surface with the wrong prop shape.
 *
 * @lore AL5: Uses a Map (not import.meta.glob) so it works in vitest/jsdom
 * tests without Vite. The Map lookup is O(1) and deterministic — no scoring,
 * no auto-selection. Concept hard-rule #2: at-most-one adoption per situation;
 * the registry only provides the component, the DB unique index enforces the limit.
 */

import type { SurfaceManifest } from "@hyperidle/shared";
import type { ComponentType } from "react";
import type { ActionOperationCanvasProps } from "../ReviewActionOperation.js";
import type { ReviewCanvasComponent } from "../review-artifact.js";
import { stripeRefundReviewManifest } from "./stripe-refund-review/manifest.js";
import { StripeRefundReview } from "./stripe-refund-review/StripeRefundReview.js";
// @lore AL5 INSTALL-LOOP: This import runs all registerSurface() calls from
// installed community surfaces. Initially empty (no-op); surface:add appends
// import lines here so each installed surface is registered at module-load time.
// The file is committed — no Vite magic, no import.meta.glob, works in vitest.
import "./surface-registry.generated.js";

// ── Registry entry type ──────────────────────────────────────────────────────

/**
 * Discriminated union keyed on baseCanvas.
 *
 * action_operation surfaces carry ActionOperationCanvasProps (wider than
 * ReviewCanvasComponent) because they must forward AL7 trust-first props.
 * All other canvases (fast-follow in later workpackages) use ReviewCanvasComponent.
 */
export type SurfaceRegistryEntry =
	| {
			readonly manifest: SurfaceManifest & { readonly baseCanvas: "action_operation" };
			readonly component: ComponentType<ActionOperationCanvasProps>;
	  }
	| {
			readonly manifest: SurfaceManifest; // generic 8 canvases (fast-follow)
			readonly component: ReviewCanvasComponent;
	  };

// ── First-party entries ──────────────────────────────────────────────────────

// @lore AL5: The StripeRefundReview entry must be typed as the action_operation
// discriminant so TypeScript knows it carries ActionOperationCanvasProps. A plain
// SurfaceRegistryEntry array would trigger the generic branch (ReviewCanvasComponent)
// which is structurally incompatible with ActionOperationCanvasProps.
const stripeRefundEntry: SurfaceRegistryEntry = {
	manifest: stripeRefundReviewManifest as SurfaceManifest & {
		readonly baseCanvas: "action_operation";
	},
	component: StripeRefundReview,
};

// ── Registry Map ─────────────────────────────────────────────────────────────

/**
 * id → entry. Mutable so registerSurface() can add installed surfaces at
 * module-load time (generated registration files call registerSurface on import).
 *
 * @lore AL5 INSTALL-LOOP: Uses a mutable Map (not a frozen const array) so
 * that the `surface:add` CLI can generate a registration file that calls
 * registerSurface() when imported. The Map is still O(1) and deterministic
 * — no scoring, no auto-selection. Community surfaces require an explicit
 * adoption (DB row) before they are used; the registry only provides the lookup.
 */
const REGISTRY = new Map<string, SurfaceRegistryEntry>([
	[stripeRefundEntry.manifest.id, stripeRefundEntry],
]);

// ── Public API ────────────────────────────────────────────────────────────────

export function getSurfaceEntry(id: string): SurfaceRegistryEntry | undefined {
	return REGISTRY.get(id);
}

export function listSurfaces(): ReadonlyArray<SurfaceRegistryEntry> {
	return [...REGISTRY.values()];
}

/**
 * Register an installed surface so it appears in getSurfaceEntry / listSurfaces.
 *
 * Called by auto-generated `surfaces/<id>/register.ts` files that `surface:add`
 * creates. Importing that file from surface-registry.ts (or via a generated
 * index) wires the surface into the registry at module-load time — no runtime eval.
 *
 * @lore AL5 INSTALL-LOOP: This is the registration half of the install→adopt loop.
 * install copies source files; the generated register.ts calls registerSurface();
 * surface-registry.ts imports the generated index; rebuild makes it active.
 * The server-side registry is kept in sync by the `add` CLI also appending the
 * manifest to FIRST_PARTY_SURFACE_MANIFESTS in @hyperidle/shared/review-surface.ts.
 *
 * WARN-1 preserved: callers that supply an action_operation baseCanvas must cast
 * the component to ComponentType<ActionOperationCanvasProps>; registerSurface
 * accepts ReviewCanvasComponent for the generic path.
 */
export function registerSurface(manifest: SurfaceManifest, component: ReviewCanvasComponent): void {
	if (REGISTRY.has(manifest.id)) {
		// Idempotent: re-registering the same id (e.g. HMR or double-import) is a no-op.
		return;
	}
	REGISTRY.set(manifest.id, { manifest, component });
}

/**
 * Returns all registered manifests (first-party + installed community).
 * Used by the server-side registry to keep browse/adopt in sync with installed surfaces.
 *
 * @lore AL5 INSTALL-LOOP: OFFICIAL_REGISTRY_INDEX.surfaces is derived from
 * FIRST_PARTY_SURFACE_MANIFESTS (a static constant in shared). For an installed
 * surface to appear in the browse list AND be adoptable (POST 201), the `add` CLI
 * must also append the manifest to FIRST_PARTY_SURFACE_MANIFESTS in shared.
 * This function provides the manifest list for the web browse dialog, which does
 * not go through the server registry.
 */
export function listRegisteredManifests(): ReadonlyArray<SurfaceManifest> {
	return [...REGISTRY.values()].map((e) => e.manifest);
}
