/**
 * AL5 — Stripe Refund Review surface manifest.
 *
 * First-party surface that specializes the action_operation canvas for Stripe
 * refunds. Wraps ReviewActionOperation, overriding `lead` and `footer` seams
 * with refund-specific content while forwarding all AL7 trust-first props.
 *
 * @lore AL5 FIX-2: Manifest data moved to @hyperidle/shared (FIRST_PARTY_SURFACE_MANIFESTS)
 * so server and web share a single source of truth. This file re-exports the
 * stripe-refund-review entry from that canonical list.
 */

import type { SurfaceManifest } from "@hyperidle/shared";
import { FIRST_PARTY_SURFACE_MANIFESTS } from "@hyperidle/shared";

// The canonical data lives in @hyperidle/shared. We extract the entry here for
// named re-export so all existing web importers continue to use the same symbol.
const entry = FIRST_PARTY_SURFACE_MANIFESTS.find((m) => m.id === "stripe-refund-review");
if (!entry)
	throw new Error("stripe-refund-review manifest missing from FIRST_PARTY_SURFACE_MANIFESTS");

export const stripeRefundReviewManifest: SurfaceManifest = entry;
