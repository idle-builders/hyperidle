/**
 * AL5 — Review Surface registry.
 *
 * Maps surface manifest ids → entries (manifest + component). First-party
 * surfaces are pre-seeded at module init. Community surfaces are registered
 * by auto-generated register.ts files imported via surface-registry.generated.ts.
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
 *
 * @lore AL5 TDZ-FIX: Registry state (REGISTRY map + registerSurface) lives in
 * surface-registry-api.ts. Generated register.ts files import from there, NOT
 * from this file. This avoids the ESM circular-import TDZ crash that would occur
 * if register.ts imported registerSurface from surface-registry.ts while
 * surface-registry.ts was still evaluating. See surface-registry-api.ts for detail.
 */

import type { SurfaceManifest } from "@hyperidle/shared";
import type { ReviewCanvasComponent } from "../review-artifact.js";
// @lore AL5 INSTALL-LOOP: This import runs all registerSurface() calls from
// installed community surfaces. Initially empty (no-op); surface:add appends
// import lines here so each installed surface is registered at module-load time.
// Safe because register.ts files import registerSurface from surface-registry-api.ts
// (not from this file) — no circular dependency, no TDZ.
import "./surface-registry.generated.js";
import { stripeRefundReviewManifest } from "./stripe-refund-review/manifest.js";
import { StripeRefundReview } from "./stripe-refund-review/StripeRefundReview.js";
import type { SurfaceRegistryEntry } from "./surface-registry-api.js";
import { REGISTRY, registerSurface } from "./surface-registry-api.js";

// ── Re-export SurfaceRegistryEntry type (owned by surface-registry-api.ts) ────

// @lore AL5 TDZ-FIX: SurfaceRegistryEntry lives in surface-registry-api.ts so
// generated register.ts files can import it without a cycle. We re-export it
// from here so all existing importers of surface-registry.ts continue to work.
export type { SurfaceRegistryEntry } from "./surface-registry-api.js";

// ── Seed first-party entries ──────────────────────────────────────────────────

// @lore AL5: The StripeRefundReview entry must be typed as the action_operation
// discriminant so TypeScript knows it carries ActionOperationCanvasProps. A plain
// SurfaceRegistryEntry array would trigger the generic branch (ReviewCanvasComponent)
// which is structurally incompatible with ActionOperationCanvasProps.
// @lore AL5 WARN-1: StripeRefundReview expects ActionOperationCanvasProps (not
// ReviewCanvasComponent). registerSurface accepts ReviewCanvasComponent for the
// generic branch. The cast is required; the discriminated union in SurfaceRegistryEntry
// ensures the wider type is preserved at lookup time.
registerSurface(
	stripeRefundReviewManifest as SurfaceManifest & {
		readonly baseCanvas: "action_operation";
	},
	StripeRefundReview as ReviewCanvasComponent,
);

// ── Public API ────────────────────────────────────────────────────────────────

export function getSurfaceEntry(id: string): SurfaceRegistryEntry | undefined {
	return REGISTRY.get(id);
}

export function listSurfaces(): ReadonlyArray<SurfaceRegistryEntry> {
	return [...REGISTRY.values()];
}

// Re-export registerSurface so existing callers (and tests) continue to work.
// The canonical implementation lives in surface-registry-api.ts.
export { registerSurface } from "./surface-registry-api.js";

/**
 * Returns all registered manifests (first-party + installed community).
 * Used by the server-side registry to keep browse/adopt in sync with installed surfaces.
 *
 * @lore AL5 INSTALL-LOOP: REGISTERED_SURFACE_MANIFESTS (a static constant in shared)
 * seeds the official registry index. For an installed surface to appear in the browse
 * list AND be adoptable (POST 201), the `add` CLI must also append the manifest to
 * REGISTERED_SURFACE_MANIFESTS in shared. This function provides the manifest list
 * for the web browse dialog, which does not go through the server registry.
 */
export function listRegisteredManifests(): ReadonlyArray<SurfaceManifest> {
	return [...REGISTRY.values()].map((e) => e.manifest);
}
