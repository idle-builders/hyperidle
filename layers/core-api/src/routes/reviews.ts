import { findMessage } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import { Hono } from "hono";

/**
 * Reviews route: GET /api/reviews/:reviewMessageId
 *
 * Returns the review message payload.
 *
 * Returns 404 if the review message doesn't exist.
 *
 * @lore layer, never replace: a resolved artifact reference is APPENDED to
 * whatever `artifacts` the payload already carries (never in place of it).
 * Resolution against the artifacts table was removed when produced content
 * became a knowledge item — the stored payload is returned as-is.
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

		return c.json({ ...reviewPayload, threadId: reviewMsg.threadId });
	});

	return app;
}
