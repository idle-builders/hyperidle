/**
 * AU21 §9 Increment 12 follow-up part 2 (F2 gap closure — connections).
 *
 * Decision H3 already established the pattern: core bakes everything a
 * session needs into the request AT EMIT TIME, so run-orchestration never
 * reads core-api back at provisioning time. Decision F2 (Increment 8) left
 * ONE seam call standing that H3's later, more complete principle should have
 * superseded but never revisited: `CoreApiPort.connections
 * .listHeldConnectionsForProvisioning()`, backed by the now-deleted
 * `GET /connections/provisioning` route — the SAME class of gap
 * `resolveInjectedFilesystemsForAgent` already closed for filesystems.
 *
 * This function is the shared, intra-Service helper every per-kind emit-time
 * resolver calls (via an injected Mechanism-C dep, since none of them can
 * import `@hyperidle/connections` directly) to bake the owning human's held
 * connections onto its request payload. It reproduces the deleted route's
 * exact mapping so a caller baking this output gets byte-for-byte the same
 * shape the old seam route returned. NEVER includes `encryptedToken` (AN1
 * hard-rule 1) — the decrypt step stays a separate, Application-composed
 * direct dependency, unaffected by this move.
 *
 * `findUser` is injected (not statically imported) — `@hyperidle/connections`
 * cannot import `@hyperidle/users` directly (Mechanism C). A held connection
 * is scoped to the single owning human, never per-agent (AN2: "Single-founder
 * is the locked deployment") — this resolves the SAME human every caller of
 * the old seam route always resolved.
 */

import type { HyperIdleDb, User } from "@hyperidle/db";
import { listConnections } from "./service-connection-store.js";

/** One held connection's provisioning-relevant fields — mirrors the deleted `GET /connections/provisioning` route's response element. NEVER includes `encryptedToken`. */
export interface InjectedConnectionForAgent {
	readonly id: string;
	readonly service: string;
	readonly authSource: "token" | "mcp";
	readonly serverUrl: string | null;
}

/** Mirrors the deleted `GET /connections/provisioning` route's response body. */
export interface InjectedConnectionsForAgent {
	readonly userId: string;
	readonly connections: readonly InjectedConnectionForAgent[];
}

/**
 * Resolve the owning human's held connections, in the exact shape the OLD
 * `GET /connections/provisioning` seam route returned. `agentId` is accepted
 * for call-site signature uniformity with every other per-kind resolver's
 * baked deps but is unused internally (see top-of-file `@lore`).
 */
export async function resolveInjectedConnectionsForAgent(
	db: HyperIdleDb,
	_agentId: string,
	findUser: (db: HyperIdleDb, query: { kind: "human" }) => Promise<User | undefined>,
): Promise<InjectedConnectionsForAgent> {
	const humanUser = await findUser(db, { kind: "human" });
	// @lore K1 (AU21 review): `?? "u-founder"` is a faithful carry-over of the
	// DELETED `GET /connections/provisioning` route's exact fallback (was
	// `routes/connections.ts` pre-K1), not new behavior this fix introduces.
	// Pre-existing, already-accepted idiom under AN2's single-founder-only
	// deployment lock — same sentinel used in `middleware/auth.ts:168` and
	// `policy/lifecycle-propagation.ts:472`. Safe here because a held
	// connection is scoped to the ONE owning human regardless of caller
	// identity (see top-of-file @lore); this never resolves the wrong
	// per-agent user, only the fixed single founder record.
	const userId = humanUser?.id ?? "u-founder";
	const rows = await listConnections(db, { userId });
	return {
		userId,
		connections: rows.map((row) => ({
			id: row.id,
			service: row.service,
			authSource: row.authSource as "token" | "mcp",
			serverUrl: row.serverUrl ?? null,
		})),
	};
}
