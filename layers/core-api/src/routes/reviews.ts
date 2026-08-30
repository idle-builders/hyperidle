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

export function createReviewRoutes(db: HyperIdleDb): Hono {
	const app = new Hono();

	app.get("/:reviewMessageId", async (c) => {
		const reviewMessageId = c.req.param("reviewMessageId");

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
