/**
 * L2 — Founder identity helpers.
 *
 * Centralises the "is this approver id a registered founder actor?"
 * predicate so route handlers (POST /api/conversations/responses) and
 * any future verdict path use the same source of truth.
 *
 * @lore L2 review (adversary W2): the predicate was previously hand-
 * coded as an INNER JOIN against `actors` inside `routes/conversations.ts`.
 * Pulling it here removes the cross-module coupling and gives the
 * invariant a single named test surface.
 *
 * @lore L2 review (security CRIT-2): `body.approverId` from the wire
 * MUST NEVER be allowed to claim a founder id (`actor:ceo`,
 * `actor:cpo`, …). Programmatic actors (e.g. `policy_engine`) write
 * verdicts via `body.approverId`; founders write via the server-derived
 * `c.get("actorId")`. The two namespaces must not collide.
 */
import { actors, type HyperIdleDb } from "@hyperidle/db";
import { eq } from "drizzle-orm";

/**
 * Returns true when the given id matches a row in `actors`.
 * Returns false for null/empty/programmatic ids.
 *
 * Accepts `HyperIdleDb` — drizzle transaction handles are structurally
 * compatible (same `select` shape) and may be passed as the `db`
 * parameter without an extra type. See `practice-meeting.ts` for the
 * same pattern.
 */
export function isFounderActor(approverId: string | null | undefined, db: HyperIdleDb): boolean {
	if (!approverId) return false;
	const row = db.select().from(actors).where(eq(actors.id, approverId)).get();
	return Boolean(row);
}
