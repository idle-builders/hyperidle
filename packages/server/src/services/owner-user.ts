/**
 * AN2 — Owner user resolution.
 *
 * Resolves the owning human user's ID for the single-human-user model.
 * Used inside provisionSession to thread ownerUserId into ToolContext without
 * requiring an HTTP request context (which provisioning doesn't have).
 *
 * @lore AN2: This is the EXACT same lookup as auth.ts:234-235 (verified):
 *   db.select().from(users).where(eq(users.kind, "human")).limit(1)
 *   fallback: "u-founder"
 * The same pattern appears in auth.ts, settings.ts, users.ts, teams-routes.ts.
 * It is the canonical way to resolve the single human owner in HyperIdle's
 * current single-user model.
 *
 * @lore AN2: When multi-user / team-shared Connections arrive (out of scope for AN2),
 * this is the SINGLE seam that changes — e.g. "task → owning human" or "team → human
 * owner". The broker (wrapBrokeredTool / resolveConnectorTools) never hardcodes the user.
 * ProvisionSessionParams does NOT gain ownerUserId — resolution is internal to
 * provisionSession so routines-routes.ts (which has no HTTP userId) works unchanged.
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";

/**
 * Resolve the owning human user's ID.
 *
 * Returns the first `kind="human"` user's id, or the fallback `"u-founder"` if
 * no human user exists (mirrors auth.ts:234-235 exactly).
 */
export async function resolveOwnerUserId(db: HyperIdleDb): Promise<string> {
	const [human] = await db.select().from(users).where(eq(users.kind, "human")).limit(1);
	return human?.id ?? "u-founder";
}
