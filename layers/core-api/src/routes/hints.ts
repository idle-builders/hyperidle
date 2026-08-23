/**
 * P5 FirstTimeHints — hint progress API routes.
 *
 * GET /api/hint-progress          — return all dismissed hints for the authenticated user
 * POST /api/hint-progress/:id/dismiss — record a hint dismissal (idempotent via 409)
 *
 * @lore P5: POST dismiss uses INSERT ... ON CONFLICT DO NOTHING to avoid
 * race conditions instead of a SELECT-then-INSERT pattern. We use RETURNING
 * to detect whether the row was inserted (non-empty result) or already
 * existed (empty result), enabling 200 vs 409 differentiation without a second query.
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, hintProgress —
 * LAST sub-item): the raw `hintProgress` Drizzle calls moved to
 * `@hyperidle/users`'s `hint-progress.ts` (ruled owned by `users`, cascades
 * from `users.id`) — this route now calls `listDismissedHints`/`dismissHint`
 * instead of querying the table directly.
 *
 * @lore AU43 bundle-8: routes were removed by mistake — door audit marked
 * rows 126/127 as KEEP because useHints.tsx calls them. Restored here.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { isHintId } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model";
import { dismissHint, listDismissedHints } from "@hyperidle/users";
import { Hono } from "hono";

export function createHintRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	/**
	 * GET / — return all dismissed hints for the authenticated user.
	 * userId is set by the global auth middleware.
	 *
	 * Response: { dismissed: Array<{ hintId: string; seenAt: string }> }
	 */
	router.get("/", async (c) => {
		const userId = c.get("userId");
		const dismissed = await listDismissedHints(db, userId);
		return c.json({ dismissed });
	});

	/**
	 * POST /:hintId/dismiss — record that the user has dismissed a hint.
	 *
	 * Returns { ok: true } on first dismiss.
	 * Returns 400 if hintId is not in the catalog.
	 * Returns 409 if the hint was already dismissed.
	 *
	 * @lore P5 (PGlite migration): We use INSERT ... ON CONFLICT DO NOTHING with
	 * RETURNING to detect whether the row was inserted (non-empty result) or already
	 * existed (empty result). This avoids the SELECT-then-INSERT TOCTOU race condition
	 * and does not rely on the SQLite-only `.changes` property.
	 */
	router.post("/:hintId/dismiss", async (c) => {
		const userId = c.get("userId");
		const hintId = c.req.param("hintId");

		if (!isHintId(hintId)) {
			return c.json({ error: "Unknown hint ID", code: "VALIDATION_ERROR" }, 400);
		}

		// INSERT OR IGNORE — atomic, no race condition. `inserted` tells us whether it inserted.
		const { inserted } = await dismissHint(db, userId, hintId);

		if (!inserted) {
			return c.json({ error: "Already dismissed", code: "CONFLICT" }, 409);
		}

		return c.json({ ok: true });
	});

	return router;
}
