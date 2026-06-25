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

import type { ComponentType } from "react";
import type { SurfaceManifest } from "@hyperidle/shared";
import type { ReviewCanvasComponent } from "../review-artifact.js";
import type { ActionOperationCanvasProps } from "../ReviewActionOperation.js";
import { stripeRefundReviewManifest } from "./stripe-refund-review/manifest.js";
import { StripeRefundReview } from "./stripe-refund-review/StripeRefundReview.js";

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
	manifest: stripeRefundReviewManifest as SurfaceManifest & { readonly baseCanvas: "action_operation" },
	component: StripeRefundReview,
};

const FIRST_PARTY: ReadonlyArray<SurfaceRegistryEntry> = [stripeRefundEntry];

// ── Registry Map ─────────────────────────────────────────────────────────────

/** id → entry. Community URL-registries layer on top (§3.2). */
const REGISTRY = new Map<string, SurfaceRegistryEntry>(
	FIRST_PARTY.map((e) => [e.manifest.id, e]),
);

// ── Public API ────────────────────────────────────────────────────────────────

export function getSurfaceEntry(id: string): SurfaceRegistryEntry | undefined {
	return REGISTRY.get(id);
}

export function listSurfaces(): ReadonlyArray<SurfaceRegistryEntry> {
	return [...REGISTRY.values()];
}
