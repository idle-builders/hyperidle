import { findMessage } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import * as work from "@hyperidle/work";
import { Hono } from "hono";

/**
 * Reviews route: GET /api/reviews/:reviewMessageId
 *
 * Returns a ComposedReviewSubject-shaped response from the review message payload.
 * Optionally resolves an artifactRef nested on the payload to a full artifact entry.
 *
 * Returns 404 if the review message doesn't exist.
 */

const FIXTURE_REVIEW = {
	id: "review:AL3:fixture",
	// `ComposedReviewSubject.threadId` is a required string — `ReviewPage`
	// fetches and posts to it directly (never guessing via a host lookup).
	// The fixture needs its own value so this loader's contract stays total
	// even on the demo path: without it the client's verdict guard (which
	// checks `reviewSubject`, not `threadId`) would let a POST reach
	// `/api/threads/undefined/messages`.
	threadId: "thread:AL3:fixture",
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
	tools: ["github", "linear", "vercel", "quickbooks", "stripe", "mailchimp", "figma", "zendesk"],
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
	artifacts: [] as unknown[],
	conversation: [],
};

export function createReviewRoutes(db: HyperIdleDb): Hono {
	const app = new Hono();

	app.get("/:reviewMessageId", async (c) => {
		const reviewMessageId = c.req.param("reviewMessageId");

		// Stub fixture path for design/demo (plan §7: keep the stub data).
		if (reviewMessageId === "rev-1") {
			return c.json(FIXTURE_REVIEW);
		}

		// Load the review message to confirm it exists.
		const reviewMsg = await findMessage(db, { id: reviewMessageId });

		if (!reviewMsg) {
			return c.json({ error: "review_not_found" }, 404);
		}

		const reviewPayload = JSON.parse(reviewMsg.payload) as Record<string, unknown>;

		// Resolve an optional artifactRef to a full artifact entry and append it.
		//
		// @lore layer, never replace: a resolved `artifactRef` is APPENDED to
		// whatever `artifacts` the payload already carries (never to an empty
		// list, and never in place of it).
		const artifactRef = reviewPayload.artifactRef as { readonly id?: unknown } | undefined;
		const artifactRefId = typeof artifactRef?.id === "string" ? artifactRef.id : undefined;
		const referencedArtifact = artifactRefId
			? await work.get(db, "artifact", artifactRefId)
			: undefined;

		if (!referencedArtifact) {
			return c.json({ ...reviewPayload, threadId: reviewMsg.threadId });
		}

		// `ReviewArtifact` (the shape the review UI renders every entry as,
		// `layers/core-ui/src/pages/review/review-artifact.ts`) requires
		// `tool`/`app`/`title`/`payload` — every entry is rendered through
		// `ToolLogo`/`KindBadge`/a canvas component with no per-field
		// optionality, so leaving any of them out crashes the page, not just
		// looks incomplete. A bare stored artifact has no per-tool
		// provenance (no SaaS connector produced it), so `tool`/`app` use
		// the same self-attributed sentinel the fixtures already use for
		// HyperIdle-native evidence (`"hyperidle"`/`"HyperIdle"`, see
		// `review-subject.ts`'s `outcomeArtifact`) rather than fabricating a
		// false external identity. `title` falls back to the artifact's own
		// id when it has no `label` — never blank. `sourceHref` is a real,
		// derivable value — the artifact's own permalink. `payload` is
		// intentionally opaque (`{}`).
		const resolved: Record<string, unknown> = {
			id: referencedArtifact.id,
			tool: "hyperidle",
			app: "HyperIdle",
			kind: referencedArtifact.kind,
			sourceHref: `/artifacts/${referencedArtifact.id}`,
			title: referencedArtifact.label ?? referencedArtifact.id,
			payload: {},
		};
		const existingArtifacts = Array.isArray(reviewPayload.artifacts)
			? (reviewPayload.artifacts as Array<Record<string, unknown>>)
			: [];
		return c.json({
			...reviewPayload,
			threadId: reviewMsg.threadId,
			artifacts: [...existingArtifacts, resolved],
		});
	});

	return app;
}
