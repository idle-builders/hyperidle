/**
 * L15 § 2.6 — task-scoped authz chokepoint.
 *
 * Resolution order:
 *   1. senderId === DEFAULT_FOUNDER_ID ("u-founder") → ok (global founder bypass)
 *   2. agents.id === senderId AND role === "founder" → ok (multi-founder)
 *   3. agents.id === senderId AND team_id === task.team_id → ok (same team)
 *   4. otherwise → 404 (anti-information-leak per L15-plan §10 row 10)
 *
 * @lore L15 § 2.6: cross-team callers receive 404, NOT 403. Returning 403 leaks
 * task existence; returning 404 keeps the team boundary opaque.
 *
 * @lore L15 security CRITICAL-1 (pre-existing, NOT a tenant chokepoint):
 * The current `X-Identity` header is read directly from the HTTP request
 * without binding it to the API key. Any holder of `HYPERIDLE_API_KEY`
 * can assert any identity, including `u-founder`. THIS IS NOT A TENANT
 * BOUNDARY until an identity-binding middleware lands (see
 * `docs/work-packages/follow-ups.md` row `auth-identity-binding`).
 * Treat this assertion as "API-key-holder boundary only" until then.
 */

import { agents, type HyperIdleDb, type Task } from "@hyperidle/db";
import { eq } from "drizzle-orm";

export const DEFAULT_FOUNDER_ID = "u-founder";
export const SENDER_HEADER = "X-Identity";

export function readSenderId(c: { req: { header: (k: string) => string | undefined } }): string {
	return c.req.header(SENDER_HEADER) ?? DEFAULT_FOUNDER_ID;
}

export type TaskAuthzResult =
	| { ok: true }
	| { ok: false; status: 404; code: string; message: string };

function notFound(): TaskAuthzResult {
	return { ok: false, status: 404, code: "not_found", message: "Task not found" };
}

export function assertTaskParticipantAuthz(
	db: HyperIdleDb,
	senderId: string,
	task: Task,
): TaskAuthzResult {
	if (senderId === DEFAULT_FOUNDER_ID) return { ok: true };

	const agent = db.select().from(agents).where(eq(agents.id, senderId)).get();
	if (!agent) return notFound();
	if (agent.role === "founder") return { ok: true };
	if (agent.teamId === task.teamId) return { ok: true };
	return notFound();
}
