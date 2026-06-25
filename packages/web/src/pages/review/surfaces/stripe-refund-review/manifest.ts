/**
 * AL5 — Stripe Refund Review surface manifest.
 *
 * First-party surface that specializes the action_operation canvas for Stripe
 * refunds. Wraps ReviewActionOperation, overriding `lead` and `footer` seams
 * with refund-specific content while forwarding all AL7 trust-first props.
 */

import type { SurfaceManifest } from "@hyperidle/shared";

export const stripeRefundReviewManifest: SurfaceManifest = {
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
};
