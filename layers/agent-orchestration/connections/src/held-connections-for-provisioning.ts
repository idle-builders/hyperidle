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
 * @lore AU26 E3 — WHY THE OWNER IS A PARAMETER, and why it is not resolved here.
 * K1's helper resolved the owner itself, by asking core-api's `users` for the
 * single human and falling back to a hardcoded founder-id sentinel when there
 * was none. `users` is core-api's domain, and orchestration reads ZERO
 * core-api state (AU21 AC#2, zero carve-outs; the founder's framing is that
 * orchestration is a blind, purely request-driven executor). Injecting a
 * `findUser` port down here would be that read wearing a different hat, and
 * the anti-regrowth guard exists to catch exactly that.
 *
 * So the owner is not resolved here — it is HANDED DOWN. The Application
 * composition root (`remote-server/create-server.ts`) resolves the owning
 * human and closes over the id when it wires
 * `ProvisionSessionDeps.heldConnections`; this function filters on the value
 * it is given. Two properties follow, and both matter:
 *   - **Scope.** One spawn's plan carries ONE human's held connections. A
 *     second human's plaintext tokens can never land in another human's
 *     agent's sandbox — which is live behaviour, not hypothetical, under the
 *     shipped `HYPERIDLE_SHARED_MODE` + invite codes.
 *   - **Attribution.** Every returned row still carries its own `userId`, and
 *     the decrypt step resolves each row against THAT owner
 *     (`ServiceConnectionResolver.resolve(row.userId, row.id)`), so a row can
 *     never be decrypted under an identity that is not its own. K1's shape
 *     resolved every row under one guessed id and silently dropped any row
 *     whose real owner differed.
 *
 * A first cut of this function took no `userId` at all and returned every
 * held row in the deployment. That was inert under the locked single-founder
 * deployment (`authorization-model.md:32`) and a real disclosure widening the
 * moment a second human joins — N owners' tokens in one sandbox. Not repeated:
 * this signature makes the omission impossible to write.
 *
 * When per-session multi-tenancy arrives, the owner has to be carried on the
 * REQUEST by the emitting core-api resolver (core knows who the session is
 * for; orchestration must not go looking) rather than closed over per
 * deployment at boot. That changes where the argument comes from, not this
 * function.
 */

import { type HyperIdleDb, serviceConnections } from "@hyperidle/db";
import { HELD_AUTH_SOURCES, type HeldAuthSource } from "@hyperidle/domain-model";
import { and, eq, inArray } from "drizzle-orm";

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
 * Read `ownerUserId`'s held (`token` | `mcp`) connections, live, for one
 * session spawn. Never another human's — see this file's top `@lore`.
 *
 * The `authSource` filter is the same one the deleted `GET
 * /connections/provisioning` seam route applied, kept so a future row with a
 * non-held auth source can never silently widen a provisioning plan. The
 * `userId` filter is the same one AN1 put on every CRUD path
 * (`agent-orchestration/src/routes/connections.ts`) — this Service enforces
 * per-user isolation at the spawn exactly as it does at the route.
 */
export async function listHeldConnectionsForProvisioning(
	db: HyperIdleDb,
	ownerUserId: string,
): Promise<readonly HeldConnectionForProvisioning[]> {
	const rows = await db
		.select()
		.from(serviceConnections)
		.where(
			and(
				eq(serviceConnections.userId, ownerUserId),
				inArray(serviceConnections.authSource, [...HELD_AUTH_SOURCES]),
			),
		);

	return rows.map((row) => ({
		id: row.id,
		userId: row.userId,
		service: row.service,
		authSource: row.authSource as HeldAuthSource,
		serverUrl: row.serverUrl ?? null,
	}));
}
