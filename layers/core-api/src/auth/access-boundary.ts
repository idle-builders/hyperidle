/**
 * AF11 — Access boundary chokepoint.
 *
 * The single decision function for every read/write authorization check.
 * Pure predicate — no DB round-trips. Routes pass what they already loaded.
 *
 * @lore AF11: host-scope deliberately returns true for any authenticated
 * Principal — today's single-product semantics (Hard Rule 5: no over-restriction).
 * Tightening to host-membership is the documented future hook, NOT a bug.
 * Never widen participant-scope to true.
 *
 * @lore AF11: The HOST_SCOPE map is the closure contract. Adding a new
 * HostKind requires updating this map AND the authorization model doc
 * (docs/architecture/authorization-model.md). Omitting a kind is a compile
 * error (exhaustive Record<HostKind, AccessScope>).
 */

import type { HostKind } from "@hyperidle/domain-model";

/** Two scopes: participant-scope (user/agent hosts) vs host-scope (everything else). */
export type AccessScope = "participant" | "host";

/**
 * Closed host-kind vocabulary (mirrors the locked model's scope table).
 * Every HostKind maps to exactly one scope. Adding a kind requires updating
 * this map first.
 *
 * participant-scope: user, agent (DM / assistant threads — visible only to participants)
 * host-scope: everything else (bet, task, knowledge_item, artifact, team, factory)
 *   → any authenticated principal can read (Hard Rule 5).
 */
export const HOST_SCOPE: Readonly<Record<HostKind, AccessScope>> = {
	user: "participant",
	agent: "participant",
	task: "host",
	knowledge_item: "host",
	team: "host",
	factory: "host",
};

/**
 * The resource descriptor the chokepoint consumes.
 * Routes pass what they already loaded — no extra DB round-trip.
 */
export interface AuthorizableResource {
	hostKind: HostKind;
	hostId: string;
	/** Required for participant-scope; ignored for host-scope. */
	participants?: ReadonlyArray<string>;
}

/**
 * Pure predicate. principal is c.get("userId"). No DB round-trip.
 *
 * host-scope → true (any authenticated principal)
 * participant-scope → principal ∈ participants
 */
export function canRead(principal: string, resource: AuthorizableResource): boolean {
	const scope = HOST_SCOPE[resource.hostKind];
	if (scope === "host") {
		// host-scope: any authenticated Principal (Hard Rule 5 — no over-restriction)
		return true;
	}
	// participant-scope: principal must be in the participants list
	return (resource.participants ?? []).includes(principal);
}

/**
 * Writes use the same boundary today; kept separate so future write-only
 * tightening has a seam.
 *
 * @lore AF11: canWrite mirrors canRead today. When host-membership tightening
 * is added for writes (e.g. only bet members can commit), widen the divergence
 * here without touching canRead.
 */
export function canWrite(principal: string, resource: AuthorizableResource): boolean {
	return canRead(principal, resource);
}
