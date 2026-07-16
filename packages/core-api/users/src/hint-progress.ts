/**
 * HintProgress store — P5 first-time hint dismissal tracking.
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, hintProgress
 * sub-item — the LAST sub-item of the full sweep): moved verbatim (behavior-
 * preserving) from `packages/core-api/src/routes/hints.ts`'s inline Drizzle
 * calls. `hintProgress` cascades from `users.id` and had exactly one real
 * accessor in the whole codebase (`routes/hints.ts`) — a clear FK-anchored
 * domain home, same shape as `teamMembers`/`taskPlanningSignals` before their
 * owning Service was assigned (see `scripts/table-ownership-guard.ts`'s
 * `TABLE_OWNER` row + `plans/AU19/architecture.md` §12 hintProgress ruling).
 * `routes/hints.ts` now calls `listDismissedHints`/`dismissHint` instead of
 * querying `hintProgress` directly — the route file itself stays in
 * `core-api/src/routes` (Mechanism-C composition-root shape, no need to
 * relocate the Hono router into the Service package).
 *
 * @lore P5 (PGlite migration): `dismissHint` uses INSERT ... ON CONFLICT DO
 * NOTHING with RETURNING to detect whether the row was inserted (non-empty
 * result) or already existed (empty result). This avoids the SELECT-then-
 * INSERT TOCTOU race condition and does not rely on the SQLite-only
 * `.changes` property.
 */

import { type HyperIdleDb, hintProgress } from "@hyperidle/db";
import { eq } from "drizzle-orm";

export interface DismissedHint {
	hintId: string;
	seenAt: string;
}

/**
 * List all hints the given user has dismissed.
 */
export async function listDismissedHints(
	db: HyperIdleDb,
	userId: string,
): Promise<DismissedHint[]> {
	const rows = await db.select().from(hintProgress).where(eq(hintProgress.userId, userId));
	return rows.map((r) => ({ hintId: r.hintId, seenAt: r.seenAt }));
}

/**
 * Record that a user has dismissed a hint. Idempotent — a repeat dismissal
 * is ignored (ON CONFLICT DO NOTHING on the composite (userId, hintId) PK).
 *
 * Returns `{ inserted: true }` on first dismiss, `{ inserted: false }` if
 * the hint was already dismissed (caller maps this to a 409).
 */
export async function dismissHint(
	db: HyperIdleDb,
	userId: string,
	hintId: string,
): Promise<{ inserted: boolean }> {
	const inserted = await db
		.insert(hintProgress)
		.values({
			userId,
			hintId,
			seenAt: new Date().toISOString(),
		})
		.onConflictDoNothing()
		.returning({ hintId: hintProgress.hintId });

	return { inserted: inserted.length > 0 };
}
