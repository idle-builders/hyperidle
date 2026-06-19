import type { ComposedReviewSubject } from "./review-composition.js";
import { AL2_REVIEW_SUBJECT } from "./review-subject.js";

function uniqueTools(artifacts: ReadonlyArray<{ readonly tool: string; readonly app: string }>): ReadonlyArray<string> {
	const seen = new Set<string>();
	return artifacts
		.map((a) => a.tool)
		.filter((tool) => {
			if (seen.has(tool)) return false;
			seen.add(tool);
			return true;
		});
}

/**
 * AL3 — canonical fixture for the review composition surface.
 * Reuses the AL2 canvas artifacts so the composition tests exercise real canvases.
 */
export const REVIEW_COMPOSITION_SUBJECT: ComposedReviewSubject = {
	id: "review:AL3:fixture",
	title: "Fix expired-promo checkout — silent success → typed 422",
	betId: "bet-123",
	betTitle: "Billing reliability",
	taskId: "task-456",
	taskTitle: "Fix expired-promo checkout",
	prompt:
		"Expired promo codes at checkout show no error — users think the code applied and are confused when the total doesn't change. Fix it: surface a clear error, and tell the user why it failed.",
	authorName: "Atlas",
	reviewerName: "You",
	blocking: true,
	producedAgo: "9 min ago",
	costMoney: "$4.20",
	costTokens: "310k tok",
	tools: uniqueTools(AL2_REVIEW_SUBJECT.artifacts),
	outcome:
		"Root cause: an unhandled PromoExpiredError was swallowed by a catch-all, so expired codes silently 'succeeded'. Checkout now returns a typed 422 and shows an inline 'expired' message; tests pass. The prod deploy is staged and waiting on your approval.",
	resultKpis: [
		{ label: "Silent failures", value: "0", delta: "was 31 users / 24h", good: true },
		{ label: "Tests", value: "47 / 47", delta: "+0.4% cov", good: true },
		{ label: "Checkout error path", value: "now covered", good: true },
	],
	intent: [
		{ text: "Expired codes show the user an error", met: true },
		{ text: "API returns a typed 422 (not silent 200)", met: true },
		{ text: "Regression test covers the expired path", met: true },
		{ text: "Deployed to production", met: false },
	],
	needs: [
		{
			id: "n-1",
			kind: "unhandled-exception",
			label: "Prod deploy is staged, not done",
			detail: "Intent asked for prod; the deploy waits on your approve.",
			artifactId: "artifact:action:1",
		},
		{
			id: "n-2",
			kind: "blast-radius",
			label: "Touches the checkout payment path",
			detail: "The fix lives in the shared OrderService — revenue-adjacent, high-traffic.",
			artifactId: "artifact:code:1",
		},
	],
	artifacts: AL2_REVIEW_SUBJECT.artifacts,
	conversation: [
		{
			id: "c1",
			author: "You",
			authorIsAgent: false,
			body: "Does the 422 copy match our checkout error style — dated string and all?",
			ago: "3 min ago",
			refs: [{ kind: "line", label: "PromoField.tsx:118" }],
		},
		{
			id: "c1r",
			author: "Atlas",
			authorIsAgent: true,
			body: "Yes — it reuses the <CheckoutError> component and formats the date with the same `formatDate` helper. Screenshot is the 'after' visual below.",
			ago: "2 min ago",
		},
	],
};
