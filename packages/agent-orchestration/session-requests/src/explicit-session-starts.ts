import { type ExplicitSessionStart, explicitSessionStarts, type HyperIdleDb } from "@hyperidle/db";
import { eq } from "drizzle-orm";

/**
 * @lore AU19 Increment 3c: this Service's `explicitSessionStarts` reader/
 * writer surface for the boot-time drain — surfaced migrating
 * `run-orchestration` (`agent-layer-boot.ts`'s `drainAgentSessionRequests`),
 * which raw-read/wrote `explicitSessionStarts` directly pre-migration (the
 * requested-model-tier read before admission, plus the admitted/failed
 * status projection after). `explicitSessionStarts` is already `TABLE_OWNER`
 * for this Service (see `agent-work-intents.ts`'s reaper) — this file adds
 * the request-scoped single-row reader/writers the drain needs, closing
 * another foreign-nested-package accessor the same way
 * `findAgentSessionRequestBySessionId`/`findAgentSessionRequestById` closed
 * theirs. `routes/sessions-routes.ts`'s own raw `explicitSessionStarts`
 * access is UNCHANGED — it lives in `packages/server` (the still-unguarded
 * composition root, `table-ownership-guard.ts`'s scan scope), out of this
 * migration's scope.
 */

/** Single-row read by id — the pre-admission requested-model-tier lookup. */
export async function findExplicitSessionStartById(
	db: HyperIdleDb,
	id: string,
): Promise<ExplicitSessionStart | undefined> {
	const [row] = await db
		.select()
		.from(explicitSessionStarts)
		.where(eq(explicitSessionStarts.id, id))
		.limit(1);
	return row;
}

/** Post-admission success projection: requestId + sessionId, status → admitted. */
export async function markExplicitSessionStartAdmitted(
	db: HyperIdleDb,
	input: { id: string; requestId: string; sessionId: string },
): Promise<void> {
	await db
		.update(explicitSessionStarts)
		.set({
			status: "admitted",
			requestId: input.requestId,
			sessionId: input.sessionId,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(explicitSessionStarts.id, input.id));
}

/** Post-admission-attempt failure projection: status → failed, stable failureCode. */
export async function markExplicitSessionStartFailed(
	db: HyperIdleDb,
	input: { id: string; failureCode: string },
): Promise<void> {
	await db
		.update(explicitSessionStarts)
		.set({ status: "failed", failureCode: input.failureCode, updatedAt: new Date().toISOString() })
		.where(eq(explicitSessionStarts.id, input.id));
}
