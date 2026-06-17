// AL1 — composition design. ONE coherent Subject (a product task's output) whose
// artifacts span building-block families, so the composition variants show real
// building blocks coming together into a whole review. The code artifact reuses
// the real <ReviewCodeDiff /> (its fixture IS this promo-checkout fix), so the
// expanded artifact is genuine + coherent; the rest render as collapsed rows.

import type { ToolId } from "./ToolLogo.js";

export type ArtifactKind = "code" | "data" | "action" | "visual";

export interface SubjectArtifactRow {
	readonly id: string;
	readonly kind: ArtifactKind;
	readonly tool: ToolId;
	readonly title: string;
	readonly summary: string;
	/** e.g. "+140 −31", "47/47", "$0 · staged", "3 regions". */
	readonly badge: string;
	readonly reviewed: boolean;
	/** the one expanded by default (renders its real building block). */
	readonly expanded?: boolean;
	/** needs-you flag on this artifact. */
	readonly needsYou?: string;
}

export interface IntentCondition {
	readonly text: string;
	readonly met: boolean;
}

export type NeedKind = "blast-radius" | "over-authority" | "unhandled-exception" | "unverified-claim";

export interface NeedItem {
	readonly kind: NeedKind;
	readonly label: string;
	readonly detail: string;
	readonly artifactId?: string;
}

export interface ReviewComment {
	readonly id: string;
	readonly author: string;
	readonly isAgent: boolean;
	readonly anchor?: string;
	readonly body: string;
	readonly ago: string;
	readonly blocking?: boolean;
}

export interface ReviewSubject {
	readonly workIdentity: string;
	readonly author: string;
	readonly reviewer: string;
	readonly standing: string;
	readonly blocking: boolean;
	readonly producedAgo: string;
	readonly costMoney: string;
	readonly costTokens: string;
	readonly tools: ReadonlyArray<ToolId>;
	readonly outcome: string;
	readonly intent: ReadonlyArray<IntentCondition>;
	readonly needs: ReadonlyArray<NeedItem>;
	readonly artifacts: ReadonlyArray<SubjectArtifactRow>;
	readonly conversation: ReadonlyArray<ReviewComment>;
}

export const REVIEW_SUBJECT: ReviewSubject = {
	workIdentity: "Fix expired-promo checkout — silent success → typed 422",
	author: "Atlas",
	reviewer: "You",
	standing: "Awaiting your verdict",
	blocking: true,
	producedAgo: "9 min ago",
	costMoney: "$4.20",
	costTokens: "310k tok",
	tools: ["github", "linear", "vercel"],
	outcome:
		"Root cause: an unhandled PromoExpiredError was swallowed by a catch-all, so expired codes silently 'succeeded'. Checkout now returns a typed 422 and shows an inline 'expired' message; tests pass. The prod deploy is staged and waiting on your approval.",
	intent: [
		{ text: "Expired codes show the user an error", met: true },
		{ text: "API returns a typed 422 (not silent 200)", met: true },
		{ text: "Regression test covers the expired path", met: true },
		{ text: "Deployed to production", met: false },
	],
	needs: [
		{
			kind: "unhandled-exception",
			label: "Prod deploy is staged, not done",
			detail: "Intent asked for prod; the deploy waits on your approve (it's the action below).",
			artifactId: "a_deploy",
		},
		{
			kind: "blast-radius",
			label: "Touches the checkout payment path",
			detail: "The fix lives in the shared OrderService — revenue-adjacent, high-traffic.",
			artifactId: "a_code",
		},
	],
	artifacts: [
		{
			id: "a_code",
			kind: "code",
			tool: "github",
			title: "packages/billing/promo-webhook.ts",
			summary: "The fix — rethrows the typed error instead of swallowing it",
			badge: "+140 −31",
			reviewed: false,
			expanded: true,
		},
		{
			id: "a_tests",
			kind: "data",
			tool: "github",
			title: "Test results · promo.expired",
			summary: "47 / 47 passing · coverage +0.4% · the expired path now covered",
			badge: "47/47",
			reviewed: true,
		},
		{
			id: "a_deploy",
			kind: "action",
			tool: "vercel",
			title: "Deploy promo fix to production",
			summary: "Promote the preview build to prod — live checkout starts returning 422 on approve",
			badge: "staged",
			reviewed: false,
			needsYou: "Irreversible-ish — live within ~1 min of approve",
		},
		{
			id: "a_visual",
			kind: "visual",
			tool: "vercel",
			title: "Checkout — expired code, before → after",
			summary: "Before: no feedback (the bug). After: inline 'This code expired on Apr 3'.",
			badge: "1 screen",
			reviewed: false,
		},
	],
	conversation: [
		{
			id: "c1",
			author: "You",
			isAgent: false,
			anchor: "PromoField.tsx:118",
			body: "Does the 422 copy match our checkout error style — dated string and all?",
			ago: "3 min ago",
			blocking: false,
		},
		{
			id: "c1r",
			author: "Atlas",
			isAgent: true,
			anchor: "PromoField.tsx:118",
			body: "Yes — it reuses the <CheckoutError> component and formats the date with the same `formatDate` helper. Screenshot is the 'after' visual below.",
			ago: "2 min ago",
		},
	],
};
