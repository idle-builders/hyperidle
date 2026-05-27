/**
 * P5 FirstTimeHints — hint progress API routes.
 *
 * GET /api/hint-progress          — return all dismissed hints for the authenticated user
 * POST /api/hint-progress/:id/dismiss — record a hint dismissal (idempotent via 409)
 *
 * @lore P5: POST dismiss uses INSERT ... ON CONFLICT DO NOTHING to avoid
 * race conditions instead of a SELECT-then-INSERT pattern. The `changes()`
 * result (via db.run()) tells us whether the row was inserted (1) or already
 * existed (0), enabling 200 vs 409 differentiation without a second query.
 */

import { type HyperIdleDb, hintProgress } from "@hyperidle/db";
import { isHintId } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { HyperIdleEnv } from "../middleware/auth.js";

export function createHintRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	/**
	 * GET / — return all dismissed hints for the authenticated user.
	 *
	 * Response: { dismissed: Array<{ hintId: string; seenAt: string }> }
	 */
	router.get("/", async (c) => {
		const userId = c.get("userId");
		const rows = await db.select().from(hintProgress).where(eq(hintProgress.userId, userId));
		return c.json({
			dismissed: rows.map((r) => ({
				hintId: r.hintId,
				seenAt: r.seenAt,
			})),
		});
	});

	/**
	 * POST /:hintId/dismiss — record that the user has dismissed a hint.
	 *
	 * Returns { ok: true } on first dismiss.
	 * Returns 400 if hintId is not in the catalog.
	 * Returns 409 if the hint was already dismissed.
	 *
	 * @lore P5: We use INSERT OR IGNORE (drizzle `.onConflictDoNothing()`)
	 * followed by checking `changes` to determine success vs. already-dismissed.
	 * This avoids the SELECT-then-INSERT TOCTOU race condition flagged in review.
	 */
	router.post("/:hintId/dismiss", async (c) => {
		const userId = c.get("userId");
		const hintId = c.req.param("hintId");

		if (!isHintId(hintId)) {
			return c.json({ error: "Unknown hint ID", code: "VALIDATION_ERROR" }, 400);
		}

		// INSERT OR IGNORE — atomic, no race condition
		const result = db
			.insert(hintProgress)
			.values({
				userId,
				hintId,
				seenAt: new Date().toISOString(),
			})
			.onConflictDoNothing()
			.run();

		// result.changes is 1 if the row was inserted, 0 if it already existed
		if (result.changes === 0) {
			return c.json({ error: "Already dismissed", code: "CONFLICT" }, 409);
		}

		return c.json({ ok: true });
	});

	return router;
}
