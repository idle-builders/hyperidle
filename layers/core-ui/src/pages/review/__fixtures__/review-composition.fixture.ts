import type { BlockId } from "../../../block/types.js";
import type { ReviewArtifact } from "../review-artifact.js";
import type { ComposedReviewSubject } from "../review-composition.js";
import { AL2_REVIEW_SUBJECT } from "./review-subject.js";

function uniqueTools(
	artifacts: ReadonlyArray<{ readonly tool: string; readonly app: string }>,
): ReadonlyArray<string> {
	const seen = new Set<string>();
	return artifacts
		.map((a) => a.tool)
		.filter((tool) => {
			if (seen.has(tool)) return false;
			seen.add(tool);
			return true;
		});
}

function summarizeArtifact(artifact: ReviewArtifact): { summary: string; badge: string } {
	switch (artifact.kind) {
		case "code_diff": {
			const p = artifact.payload as {
				description: string;
				trivia?: { added: number; removed: number };
			};
			return {
				summary: p.description,
				badge: `+${p.trivia?.added ?? 0} −${p.trivia?.removed ?? 0}`,
			};
		}
		case "action_operation": {
			const p = artifact.payload as {
				verb: string;
				amountWire?: { formatted: string };
				blastRadius?: ReadonlyArray<string>;
			};
			return { summary: p.blastRadius?.[0] ?? p.verb, badge: p.amountWire?.formatted ?? "" };
		}
		case "field_change_set": {
			const p = artifact.payload as { fields: ReadonlyArray<unknown>; unchangedCount: number };
			return {
				summary: `${p.fields.length} fields changed`,
				badge: `${p.unchangedCount} unchanged`,
			};
		}
		case "metrics_moved": {
			const p = artifact.payload as { period: string; headlines: ReadonlyArray<unknown> };
			return {
				summary: p.period,
				badge: `${p.headlines.length} headline${p.headlines.length === 1 ? "" : "s"}`,
			};
		}
		case "rendered_in_context": {
			const p = artifact.payload as { body: string; renderMode: string };
			return { summary: p.body, badge: p.renderMode };
		}
		case "visual_diff": {
			const p = artifact.payload as {
				after: { label: string };
				diffRegions: ReadonlyArray<unknown>;
			};
			return {
				summary: p.after.label,
				badge: `${p.diffRegions.length} region${p.diffRegions.length === 1 ? "" : "s"}`,
			};
		}
		case "batch": {
			const p = artifact.payload as { rollup: { total: number } };
			return { summary: "Batch review", badge: `${p.rollup.total} items` };
		}
		case "browser_preview": {
			const p = artifact.payload as { previewBody: string };
			return { summary: p.previewBody, badge: "preview" };
		}
		case "outcome_summary": {
			return { summary: "Outcome summary", badge: "" };
		}
		default: {
			return { summary: "", badge: "" };
		}
	}
}

const composedArtifacts: ComposedReviewSubject["artifacts"] = AL2_REVIEW_SUBJECT.artifacts.map(
	(a) => ({
		...a,
		...summarizeArtifact(a),
	}),
);

/**
 * AL3 — canonical fixture for the review composition surface.
 * Reuses the AL2 canvas artifacts so the composition tests exercise real canvases.
 */
export const REVIEW_COMPOSITION_SUBJECT: ComposedReviewSubject = {
	id: "review:AL3:fixture",
	title: "Fix expired-promo checkout — silent success → typed 422",
	threadId: "thread-review-1",
	parentTaskId: "task-parent-1",
	betTitle: "Billing reliability",
	taskId: "task-456",
	taskTitle: "Fix expired-promo checkout",
	prompt:
		"Expired promo codes at checkout show no error — users think the code applied and are confused when the total doesn't change. Fix it: surface a clear error, and tell the user why it failed.",
	authorName: "Atlas",
	reviewerName: "You",
	blocking: true,
	producedAgo: "9 min ago",
	tokens: "310k tok",
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
	artifacts: composedArtifacts,
	conversation: [
		{
			id: "c1",
			author: "You",
			authorIsAgent: false,
			body: "Does the 422 copy match our checkout error style — dated string and all?",
			ago: "3 min ago",
			refs: [{ kind: "artifact", label: "PromoField.tsx:118" }],
			anchor: {
				artifactId: "artifact:code:1",
				blockId: "block:review-code:promo-webhook.ts:118" as BlockId,
				spotLabel: "PromoField.tsx:118",
			},
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
