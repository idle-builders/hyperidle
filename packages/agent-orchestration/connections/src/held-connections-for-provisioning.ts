/**
 * AU26 E3 (AU21 Decision J3) — the session-launch-time held-connection read,
 * in-layer.
 *
 * This replaces AU21 Decision K1's bake-at-emit mechanism outright. K1 froze
 * the owning human's connection list onto every emitted intent because
 * `service_connections` still lived in core-api and `run-orchestration` was
 * forbidden to read it. That snapshot went stale between emit and drain: a
 * connection added in that window never reached the sandbox, silently. K1 was
 * known-throwaway when it shipped. Now that this Service owns the table inside
 * `agent-orchestration`, the spawn reads the record live and the staleness
 * window closes (AC1(c)).
 *
 * @lore AU26 E3 — WHY THIS TAKES NO `userId`, and why that is not a widening.
 * K1's helper resolved the owner as `findUser(db, { kind: "human" }) ??
 * "u-founder"` — a `users` read. `users` is core-api's domain, and
 * orchestration reads ZERO core-api state (AU21 AC#2, zero carve-outs; the
 * founder's own framing is that orchestration is a blind, purely
 * request-driven executor). Injecting a `findUser` port down here would be
 * that read wearing a different hat, and the anti-regrowth guard exists to
 * catch exactly that. So the owner is not resolved at all: every held row
 * already carries its own `userId`, and each row's token is resolved against
 * THAT owner (`ServiceConnectionResolver.resolve(row.userId, row.id)`).
 *
 * Under AN2's locked single-founder deployment (`authorization-model.md:32`)
 * every held row belongs to the one human, so this returns exactly what K1's
 * helper returned. It is strictly SAFER than the old shape, not looser: the
 * old code resolved every connection under one guessed owner id and silently
 * dropped any row whose real owner differed (including whenever the human's id
 * was not literally `u-founder`); this one can never resolve a row against the
 * wrong user, because it never guesses. Per-user isolation stays where AN1 put
 * it — in the resolver's `AND(id, userId)` query.
 *
 * When multi-tenancy arrives, the per-agent owner has to be carried on the
 * request by the emitting core-api resolver (core knows who the session is
 * for; orchestration must not go looking). This function then filters on that
 * value instead of returning every row.
 */

import { type HyperIdleDb, serviceConnections } from "@hyperidle/db";
import { HELD_AUTH_SOURCES, type HeldAuthSource } from "@hyperidle/shared";
import { inArray } from "drizzle-orm";

/**
 * One held connection's provisioning-relevant fields. NEVER includes
 * `encryptedToken` — the decrypt step is `ServiceConnectionResolver`, the only
 * plaintext path (AN1 hard-rule 1), called separately at spawn.
 */
export interface HeldConnectionForProvisioning {
	readonly id: string;
	/** The owning user this row's token must be resolved against. */
	readonly userId: string;
	readonly service: string;
	readonly authSource: HeldAuthSource;
	readonly serverUrl: string | null;
}

/**
 * Read every held (`token` | `mcp`) connection, live, for one session spawn.
 *
 * The `authSource` filter is the same one the deleted `GET
 * /connections/provisioning` seam route applied, kept so a future row with a
 * non-held auth source can never silently widen a provisioning plan.
 */
export async function listHeldConnectionsForProvisioning(
	db: HyperIdleDb,
): Promise<readonly HeldConnectionForProvisioning[]> {
	const rows = await db
		.select()
		.from(serviceConnections)
		.where(inArray(serviceConnections.authSource, [...HELD_AUTH_SOURCES]));

	return rows.map((row) => ({
		id: row.id,
		userId: row.userId,
		service: row.service,
		authSource: row.authSource as HeldAuthSource,
		serverUrl: row.serverUrl ?? null,
	}));
}
